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

  const { searchParams } = new URL(req.url);
  const forceAll = searchParams.get("forceAll") === "true";

  try {
    const result = await processLeaderboard(forceAll);
    return NextResponse.json({ 
      success: true, 
      processed: result?.count || 0,
      forceAll,
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

async function processLeaderboard(forceAll = false) {
  const supabase = getSupabase();

  try {
    console.log(`[Pipeline] Started (forceAll: ${forceAll})`);

    let tradesToProcess = [];

    if (forceAll) {
      // Fetch all trades from DB to re-process resolution
      const { data: dbTrades, error: dbError } = await supabase
        .from("trades")
        .select("*");
      
      if (dbError) throw dbError;
      tradesToProcess = dbTrades.map(t => ({
        ...t,
        eventSlug: null, // We'll rely on market_id (conditionId)
        conditionId: t.market_id,
        user: t.wallet,
        transactionHash: t.id,
        timestamp: new Date(t.timestamp).getTime() / 1000
      }));
      console.log(`[Pipeline] Re-processing ${tradesToProcess.length} database trades.`);
    } else {
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
      tradesToProcess = allTrades.filter((t) => {
        const tradeTimeIso = new Date(t.timestamp * 1000).toISOString();
        const isNew = lastTime === "0" ? true : new Date(tradeTimeIso) > new Date(lastTime);
        
        const title = (t.title || "").toLowerCase();
        const slug = (t.eventSlug || "").toLowerCase();
        const isBtc = title.includes("btc") || slug.includes("btc");
        const is5m = title.includes("5") || slug.includes("5");
        const is15m = title.includes("15") || slug.includes("15");
        return isNew && isBtc && (is15m || is5m);
      });

      if (lastTime === "0" && tradesToProcess.length > 500) {
        tradesToProcess.length = 500;
      }
    }

    if (tradesToProcess.length === 0) {
      console.log("[Pipeline] No trades to process.");
      return;
    }

    console.log(`[Pipeline] Processing ${tradesToProcess.length} BTC trades.`);

    // 4. Resolve market outcomes by fetching condition details from CLOB API
    const uniqueConditionIds = [...new Set(tradesToProcess.map(t => t.conditionId || t.market_id).filter(Boolean))];
    const marketWinners = {}; // Maps conditionId -> winning outcome name ("Up"/"Down")

    console.log(`[Pipeline] Fetching resolutions for ${uniqueConditionIds.length} unique market IDs...`);
    
    // Process in smaller batches to respect CLOB API limits
    const batchSize = 5;
    for (let i = 0; i < uniqueConditionIds.length; i += batchSize) {
      const batch = uniqueConditionIds.slice(i, i + batchSize);
      await Promise.all(batch.map(async (cid) => {
        try {
          // CLOB API provides explicit winner flag in tokens
          const clobRes = await fetch(`https://clob.polymarket.com/markets/${cid}`);
          if (!clobRes.ok) return;
          const marketData = await clobRes.json();
          
          if (marketData && marketData.closed && Array.isArray(marketData.tokens)) {
            const winnerToken = marketData.tokens.find(t => t.winner === true);
            if (winnerToken) {
              marketWinners[cid] = winnerToken.outcome; // "Up" or "Down"
              console.log(`[Pipeline] Market ${cid} resolved to: ${winnerToken.outcome}`);
            }
          }
        } catch (err) {
          console.error(`[Pipeline] Error fetching CLOB market ${cid}:`, err.message);
        }
      }));
      // Small cooling delay
      if (uniqueConditionIds.length > batchSize) await new Promise(r => setTimeout(r, 200));
    }

    console.log(`[Pipeline] Found ${Object.keys(marketWinners).length} resolved winners in this batch.`);

    // 5. Build Aggregation and Trades Upsert
    const usersBatch = {};
    const tradeUpserts = [];

    // Reset stats if forceAll is used, or we handle it in the upsert below
    if (forceAll) {
       console.log("[Pipeline] Force re-sync: Recalculating wins from scratch.");
       // Note: We'll calculate totals locally and then replace in DB
    }

    tradesToProcess.forEach((trade) => {
      const wallet = trade.proxyWallet || trade.user || trade.wallet;
      const conditionId = trade.conditionId || trade.market_id;
      const id = trade.transactionHash || trade.id;
      const outcome = trade.outcome;
      
      const title = (trade.title || trade.market_title || "").toLowerCase();
      const slug = (trade.eventSlug || "").toLowerCase();
      
      // Determine type (defaulting to 15m if unclear)
      let marketType = "btc_15m";
      if (title.includes("5") || slug.includes("5")) {
        marketType = "btc_5m";
      }

      if (!wallet || !id) return;

      const resolvedWinner = marketWinners[conditionId];
      const isWin = !!(resolvedWinner && resolvedWinner === outcome);

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

    // 6. Bulk Insert Trades
    if (tradeUpserts.length > 0) {
      const chunkSize = 100;
      for (let i = 0; i < tradeUpserts.length; i += chunkSize) {
        const chunk = tradeUpserts.slice(i, i + chunkSize);
        const { error } = await supabase.from("trades").upsert(chunk, { onConflict: "id" });
        if (error) console.error("[Pipeline] Trades insert error:", error.message);
      }
      console.log(`[Pipeline] Saved ${tradeUpserts.length} trade records.`);
    }

    // 7. Update user stats
    const statsList = Object.values(usersBatch);
    if (statsList.length > 0) {
      const { data: currentStats } = await supabase
        .from("users_stats")
        .select("*");

      const statsToUpsert = statsList.map(stat => {
        // If forceAll, we are calculating from the full local set, but we might still want to merge if we didn't fetch ALL history
        const existing = (currentStats || []).find(c => c.wallet === stat.wallet && c.market_type === stat.market_type);
        
        let totalWins = stat.wins;
        let totalTrades = stat.total_trades;

        if (!forceAll) {
          totalWins += (existing?.wins || 0);
          totalTrades += (existing?.total_trades || 0);
        }
        
        return {
          wallet: stat.wallet,
          market_type: stat.market_type,
          wins: totalWins,
          total_trades: totalTrades,
          win_rate: totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0,
          last_updated: new Date().toISOString()
        };
      });

      console.log(`[Pipeline] Updating ${statsToUpsert.length} leaderboard profiles.`);

      const { error: statsError } = await supabase
        .from("users_stats")
        .upsert(statsToUpsert, { onConflict: "wallet,market_type" });
      
      if (statsError) throw new Error(`Stats Error: ${statsError.message}`);
    }

    // 8. Save timestamp if not in force mode
    if (!forceAll && tradesToProcess[0]?.timestamp) {
      const latestTimestamp = tradesToProcess[0].timestamp;
      const nextTimestampIso = new Date(latestTimestamp * 1000).toISOString();
      await supabase.from("meta").upsert({ 
        key: "last_processed_time", 
        value: nextTimestampIso 
      });
    }

    console.log("[Pipeline] Complete ✅");
    return { count: tradesToProcess.length };
  } catch (err) {
    console.error("[Pipeline] ERROR:", err.message);
    throw err;
  }
}
