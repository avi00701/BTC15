const fs = require('fs');
const path = require('path');

// Basic manual .env.local parsing
const envPath = path.join(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, ...vals] = line.split('=');
  if (key && vals.length > 0) env[key.trim()] = vals.join('=').trim();
});

const { createClient } = require('./node_modules/@supabase/supabase-js');

async function testPipeline() {
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log('[Test] Fetching trades...');
  const res = await fetch('https://data-api.polymarket.com/trades?limit=100');
  const allTrades = await res.json();
  console.log('[Test] Found total trades from API:', allTrades.length);

  const btcTrades = allTrades.filter(t => {
    // Check both title AND eventSlug
    const title = (t.title || "").toLowerCase();
    const slug = (t.eventSlug || "").toLowerCase();
    const isBtc = title.includes("btc") || slug.includes("btc");
    const is15m = title.includes("15") || slug.includes("15");
    return isBtc && is15m;
  });

  console.log('[Test] Filtered BTC 15m trades:', btcTrades.length);
  
  if (btcTrades.length > 0) {
    const trade = btcTrades[0];
    console.log('[Test] Sample Filtered Trade Slug:', trade.eventSlug);
    console.log('[Test] Sample Filtered Trade Title:', trade.title);
    
    // Check if ID is present
    const id = trade.transactionHash || trade.id;
    console.log('[Test] Trade ID:', id);

    console.log('[Test] Testing Supabase Upsert...');
    const { error } = await supabase.from('trades').upsert({
      id: id,
      wallet: trade.proxyWallet || trade.user,
      market_id: trade.conditionId || trade.market_id,
      outcome: trade.outcome,
      is_win: false,
      timestamp: new Date(trade.timestamp * 1000).toISOString(),
    }, { onConflict: 'id' });

    if (error) {
       console.error('[Test] Upsert ERROR!! ->', error.message);
    } else {
       console.log('[Test] Upsert DONE! ✅');
       const { count } = await supabase.from('trades').select('*', { count: 'exact', head: true });
       console.log('[Test] Current Trade Count in DB:', count);
    }
  } else {
    console.log('[Test] No BTC 15m found. First 5 slugs/titles for debugging:');
    allTrades.slice(0, 5).forEach(t => console.log(` - SLUG: ${t.eventSlug} | TITLE: ${t.title}`));
  }
}

testPipeline().catch(err => console.error('[Test] FATAL ERR:', err));
