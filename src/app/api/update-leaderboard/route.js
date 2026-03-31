import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 60;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function GET(req) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processLeaderboard();
    return NextResponse.json({ 
      success: true, 
      processed: result?.count || 0,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("[Pipeline] Fatal error:", err.message);
    return NextResponse.json({ 
      success: false, 
      error: err.message 
    }, { status: 500 });
  }
}

async function processLeaderboard() {
  const supabase = getSupabase();

  try {
    console.log("[Pipeline] Started");

    // 1. Get last timestamp
    const { data: meta } = await supabase
      .from("meta")
      .select("value")
      .eq("key", "last_processed_time")
      .single();

    const lastTime = meta?.value || "0";
    console.log("[Pipeline] Last processed time:", lastTime);

    // 2. Fetch recent trades (max limit 1000) using public Data API
    const tradesRes = await fetch("https://data-api.polymarket.com/trades?limit=1000", {
      headers: { Accept: "application/json" },
    });
    
    if (!tradesRes.ok) throw new Error(`Trades API: ${tradesRes.status}`);
    const allTrades = await tradesRes.json();

    if (!Array.isArray(allTrades) || allTrades.length === 0) {
      console.log("[Pipeline] No trades from API.");
      return;
    }

    // 3. Filter for NEW trades and specifically BTC 15-Min markets
    const newBtcTrades = allTrades.filter((t) => {
      // Data API timestamps are in seconds (e.g., 1774952219)
      const tradeTimeIso = new Date(t.timestamp * 1000).toISOString();
      const isNew = lastTime === "0" ? true : new Date(tradeTimeIso) > new Date(lastTime);
      
      const isBtc = (t.title || "").toLowerCase().includes("btc");
      const is15m = (t.title || "").includes("15");
      return isNew && isBtc && is15m;
    });

    if (lastTime === "0" && newBtcTrades.length > 200) {
      newBtcTrades.length = 200; // Cap first run
    }

    if (newBtcTrades.length === 0) {
      console.log("[Pipeline] No new BTC 15m trades since last run.");
      return;
    }

    console.log(`[Pipeline] ${newBtcTrades.length} new BTC 15m trades to process.`);

    // 4. Resolve market outcomes by fetching event details for each unique slug
    const uniqueSlugs = [...new Set(newBtcTrades.map(t => t.eventSlug).filter(Boolean))];
    const marketWinners = {}; // Maps conditionId -> winning outcome

    console.log(`[Pipeline] Fetching resolutions for ${uniqueSlugs.length} unique events...`);
    
    await Promise.all(uniqueSlugs.map(async (slug) => {
      try {
        const evRes = await fetch(`https://gamma-api.polymarket.com/events?slug=${slug}`);
        if (!evRes.ok) return;
        const events = await evRes.json();
        
        if (events && events[0] && Array.isArray(events[0].markets)) {
           const market = events[0].markets[0];
           // market.winner is stringified array or missing. example: '["Up"]' or '"Up"'
           if (market && market.conditionId && market.winner) {
              let parsedWinner = market.winner;
              try { parsedWinner = JSON.parse(market.winner)[0]; } catch(e) {}
              marketWinners[market.conditionId] = parsedWinner;
           }
        }
      } catch (err) {
        console.error(`[Pipeline] Error fetching event ${slug}:`, err.message);
      }
    }));

    console.log(`[Pipeline] Found ${Object.keys(marketWinners).length} resolved markets in this batch.`);

    // 5. Build Aggregation and Trades Upsert
    const usersBatch = {};
    const tradeUpserts = [];

    newBtcTrades.forEach((trade) => {
      // Data API fields: proxyWallet, conditionId, transactionHash, outcome
      const wallet = trade.proxyWallet || trade.user;
      const conditionId = trade.conditionId || trade.market_id;
      const id = trade.transactionHash || trade.id;
      const outcome = trade.outcome;
      
      if (!wallet || !id) return;

      // Determine if they won (returns false if market is unresolved)
      const isWin = !!(marketWinners[conditionId] && marketWinners[conditionId] === outcome);

      tradeUpserts.push({
        id: id,
        wallet: wallet,
        market_id: conditionId,
        outcome: outcome,
        is_win: isWin,
        timestamp: new Date(trade.timestamp * 1000).toISOString(),
      });

      if (!usersBatch[wallet]) {
        usersBatch[wallet] = { wallet, wins: 0, total_trades: 0 };
      }
      usersBatch[wallet].total_trades++;
      if (isWin) {
        usersBatch[wallet].wins++;
      }
    });

    // 6. Bulk Insert Trades (for 24h leaderboard)
    if (tradeUpserts.length > 0) {
      const chunkSize = 100;
      for (let i = 0; i < tradeUpserts.length; i += chunkSize) {
        const chunk = tradeUpserts.slice(i, i + chunkSize);
        const { error } = await supabase.from("trades").upsert(chunk, { onConflict: "id" });
        if (error) console.error("[Pipeline] Trades insert error:", error.message);
      }
      console.log(`[Pipeline] Saved ${tradeUpserts.length} indv. trade records.`);
    }

    // 7. Atomic Bulk Increment (for all-time stats)
    const updates = Object.values(usersBatch);
    if (updates.length > 0) {
      const { error: rpcError } = await supabase.rpc("increment_user_stats_bulk", { updates });
      if (rpcError) throw rpcError;
      console.log(`[Pipeline] Updated overall stats for ${updates.length} users.`);
    }

    // 8. Save latest timestamp (Data API sorts newest first)
    const latestTimestamp = newBtcTrades[0]?.timestamp;
    if (latestTimestamp) {
      const nextTimestampIso = new Date(latestTimestamp * 1000).toISOString();
      await supabase.from("meta").upsert({ 
        key: "last_processed_time", 
        value: nextTimestampIso 
      });
      console.log("[Pipeline] Timestamp saved:", nextTimestampIso);
    }

    console.log("[Pipeline] Complete ✅");
    return { count: newBtcTrades.length };
  } catch (err) {
    console.error("[Pipeline] ERROR:", err.message);
    throw err; // Rethrow to catch in GET handler
  }
}
