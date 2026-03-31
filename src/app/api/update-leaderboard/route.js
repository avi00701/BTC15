import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Node.js runtime - more stable, compatible with Supabase client
export const runtime = "nodejs";
// Prevents Vercel from killing the function after response is sent
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

  // ✅ Fire and forget — respond INSTANTLY, process in background
  // Node.js will keep the event loop alive until processLeaderboard() finishes
  processLeaderboard().catch((err) =>
    console.error("Background pipeline failed:", err.message)
  );

  return NextResponse.json({ started: true, message: "Processing in background" });
}

// 🔥 Scalable incremental background processing
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

    // 2. Fetch only recent trades (max 500)
    const tradesRes = await fetch("https://clob.polymarket.com/trades?limit=500", {
      headers: { Accept: "application/json" },
    });

    if (!tradesRes.ok) {
      throw new Error(`Trades API error: ${tradesRes.status}`);
    }

    const trades = await tradesRes.json();

    if (!Array.isArray(trades) || trades.length === 0) {
      console.log("[Pipeline] No trades returned from API.");
      return;
    }

    // 3. Filter: only trades newer than last run
    const newTrades = lastTime === "0"
      ? trades.slice(0, 200) // First ever run: only take 200 most recent
      : trades.filter((t) => new Date(t.timestamp) > new Date(lastTime));

    if (newTrades.length === 0) {
      console.log("[Pipeline] No new trades since last run.");
      return;
    }

    console.log(`[Pipeline] Processing ${newTrades.length} new trades.`);

    // 4. Fetch markets to find resolved BTC 15-min markets
    const marketsRes = await fetch("https://clob.polymarket.com/markets?limit=500", {
      headers: { Accept: "application/json" },
    });

    if (!marketsRes.ok) {
      throw new Error(`Markets API error: ${marketsRes.status}`);
    }

    const marketsData = await marketsRes.json();
    const markets = Array.isArray(marketsData)
      ? marketsData
      : marketsData.markets || marketsData.data || [];

    // 5. Build winning outcome map for resolved BTC 15m markets
    const btcMarketWinners = {};
    markets.forEach((m) => {
      const q = (m.question || "").toLowerCase();
      const isBTC = q.includes("btc") || q.includes("bitcoin");
      const is15Min = q.includes("15");
      if (isBTC && is15Min && m.resolved && m.winning_outcome) {
        btcMarketWinners[m.id] = m.winning_outcome;
      }
    });

    console.log(`[Pipeline] Found ${Object.keys(btcMarketWinners).length} resolved BTC 15m markets.`);

    // 6. Aggregate user stats from this batch
    const usersBatch = {};
    newTrades.forEach((trade) => {
      const wallet = trade.user || trade.maker || trade.taker;
      const marketId = trade.market_id || trade.marketId;
      if (!wallet) return;

      if (!usersBatch[wallet]) {
        usersBatch[wallet] = { wallet, wins: 0, total_trades: 0 };
      }

      usersBatch[wallet].total_trades++;

      if (btcMarketWinners[marketId] && btcMarketWinners[marketId] === trade.outcome) {
        usersBatch[wallet].wins++;
      }
    });

    const updates = Object.values(usersBatch);
    console.log(`[Pipeline] Updating ${updates.length} users.`);

    // 7. Atomic bulk increment (preserves existing data, adds new wins)
    if (updates.length > 0) {
      const { error: rpcError } = await supabase.rpc("increment_user_stats_bulk", {
        updates,
      });
      if (rpcError) throw rpcError;
      console.log(`[Pipeline] DB updated for ${updates.length} users.`);
    }

    // 8. Save the timestamp of the most recent trade processed
    // Trades from CLOB are sorted newest first
    const latestTimestamp = newTrades[0]?.timestamp;
    if (latestTimestamp) {
      await supabase.from("meta").upsert({
        key: "last_processed_time",
        value: latestTimestamp,
      });
      console.log("[Pipeline] Timestamp saved:", latestTimestamp);
    }

    console.log("[Pipeline] Complete ✅");
  } catch (err) {
    console.error("[Pipeline] ERROR:", err.message);
  }
}
