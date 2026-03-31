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

  // ✅ Respond instantly — no cron timeout ever
  processLeaderboard().catch((err) =>
    console.error("[Pipeline] Fatal error:", err.message)
  );

  return NextResponse.json({ started: true });
}

async function processLeaderboard() {
  const supabase = getSupabase();

  try {
    console.log("[Pipeline] Started");

    // 1. Get last processed timestamp
    const { data: meta } = await supabase
      .from("meta")
      .select("value")
      .eq("key", "last_processed_time")
      .single();

    const lastTime = meta?.value || "0";
    console.log("[Pipeline] Last processed time:", lastTime);

    // 2. Fetch recent trades (limited batch)
    const tradesRes = await fetch("https://clob.polymarket.com/trades?limit=500", {
      headers: { Accept: "application/json" },
    });
    if (!tradesRes.ok) throw new Error(`Trades API: ${tradesRes.status}`);
    const allTrades = await tradesRes.json();

    if (!Array.isArray(allTrades) || allTrades.length === 0) {
      console.log("[Pipeline] No trades from API.");
      return;
    }

    // 3. Filter: only new trades
    const newTrades = lastTime === "0"
      ? allTrades.slice(0, 200)
      : allTrades.filter((t) => new Date(t.timestamp) > new Date(lastTime));

    if (newTrades.length === 0) {
      console.log("[Pipeline] No new trades since last run.");
      return;
    }

    console.log(`[Pipeline] ${newTrades.length} new trades to process.`);

    // 4. Fetch markets and build winner map
    const marketsRes = await fetch("https://clob.polymarket.com/markets?limit=500", {
      headers: { Accept: "application/json" },
    });
    if (!marketsRes.ok) throw new Error(`Markets API: ${marketsRes.status}`);
    const marketsData = await marketsRes.json();
    const markets = Array.isArray(marketsData)
      ? marketsData
      : marketsData.markets || marketsData.data || [];

    const marketMap = {};
    markets.forEach((m) => {
      const q = (m.question || "").toLowerCase();
      if ((q.includes("btc") || q.includes("bitcoin")) && q.includes("15") && m.resolved && m.winning_outcome) {
        marketMap[m.id] = m.winning_outcome;
      }
    });

    console.log(`[Pipeline] ${Object.keys(marketMap).length} resolved BTC 15m markets.`);

    // 5. Process trades — build per-user aggregation + individual trade records
    const usersBatch = {};
    const tradeUpserts = [];

    newTrades.forEach((trade) => {
      const wallet = trade.user || trade.maker || trade.taker;
      const marketId = trade.market_id || trade.marketId;
      if (!wallet || !trade.id) return;

      const isWin = !!(marketMap[marketId] && marketMap[marketId] === trade.outcome);

      // Build trade record for 24h leaderboard
      tradeUpserts.push({
        id: trade.id,
        wallet,
        market_id: marketId,
        outcome: trade.outcome,
        is_win: isWin,
        timestamp: trade.timestamp,
      });

      // Aggregate for overall stats
      if (!usersBatch[wallet]) {
        usersBatch[wallet] = { wallet, wins: 0, total_trades: 0 };
      }
      usersBatch[wallet].total_trades++;
      if (isWin) usersBatch[wallet].wins++;
    });

    // 6. Upsert individual trades (for 24h leaderboard)
    if (tradeUpserts.length > 0) {
      // Batch into chunks of 100 to avoid request size limits
      const chunkSize = 100;
      for (let i = 0; i < tradeUpserts.length; i += chunkSize) {
        const chunk = tradeUpserts.slice(i, i + chunkSize);
        const { error } = await supabase.from("trades").upsert(chunk, { onConflict: "id" });
        if (error) console.error("[Pipeline] Trades insert error:", error.message);
      }
      console.log(`[Pipeline] Saved ${tradeUpserts.length} trade records.`);
    }

    // 7. Atomic bulk increment for overall stats
    const updates = Object.values(usersBatch);
    if (updates.length > 0) {
      const { error: rpcError } = await supabase.rpc("increment_user_stats_bulk", { updates });
      if (rpcError) throw rpcError;
      console.log(`[Pipeline] Updated overall stats for ${updates.length} users.`);
    }

    // 8. Save latest timestamp (trades sorted newest-first from CLOB)
    const latestTimestamp = newTrades[0]?.timestamp;
    if (latestTimestamp) {
      await supabase.from("meta").upsert({ key: "last_processed_time", value: latestTimestamp });
      console.log("[Pipeline] Timestamp saved:", latestTimestamp);
    }

    console.log("[Pipeline] Complete ✅");
  } catch (err) {
    console.error("[Pipeline] ERROR:", err.message);
  }
}
