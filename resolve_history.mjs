import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

// Manual parser for .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const [key, ...value] = line.split('=');
    if (key && value) env[key.trim()] = value.join('=').trim();
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Error: Missing Supabase environment variables in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const BATCH_SIZE = 20; // Larger batches for faster backlog processing
const DELAY_MS = 300;

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function resolveHistory() {
    console.log(`🚀 Starting Resolution Engine at ${supabaseUrl}`);

    // Get ALL distinct unresolved market IDs via RPC (bypasses 1000-row limit)
    const { data: pendingMarkets, error: tradesError } = await supabase
        .rpc('get_unresolved_market_ids');

    if (tradesError) {
        console.error('❌ Supabase Error:', tradesError.message);
        process.exit(1);
    }

    const allMarketIds = pendingMarkets?.map(t => t.market_id) || [];
    console.log(`📊 Found ${allMarketIds.length} unique unresolved markets.`);

    if (allMarketIds.length === 0) {
        console.log('✅ No pending trades found.');
        return;
    }

    let resolved = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < allMarketIds.length; i += BATCH_SIZE) {
        const batch = allMarketIds.slice(i, i + BATCH_SIZE);
        console.log(`📦 Batch ${Math.floor(i / BATCH_SIZE) + 1} / ${Math.ceil(allMarketIds.length / BATCH_SIZE)} (resolved: ${resolved}, skipped: ${skipped}, failed: ${failed})`);

        await Promise.all(batch.map(async (conditionId) => {
            try {
                // 1. Check resolution cache first
                const { data: cache } = await supabase.from('market_resolution').select('*').eq('market_id', conditionId).single();
                
                let winningOutcome = cache?.winning_outcome;
                let isResolved = cache?.is_resolved;

                if (!isResolved) {
                    // 2. Fetch from Gamma API
                    const response = await axios.get(`https://gamma-api.polymarket.com/markets?conditionId=${conditionId}`);
                    const market = response.data[0];

                    if (!market || !market.closed) {
                        skipped++;
                        return; // Market not closed yet
                    }

                    const outcomes = JSON.parse(market.outcomes);
                    winningOutcome = outcomes[market.winningOutcomeIndex];
                    if (!winningOutcome) {
                        skipped++;
                        return;
                    }

                    // 3. Cache the resolution
                    await supabase.from('market_resolution').upsert({
                        market_id: conditionId,
                        winning_outcome: winningOutcome,
                        is_resolved: true,
                        closed_at: market.closedTime,
                        updated_at: new Date().toISOString()
                    });
                }

                // 4. Use the RPC to resolve trades (uses 'outcome' column correctly)
                const { error: rpcError } = await supabase.rpc('resolve_trades_for_market', { 
                    m_id: conditionId, 
                    w_outcome: winningOutcome 
                });

                if (rpcError) {
                    console.error(`❌ RPC error for ${conditionId.slice(0, 8)}: ${rpcError.message}`);
                    failed++;
                } else {
                    console.log(`✅ Market ${conditionId.slice(0, 8)} -> ${winningOutcome}`);
                    resolved++;
                }

            } catch (err) {
                console.error(`❌ Error resolving ${conditionId.slice(0, 8)}: ${err.message}`);
                failed++;
            }
        }));

        await sleep(DELAY_MS);
    }

    console.log(`\n🏁 Resolution Complete.`);
    console.log(`   ✅ Resolved: ${resolved}`);
    console.log(`   ⏭️ Skipped (not closed): ${skipped}`);
    console.log(`   ❌ Failed: ${failed}`);

    // Show remaining unresolved count
    const { data: remaining } = await supabase
        .from('trades')
        .select('market_id', { count: 'exact', head: true })
        .is('is_win', null);
    
    console.log(`\n📊 Remaining unresolved trades: check DB manually`);
}

resolveHistory().catch(console.error);
