/**
 * Migration script to convert historical JSONB data to normalized tables
 * 
 * This script reads from the existing snapshot tables (volume_snapshots, funding_snapshots, wallet_snapshots)
 * and populates the new normalized tables (trading_pairs, trading_pair_snapshots, funding_rates, wallet_token_snapshots)
 * 
 * Usage: node scripts/migrate_historical_data.js
 */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
    process.exit(1);
}

async function fetchFromSupabase(endpoint) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
        headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch ${endpoint}: ${response.status} ${response.statusText}`);
    }

    return response.json();
}

async function insertToSupabase(table, data) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        },
        body: JSON.stringify(data)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to insert to ${table}: ${response.status} ${errorText}`);
    }

    return response.json();
}

async function upsertToSupabase(table, data) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=id`, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation,resolution=merge-duplicates'
        },
        body: JSON.stringify(data)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to upsert to ${table}: ${response.status} ${errorText}`);
    }

    return response.json();
}

// Get or create trading pair
async function getOrCreateTradingPair(symbol, snapshotTimestamp) {
    // Try to get existing pair
    const existing = await fetch(`${SUPABASE_URL}/rest/v1/trading_pairs?symbol=eq.${encodeURIComponent(symbol)}&select=id`, {
        headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
    });

    if (existing.ok) {
        const pairs = await existing.json();
        if (pairs.length > 0) {
            // Update last_seen_at
            await fetch(`${SUPABASE_URL}/rest/v1/trading_pairs?id=eq.${pairs[0].id}`, {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_SERVICE_ROLE_KEY,
                    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ last_seen_at: snapshotTimestamp })
            });
            return pairs[0].id;
        }
    }

    // Create new pair
    const baseCurrency = symbol.replace(/USD$|UST$/, '');
    const quoteCurrency = symbol.endsWith('UST') ? 'UST' : 'USD';
    
    const newPair = await insertToSupabase('trading_pairs', {
        symbol: symbol,
        base_currency: baseCurrency,
        quote_currency: quoteCurrency,
        is_active: true,
        first_seen_at: snapshotTimestamp,
        last_seen_at: snapshotTimestamp
    });

    return Array.isArray(newPair) ? newPair[0].id : newPair.id;
}

async function migrateVolumeSnapshots() {
    console.log('📊 Migrating volume snapshots...');
    
    const snapshots = await fetchFromSupabase('volume_snapshots?order=timestamp.asc');
    
    if (!Array.isArray(snapshots) || snapshots.length === 0) {
        console.log('No volume snapshots found');
        return;
    }

    console.log(`Found ${snapshots.length} volume snapshots to migrate`);

    let pairsCreated = 0;
    let snapshotsCreated = 0;

    for (const snapshot of snapshots) {
        const timestamp = snapshot.timestamp;
        const topPairs = snapshot.top_pairs || [];
        const lowPairs = snapshot.low_pairs || [];
        const allPairs = [...topPairs, ...lowPairs];

        console.log(`Processing snapshot from ${timestamp} (${allPairs.length} pairs)`);

        for (const pair of allPairs) {
            try {
                // Get or create trading pair
                const pairId = await getOrCreateTradingPair(pair.symbol, timestamp);
                if (!pairId) {
                    console.warn(`Failed to get/create pair for ${pair.symbol}`);
                    continue;
                }
                pairsCreated++;

                // Create snapshot record
                await insertToSupabase('trading_pair_snapshots', {
                    trading_pair_id: pairId,
                    snapshot_timestamp: timestamp,
                    last_price: pair.lastPrice || null,
                    daily_change_percent: pair.change || null,
                    volume_24h_usd: pair.volumeUSD || null,
                    volume_7d_usd: pair.vol7d || null,
                    volume_30d_usd: pair.vol30d || null,
                    spread_percent: pair.spreadPercent || null,
                    bid_price: null, // Not available in current data
                    ask_price: null, // Not available in current data
                    deposit_status: null, // Will be populated from movements later
                    withdrawal_status: null // Will be populated from movements later
                });

                snapshotsCreated++;
            } catch (error) {
                console.error(`Error processing pair ${pair.symbol}:`, error.message);
            }
        }
    }

    console.log(`✅ Volume migration complete: ${pairsCreated} pairs processed, ${snapshotsCreated} snapshots created`);
}

async function migrateFundingSnapshots() {
    console.log('💰 Migrating funding snapshots...');
    
    const snapshots = await fetchFromSupabase('funding_snapshots?order=timestamp.asc');
    
    if (!Array.isArray(snapshots) || snapshots.length === 0) {
        console.log('No funding snapshots found');
        return;
    }

    console.log(`Found ${snapshots.length} funding snapshots to migrate`);

    let recordsCreated = 0;

    for (const snapshot of snapshots) {
        const timestamp = snapshot.timestamp;
        const fundingStats = snapshot.funding_stats || [];

        console.log(`Processing funding snapshot from ${timestamp} (${fundingStats.length} rates)`);

        for (const stat of fundingStats) {
            try {
                await insertToSupabase('funding_rates', {
                    symbol: stat.symbol || null,
                    snapshot_timestamp: timestamp,
                    apr_1h: stat.apr1h || null,
                    volume_24h: stat.volume24h || null,
                    frr: stat.frr || null
                });

                recordsCreated++;
            } catch (error) {
                console.error(`Error processing funding rate for ${stat.symbol}:`, error.message);
            }
        }
    }

    console.log(`✅ Funding migration complete: ${recordsCreated} records created`);
}

async function migrateWalletSnapshots() {
    console.log('👛 Migrating wallet snapshots...');
    
    const snapshots = await fetchFromSupabase('wallet_snapshots?order=timestamp.asc');
    
    if (!Array.isArray(snapshots) || snapshots.length === 0) {
        console.log('No wallet snapshots found');
        return;
    }

    console.log(`Found ${snapshots.length} wallet snapshots to migrate`);

    let recordsCreated = 0;

    for (const snapshot of snapshots) {
        const timestamp = snapshot.timestamp;
        const tokens = snapshot.tokens || [];

        console.log(`Processing wallet snapshot from ${timestamp} (${tokens.length} tokens)`);

        for (const token of tokens) {
            try {
                const inVolUSD = token.inVolumeUSD || token.inVolume || 0;
                const outVolUSD = token.outVolumeUSD || token.outVolume || 0;
                const netVolUSD = inVolUSD - outVolUSD;

                await insertToSupabase('wallet_token_snapshots', {
                    token_symbol: token.symbol || 'UNKNOWN',
                    snapshot_timestamp: timestamp,
                    in_volume: token.inVolume || null,
                    in_volume_usd: inVolUSD || null,
                    out_volume: token.outVolume || null,
                    out_volume_usd: outVolUSD || null,
                    net_volume_usd: netVolUSD || null
                });

                recordsCreated++;
            } catch (error) {
                console.error(`Error processing token ${token.symbol}:`, error.message);
            }
        }
    }

    console.log(`✅ Wallet migration complete: ${recordsCreated} records created`);
}

async function main() {
    console.log('🚀 Starting historical data migration...\n');

    try {
        await migrateVolumeSnapshots();
        console.log('');
        await migrateFundingSnapshots();
        console.log('');
        await migrateWalletSnapshots();
        console.log('\n✅ Migration complete!');
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

main();

