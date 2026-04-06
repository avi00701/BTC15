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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Missing critical Supabase environment variables: URL or SERVICE_ROLE_KEY.");
  }

  return createClient(url, serviceKey);
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
    timestamp: formatTimestamp(t.timestamp || t.time),
    is_win: null, // Default to Pending (3-state model)
    resolution_status: 'pending'
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
    return NextResponse.json({ success: false, error: err.stack }, { status: 500 });
  }
}

async function processLeaderboard(forceAll = false) {
  const supabase = getSupabase();
  console.log(`[Pipeline] Core Sync Started (forceAll: ${forceAll})`);

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
    // Predict slugs for the target window
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
      // Limit markets per type to keep execution under Vercel limits
      if (bucketMarkets.length >= (forceAll ? 15 : MAX_MARKETS_PER_TYPE)) break;
    }

    if (bucketMarkets.length === 0) {
      console.warn(`[Pipeline] Slug prediction failed for ${bucket.type}. Fallback to search...`);
      try {
        const query = bucket.type === "btc_5m" ? "btc-updown-5m" : "btc-updown-15m";
        const searchRes = await fetchWithRetry(`https://gamma-api.polymarket.com/markets?active=true&limit=50&tagId=100609`); 
        const searchData = await searchRes.json();
        const fallbackMarkets = searchData.filter(m => 
          (m.slug?.includes(query) || m.question?.toLowerCase().includes(bucket.type.replace("btc_", "").replace("m", " minute")))
        );
        bucketMarkets.push(...fallbackMarkets.map(m => ({ ...m, marketType: bucket.type })));
      } catch (err) { console.error(`[Pipeline] Fallback failed: ${err.message}`); }
    }

    validMarkets.push(...bucketMarkets.slice(0, forceAll ? 20 : MAX_MARKETS_PER_TYPE));
  }

  console.log(`[Pipeline] Discovery resolved ${validMarkets.length} markets.`);
  if (validMarkets.length === 0) return { count: 0, marketCount: 0, healthStatus: "FAIL" };

  // 2. FETCH TRADES (Per-Market to fix starvation)
  const allFetchedTrades = [];
  const cutoff = startOfWindow * 1000;

  for (const market of validMarkets) {
    try {
      let trades = [];
      // Primary: CLOB API for better depth
      const clobRes = await fetchWithRetry(`https://clob.polymarket.com/trades?market=${market.conditionId}&limit=${TRADES_PER_MARKET}`);
      if (clobRes.ok) {
        trades = await clobRes.json();
      } else {
        // Fallback: Data-API via Event ID resolution
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
            }
          }
        } catch (resErr) {}
      }

      if (Array.isArray(trades) && trades.length > 0) {
        const normalized = trades.map(t => normalizeTrade(t, market));
        const recent = normalized.filter(t => new Date(t.timestamp).getTime() > cutoff);
        allFetchedTrades.push(...recent);
        console.log(`[Pipeline] Captured ${recent.length} trades for ${market.slug}`);
      }
    } catch (err) { console.error(`[Pipeline] ${market.slug} Error: ${err.message}`); }
    if (allFetchedTrades.length >= MAX_TOTAL_TRADES) break;
  }

  const btc5mCount = allFetchedTrades.filter(t => t.market_type === "btc_5m").length;
  const btc15mCount = allFetchedTrades.filter(t => t.market_type === "btc_15m").length;

  if (allFetchedTrades.length === 0) {
    console.error("[Pipeline] Critical: No trades detected in current window.");
    await supabase.from("sync_health").insert({ btc_5m_count: 0, btc_15m_count: 0, status: "CRITICAL" });
    return { count: 0, marketCount: validMarkets.length, healthStatus: "CRITICAL" };
  }

  // 3. STORAGE (New Trades default to Pending)
  const { error: upsertError } = await supabase.from("trades").upsert(allFetchedTrades, { onConflict: "id" });
  if (upsertError) throw new Error(`Trades Upsert Error: ${upsertError.message}`);

  // 4. LOOKBACK RESOLUTION PASS (The most important part)
  // We resolve trades where is_win IS NULL, going back up to 48h
  await resolvePendingMarkets(supabase);

  // 5. UPDATE LEADERBOARD STATS (Deterministic Delta)
  // increment_leaderboard_stats should now skip is_win IS NULL
  const { error: syncError } = await supabase.rpc("increment_leaderboard_stats");
  if (syncError) console.error(`[Pipeline] Stats Sync Error: ${syncError.message}`);

  // 6. HOUSEKEEPING
  await supabase.from("trades").delete().lt("timestamp", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString());

  const healthStatus = (btc5mCount > 0 && btc15mCount > 0) ? "OK" : "WARNING";
  await supabase.from("sync_health").insert({ 
    btc_5m_count: btc5mCount, 
    btc_15m_count: btc15mCount, 
    status: healthStatus,
    metadata: { processed_markets: validMarkets.length, total_trades: allFetchedTrades.length }
  });

  return { count: allFetchedTrades.length, marketCount: validMarkets.length, healthStatus };
}

/**
 * Logic-heavy resolution of pending trades using Cache-First strategy.
 */
async function resolvePendingMarkets(supabase) {
  // A. Find unique market IDs that have pending trades in our system
  const { data: pending } = await supabase
    .from("trades")
    .select("market_id")
    .is("is_win", null);

  const uniqueMarketIds = [...new Set(pending?.map(t => t.market_id) || [])];
  if (uniqueMarketIds.length === 0) return;

  console.log(`[Pipeline] Resolution pass checking ${uniqueMarketIds.length} unique markets.`);

  // B. Batch Resolve outcomes (Deduped at market level)
  const BATCH_SIZE = 10;
  for (let i = 0; i < uniqueMarketIds.length; i += BATCH_SIZE) {
    const batch = uniqueMarketIds.slice(i, i + BATCH_SIZE);
    
    await Promise.all(batch.map(async (cid) => {
      try {
        // 1. Check local resolution cache first
        const { data: cache } = await supabase.from("market_resolution").select("*").eq("market_id", cid).single();
        
        let winningOutcome = cache?.winning_outcome;
        let isResolved = cache?.is_resolved;

        if (!isResolved) {
           // 2. Fetch from Gamma API
           const res = await fetch(`https://gamma-api.polymarket.com/markets?conditionId=${cid}`);
           const markets = await res.json();
           const market = markets?.[0];

           if (!market || !market.closed) return;

           const outcomes = JSON.parse(market.outcomes);
           winningOutcome = outcomes[market.winningOutcomeIndex];
           if (!winningOutcome) return;

           // 3. Update Cache
           await supabase.from("market_resolution").upsert({
             market_id: cid,
             winning_outcome: winningOutcome,
             is_resolved: true,
             closed_at: market.closedTime,
             updated_at: new Date().toISOString()
           });
        }

        // 4. Update trades for this market (Bulk)
        await supabase.rpc('resolve_trades_for_market', { m_id: cid, w_outcome: winningOutcome });

      } catch (err) {
        console.error(`[Pipeline] Resolution failed for ${cid}: ${err.message}`);
      }
    }));
  }
}

