import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const env = fs.readFileSync(".env.local", "utf8");
const getEnv = (key) => env.split("\n").find(l => l.startsWith(key + "="))?.split("=")[1]?.trim();

const supabase = createClient(
  getEnv("NEXT_PUBLIC_SUPABASE_URL"),
  getEnv("SUPABASE_SERVICE_ROLE_KEY")
);

const MAX_BACKFILL_HOURS = 24;
const FETCH_TIMEOUT_MS = 10000;

function formatTimestamp(ts) {
  if (!ts) return new Date().toISOString();
  if (typeof ts === 'string' && ts.includes('T')) return ts;
  let val = Number(ts);
  if (isNaN(val)) return new Date().toISOString();
  if (val < 1e11) val *= 1000;
  try {
    return new Date(val).toISOString();
  } catch (e) {
    return new Date().toISOString();
  }
}

async function fetchWithRetry(url, options = {}, retries = 3) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok && retries > 0) return fetchWithRetry(url, options, retries - 1);
    return res;
  } catch (e) {
    clearTimeout(timeoutId);
    if (retries > 0) return fetchWithRetry(url, options, retries - 1);
    throw e;
  }
}

function normalizeTrade(t, market) {
  return {
    id: t.id || t.transactionHash || `${t.proxyWallet}_${t.timestamp}_${market.conditionId}`,
    wallet: t.user || t.proxyWallet || t.pseudonym || t.owner,
    market_id: market.conditionId,
    market_type: market.mType,
    outcome: t.outcome,
    timestamp: formatTimestamp(t.timestamp || t.time)
  };
}

async function backfill() {
  console.log(`🚀 Starting FINAL DYNAMIC Backfill (Limit: ${MAX_BACKFILL_HOURS}h)...`);
  const now = Math.floor(Date.now() / 1000);
  const startOfWindow = now - (MAX_BACKFILL_HOURS * 60 * 60);

  const buckets = [
    { type: "btc_5m", interval: 300, prefix: "btc-updown-5m-" },
    { type: "btc_15m", interval: 900, prefix: "btc-updown-15m-" }
  ];

  const validMarkets = [];
  for (const bucket of buckets) {
    const slugs = [];
    for (let t = Math.floor(now / bucket.interval) * bucket.interval; t >= startOfWindow; t -= bucket.interval) {
       slugs.push(bucket.prefix + t);
    }
    for (let i = 0; i < slugs.length; i += 10) {
      const batch = slugs.slice(i, i + 10);
      await Promise.all(batch.map(async (slug) => {
        try {
          const r = await fetchWithRetry(`https://gamma-api.polymarket.com/markets?slug=${slug}`);
          const d = await r.json();
          if (d && d[0]) validMarkets.push({ ...d[0], mType: bucket.type });
        } catch(e){}
      }));
      if (validMarkets.filter(m => m.mType === bucket.type).length > 20) break;
    }
  }

  console.log(`Resolved ${validMarkets.length} markets. Fetching trades via Data-API...`);

  const allTrades = [];
  for (const m of validMarkets) {
    try {
      const eventRes = await fetchWithRetry(`https://gamma-api.polymarket.com/events?slug=${m.slug}`);
      const eventData = await eventRes.json();
      const eventId = eventData && eventData[0]?.id;

      if (eventId) {
        const dataRes = await fetchWithRetry(`https://data-api.polymarket.com/trades?eventId=${eventId}&limit=100&filterType=CASH`, {
          headers: { "origin": "https://polymarket.com", "referer": "https://polymarket.com/" }
        });
        if (dataRes.ok) {
          const trades = await dataRes.json();
          if (Array.isArray(trades)) {
            const normalized = trades.map(t => normalizeTrade(t, m));
            allTrades.push(...normalized);
            console.log(`Captured ${normalized.length} trades for ${m.slug} (eventId: ${eventId})`);
          }
        }
      }
    } catch(e) { console.error(`Error for ${m.slug}: ${e.message}`); }
    await new Promise(r => setTimeout(r, 100));
  }

  if (allTrades.length === 0) return console.log("No trades found.");

  console.log(`Upserting ${allTrades.length} trades into Supabase...`);
  const { error } = await supabase.from("trades").upsert(allTrades, { onConflict: "id" });
  if (error) console.error("Trades Error:", error.message);
  
  console.log("Backfill complete ✅");
}

backfill().catch(console.error);
