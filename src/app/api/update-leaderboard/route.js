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

    // 3. Filter for NEW trades and specifically BTC 15-Min OR 5-Min markets
    const newBtcTrades = allTrades.filter((t) => {
      const tradeTimeIso = new Date(t.timestamp * 1000).toISOString();
      const isNew = lastTime === "0" ? true : new Date(tradeTimeIso) > new Date(lastTime);
      
      const title = (t.title || "").toLowerCase();
      const slug = (t.eventSlug || "").toLowerCase();
      const isBtc = title.includes("btc") || slug.includes("btc");
      const is5m = title.includes("5") || slug.includes("5");
      const is15m = title.includes("15") || slug.includes("15");
      return isNew && isBtc && (is15m || is5m);
    });

    if (lastTime === "0" && newBtcTrades.length > 300) {
      newBtcTrades.length = 300; // Cap first run slightly higher for dual market
    }

    if (newBtcTrades.length === 0) {
      console.log("[Pipeline] No new BTC trades (5m/15m) since last run.");
      return;
    }

    console.log(`[Pipeline] ${newBtcTrades.length} new BTC trades to process.`);

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
      const wallet = trade.proxyWallet || trade.user;
      const conditionId = trade.conditionId || trade.market_id;
      const id = trade.transactionHash || trade.id;
      const outcome = trade.outcome;
      
      const title = (trade.title || "").toLowerCase();
      const slug = (trade.eventSlug || "").toLowerCase();
      const marketType = (title.includes("5") || slug.includes("5")) ? "btc_5m" : "btc_15m";

      if (!wallet || !id) return;

      const isWin = !!(marketWinners[conditionId] && marketWinners[conditionId] === outcome);

      tradeUpserts.push({
        id: id,
        wallet: wallet,
        market_id: conditionId,
        market_type: marketType,
        outcome: outcome,
        is_win: isWin,
        timestamp: new Date(trade.timestamp * 1000).toISOString(),
      });

      const statsKey = `${wallet}_${marketType}`;
      if (!usersBatch[statsKey]) {
        usersBatch[statsKey] = { wallet, market_type: marketType, wins: 0, total_trades: 0 };
      }
      usersBatch[statsKey].total_trades++;
      if (isWin) {
        usersBatch[statsKey].wins++;
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

    // 7. Update user stats for specific market types
    const statsList = Object.values(usersBatch);
    if (statsList.length > 0) {
      // Fetch current stats to avoid resetting totals since we're using a simple upsert logic for now
      // A better way would be an RPC or atomic increment, but for a simple multi-market upsert to work properly, 
      // we'll use a direct upsert which replaces the row.
      const { data: currentStats } = await supabase
        .from("users_stats")
        .select("*")
        .in("wallet", statsList.map(s => s.wallet));

      const statsToUpsert = statsList.map(stat => {
        const existing = (currentStats || []).find(c => c.wallet === stat.wallet && c.market_type === stat.market_type);
        const totalWins = (existing?.wins || 0) + stat.wins;
        const totalTrades = (existing?.total_trades || 0) + stat.total_trades;
        
        return {
          wallet: stat.wallet,
          market_type: stat.market_type,
          wins: totalWins,
          total_trades: totalTrades,
          win_rate: totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0,
          last_updated: new Date().toISOString()
        };
      });

      console.log(`[Pipeline] Upserting unique stats for ${statsToUpsert.length} records`);

      const { error: statsError } = await supabase
        .from("users_stats")
        .upsert(statsToUpsert, { 
          onConflict: "wallet,market_type",
          ignoreDuplicates: false 
        });
      
      if (statsError) {
        console.error("[Pipeline] Stats upsert failed:", JSON.stringify(statsError, null, 2));
        throw new Error(`Stats Upsert Failure: ${statsError.message}`);
      }
      console.log(`[Pipeline] Updated multi-market stats successfully.`);
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
