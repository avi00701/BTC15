import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 60;

// Production Constants
const MAX_MARKETS_PER_TYPE = 5;
const TRADES_PER_MARKET = 300;
const MAX_TOTAL_TRADES = 2000;
const FETCH_TIMEOUT_MS = 10000;
const RETRY_COUNT = 3;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * Format a variety of Polymarket timestamp formats into a valid PostgreSQL ISO string.
 */
function formatTimestamp(ts) {
  if (!ts) return new Date().toISOString();
  // Handle ISO strings directly
  if (typeof ts === 'string' && ts.includes('T')) return ts;
  
  let val = Number(ts);
  if (isNaN(val)) return new Date().toISOString();

  // Polymarket uses seconds (10 digits) or ms (13 digits)
  // If it's < 100,000,000,000 (roughly Year 5138 in seconds), it's likely seconds.
  if (val < 1e11) val *= 1000;
  
  try {
    return new Date(val).toISOString();
  } catch (e) {
    return new Date().toISOString();
  }
}

/**
 * Enhanced fetch with retry and timeout logic for production resilience.
 */
async function fetchWithRetry(url, options = {}, retries = RETRY_COUNT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!response.ok && retries > 0) {
      console.warn(`[Retry] Fetch failed for ${url} (Status: ${response.status}). Retrying...`);
      return fetchWithRetry(url, options, retries - 1);
    }
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    if (retries > 0) {
      console.warn(`[Retry] Fetch error: ${err.message}. Retrying...`);
      return fetchWithRetry(url, options, retries - 1);
    }
    throw err;
  }
}

/**
 * Normalizes trade data from multiple sources (CLOB vs Data API) into a unified leaderboard schema.
 */
function normalizeTrade(t, market) {
  return {
    id: t.id || t.transactionHash || `${t.proxyWallet}_${t.timestamp}_${market.conditionId}`,
    wallet: t.user || t.proxyWallet || t.pseudonym || t.owner,
    market_id: market.conditionId,
    market_type: market.marketType,
    outcome: t.outcome,
    timestamp: formatTimestamp(t.timestamp || t.time)
  };
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
      processed_trades: result?.count || 0,
      processed_markets: result?.marketCount || 0,
      health: result?.healthStatus || "UNKNOWN",
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("[Pipeline] Fatal error:", err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

async function processLeaderboard(forceAll = false) {
  const supabase = getSupabase();
  console.log(`[Pipeline] Unified Sync Started (forceAll: ${forceAll})`);

  const now = Math.floor(Date.now() / 1000);
  const hourWindow = forceAll ? 24 : 3;
  const startOfWindow = now - (hourWindow * 60 * 60);

  const buckets = [
    { type: "btc_5m", interval: 300, prefix: "btc-updown-5m-" },
    { type: "btc_15m", interval: 900, prefix: "btc-updown-15m-" }
  ];

  let validMarkets = [];

  // 1. DISCOVERY (Slug Prediction + Fallback)
  for (const bucket of buckets) {
    const slugs = [];
    for (let t = Math.floor(now / bucket.interval) * bucket.interval; t >= startOfWindow; t -= bucket.interval) {
      slugs.push(bucket.prefix + t);
    }
    
    let bucketMarkets = [];
    for (let i = 0; i < slugs.length; i += 10) {
      const batch = slugs.slice(i, i + 10);
      await Promise.all(batch.map(async (slug) => {
        try {
          const res = await fetchWithRetry(`https://gamma-api.polymarket.com/markets?slug=${slug}`);
          const data = await res.json();
          if (data && data[0]) bucketMarkets.push({ ...data[0], marketType: bucket.type });
        } catch (err) {}
      }));
      if (bucketMarkets.length >= (forceAll ? 15 : MAX_MARKETS_PER_TYPE)) break;
    }

    if (bucketMarkets.length === 0) {
      console.warn(`[Pipeline] Slug prediction returned 0 for ${bucket.type}. Fallback to search...`);
      try {
        const query = bucket.type === "btc_5m" ? "btc-updown-5m" : "btc-updown-15m";
        const searchRes = await fetchWithRetry(`https://gamma-api.polymarket.com/markets?active=true&limit=50&tagId=100609`); 
        const searchData = await searchRes.json();
        const fallbackMarkets = searchData.filter(m => 
          (m.slug?.includes(query) || m.question?.toLowerCase().includes(bucket.type.replace("btc_", "").replace("m", " minute")))
        );
        bucketMarkets.push(...fallbackMarkets.map(m => ({ ...m, marketType: bucket.type })));
      } catch (err) { console.error(`[Pipeline] Fallback discovery failed: ${err.message}`); }
    }

    validMarkets.push(...bucketMarkets.slice(0, forceAll ? 20 : MAX_MARKETS_PER_TYPE));
  }

  console.log(`[Pipeline] Discovery resolved ${validMarkets.length} markets.`);
  if (validMarkets.length === 0) return { count: 0, marketCount: 0, healthStatus: "FAIL" };

  // 2. FETCH TRADES (Multi-Source + Resilience)
  const allFetchedTrades = [];
  const cutoff = startOfWindow * 1000;

  for (const market of validMarkets) {
    try {
      let trades = [];
      const clobRes = await fetchWithRetry(`https://clob.polymarket.com/trades?market=${market.conditionId}&limit=${TRADES_PER_MARKET}`);
      if (clobRes.ok) {
        trades = await clobRes.json();
      } else {
        try {
          const eventRes = await fetchWithRetry(`https://gamma-api.polymarket.com/events?slug=${market.slug}`);
          const eventData = await eventRes.json();
          const targetEventId = eventData && eventData[0]?.id;

          if (targetEventId) {
            const dataRes = await fetchWithRetry(`https://data-api.polymarket.com/trades?eventId=${targetEventId}&limit=100&filterType=CASH`, {
               headers: { "origin": "https://polymarket.com", "referer": "https://polymarket.com/" }
            });
            if (dataRes.ok) {
              const fetched = await dataRes.json();
              trades = Array.isArray(fetched) ? fetched : [];
              console.log(`[Data-API] Resolved eventId ${targetEventId} for ${market.slug} - Found ${trades.length} trades`);
            }
          }
        } catch (resErr) { console.error(`[Pipeline] Event resolution failed for ${market.slug}`); }
      }

      if (Array.isArray(trades) && trades.length > 0) {
        const normalized = trades.map(t => normalizeTrade(t, market));
        const recent = normalized.filter(t => new Date(t.timestamp).getTime() > cutoff);
        allFetchedTrades.push(...recent);
        console.log(`[Pipeline] Captured ${recent.length} recent trades for ${market.slug}`);
      }
    } catch (err) { console.error(`[Pipeline] Fetch error for ${market.slug}: ${err.message}`); }
    if (allFetchedTrades.length >= MAX_TOTAL_TRADES) break;
  }

  const btc5mCount = allFetchedTrades.filter(t => t.market_type === "btc_5m").length;
  const btc15mCount = allFetchedTrades.filter(t => t.market_type === "btc_15m").length;

  if (btc5mCount === 0 && btc15mCount === 0) {
    console.error("[Pipeline] CRITICAL: Zero trades after normalization.");
    await supabase.from("sync_health").insert({ btc_5m_count: 0, btc_15m_count: 0, status: "CRITICAL" });
    return { count: 0, marketCount: validMarkets.length, healthStatus: "CRITICAL" };
  }

  // 3. RESOLVE WINNERS (Unified processing)
  const finalTrades = allFetchedTrades.slice(0, MAX_TOTAL_TRADES);
  const uniqueCids = [...new Set(finalTrades.map(t => t.market_id))];
  const winners = {};
  for (let i = 0; i < uniqueCids.length; i += 10) {
    const batch = uniqueCids.slice(i, i + 10);
    await Promise.all(batch.map(async (cid) => {
      try {
        const res = await fetchWithRetry(`https://clob.polymarket.com/markets/${cid}`);
        const data = await res.json();
        if (data?.closed) winners[cid] = data.tokens.find(t => t.winner === true)?.outcome;
      } catch (err) {}
    }));
  }

  // 4. DATABASE UPDATES
  const usersBatch = {};
  const tradeUpserts = finalTrades.map(t => {
    const isWin = !!(winners[t.market_id] && winners[t.market_id] === t.outcome);
    const key = `${t.wallet}_${t.market_type}`;
    if (!usersBatch[key]) usersBatch[key] = { wallet: t.wallet, market_type: t.market_type, wins: 0, total_trades: 0 };
    usersBatch[key].total_trades++;
    if (isWin) usersBatch[key].wins++;
    return { ...t, is_win: isWin };
  });

  if (tradeUpserts.length > 0) {
    const { error: upsertError } = await supabase.from("trades").upsert(tradeUpserts, { onConflict: "id" });
    if (upsertError) throw new Error(`Trades Upsert Failed: ${upsertError.message}`);

    const wallets = Array.from(new Set(tradeUpserts.map(t => t.wallet)));
    const { data: existingStats } = await supabase.from("leaderboard_stats").select("*").in("wallet", wallets);

    const statsUpserts = Object.values(usersBatch).map(newStat => {
      const prev = existingStats?.find(e => e.wallet === newStat.wallet && e.market_type === newStat.market_type);
      const wins = newStat.wins + (prev?.wins || 0);
      const total = newStat.total_trades + (prev?.total_trades || 0);
      const winRate = total > 0 ? (wins / total) : 0;
      const score = total > 1 ? (winRate * Math.log(total)) : 0;

      return {
        wallet: newStat.wallet,
        market_type: newStat.market_type,
        wins, total_trades: total,
        win_rate: winRate * 100,
        score, last_updated: new Date().toISOString()
      };
    });

    await supabase.from("leaderboard_stats").upsert(statsUpserts, { onConflict: "wallet,market_type" });
  }

  const healthStatus = (btc5mCount > 0 && btc15mCount > 0) ? "OK" : "WARNING";
  await supabase.from("sync_health").insert({ 
    btc_5m_count: btc5mCount, 
    btc_15m_count: btc15mCount, 
    status: healthStatus,
    metadata: { processed_markets: validMarkets.length, total_trades: tradeUpserts.length }
  });

  return { count: tradeUpserts.length, marketCount: validMarkets.length, healthStatus };
}
