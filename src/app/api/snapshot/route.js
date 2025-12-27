import { NextResponse } from 'next/server';
import { rateLimit, getRateLimitHeaders, isSupabaseEdgeFunction } from '@/lib/rateLimit';

// Server-only secrets (DO NOT prefix with NEXT_PUBLIC_)
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SNAPSHOT_SECRET = process.env.SNAPSHOT_SECRET;

export async function POST(request) {
    try {
        // Require a secret header to prevent public triggering (DoS / cost leak)
        // Edge/Cron callers should send: x-snapshot-secret: <SNAPSHOT_SECRET>
        // Vercel cron jobs send x-vercel-cron header, which we trust
        const isVercelCron = request.headers.get('x-vercel-cron') === '1';
        
        if (!isVercelCron) {
            // For non-Vercel cron requests, require the secret
            if (!SNAPSHOT_SECRET) {
                return NextResponse.json(
                    { success: false, error: 'Server missing SNAPSHOT_SECRET' },
                    { status: 500 }
                );
            }
            const provided = request.headers.get('x-snapshot-secret') || '';
            if (provided !== SNAPSHOT_SECRET) {
                return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
            }
        }

        // Rate limiting (bypass for Supabase Edge Functions)
        if (!isSupabaseEdgeFunction(request)) {
            const rateLimitResult = rateLimit(request, 'snapshot');
            if (!rateLimitResult.success) {
                return NextResponse.json(
                    { 
                        success: false, 
                        error: 'Rate limit exceeded',
                        retryAfter: rateLimitResult.reset 
                    },
                    { 
                        status: 429,
                        headers: {
                            ...getRateLimitHeaders(rateLimitResult),
                            'Retry-After': rateLimitResult.reset.toString(),
                        }
                    }
                );
            }
        }

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            return NextResponse.json(
                { success: false, error: 'Server missing Supabase service role configuration' },
                { status: 500 }
            );
        }

        // Safe origin (avoid Host header injection / SSRF)
        const baseUrl = new URL(request.url).origin;

        const isProd = process.env.NODE_ENV === 'production';
        if (!isProd) console.log('[Snapshot] Starting snapshot collection...');

        // Fetch current data from existing APIs in parallel
        const [volumeRes, fundingRes, walletRes] = await Promise.all([
            fetch(`${baseUrl}/api/volume`, { cache: 'no-store' }),
            fetch(`${baseUrl}/api/funding`, { cache: 'no-store' }),
            fetch(`${baseUrl}/api/wallet`, { cache: 'no-store' })
        ]);

        if (!volumeRes.ok || !fundingRes.ok || !walletRes.ok) {
            throw new Error('Failed to fetch data from one or more APIs');
        }

        const volumeData = await volumeRes.json();
        const fundingData = await fundingRes.json();
        const walletData = await walletRes.json();

        // Fetch movements to get deposit/withdrawal status
        const movementsRes = await fetch(`${baseUrl}/api/movements`, { cache: 'no-store' });
        const movements = movementsRes.ok ? await movementsRes.json() : [];

        if (!isProd) console.log('[Snapshot] Data fetched successfully');

        // Prepare data for insertion
        const timestamp = new Date().toISOString();

        // Helper function to get movement status for a symbol
        const getMovementStatus = (pairSymbol) => {
            const base = pairSymbol.replace('USD', '').replace('UST', '');
            const mv = movements.find(m => m.symbol === base || m.name === base);
            return {
                deposit: mv ? (mv.deposit === 'Active' ? 'OK' : 'CLSD') : 'NA',
                withdrawal: mv ? (mv.withdrawal === 'Active' ? 'OK' : 'CLSD') : 'NA'
            };
        };

        // 1. Volume Snapshot
        const volumeSnapshot = {
            timestamp,
            total_volume_usd: volumeData.totalVolumeUSD || null,
            ticker_count: volumeData.tickerCount || null,
            // Store JSONB as actual JSON (not a string)
            top_pairs: volumeData.topPairs || [],
            low_pairs: volumeData.lowPairs || []
        };

        // 2. Funding Snapshot
        const fundingSnapshot = {
            timestamp,
            // Store JSONB as actual JSON (not a string)
            funding_stats: fundingData.fundingStats || []
        };

        // 3. Wallet Snapshot
        const walletSnapshot = {
            timestamp,
            wallet_address: '0x77134cbC06cB00b66F4c7e623D5fdBF6777635EC',
            pending_tx_count: walletData.pendingTxCount || null,
            // Store JSONB as actual JSON (not a string)
            tokens: walletData.tokens || []
        };

        // Insert into Supabase using REST API
        const insertResults = await Promise.all([
            // Insert volume snapshot
            fetch(`${SUPABASE_URL}/rest/v1/volume_snapshots`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_SERVICE_ROLE_KEY,
                    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify(volumeSnapshot)
            }),
            // Insert funding snapshot
            fetch(`${SUPABASE_URL}/rest/v1/funding_snapshots`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_SERVICE_ROLE_KEY,
                    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify(fundingSnapshot)
            }),
            // Insert wallet snapshot
            fetch(`${SUPABASE_URL}/rest/v1/wallet_snapshots`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_SERVICE_ROLE_KEY,
                    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify(walletSnapshot)
            })
        ]);

        // Check if all inserts were successful
        const allSuccessful = insertResults.every(res => res.ok);

        if (!allSuccessful) {
            const errors = await Promise.all(
                insertResults.map(async (res, idx) => {
                    if (!res.ok) {
                        const text = await res.text();
                        return { index: idx, status: res.status, error: text };
                    }
                    return null;
                })
            );
            console.error('[Snapshot] Some inserts failed:', errors.filter(e => e));
            throw new Error('One or more database inserts failed');
        }

        if (!isProd) console.log('[Snapshot] All snapshots saved successfully');

        // Now write to normalized tables
        try {
            // 1. Normalize trading pairs and snapshots
            const allPairs = [...(volumeData.topPairs || []), ...(volumeData.lowPairs || [])];
            const pairMap = new Map(); // symbol -> trading_pair_id

            for (const pair of allPairs) {
                try {
                    // Get or create trading pair
                    let pairId = pairMap.get(pair.symbol);
                    
                    if (!pairId) {
                        // Check if pair exists
                        const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/trading_pairs?symbol=eq.${encodeURIComponent(pair.symbol)}&select=id`, {
                            headers: {
                                'apikey': SUPABASE_SERVICE_ROLE_KEY,
                                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
                            }
                        });

                        if (checkRes.ok) {
                            const existing = await checkRes.json();
                            if (existing.length > 0) {
                                pairId = existing[0].id;
                                // Update last_seen_at
                                await fetch(`${SUPABASE_URL}/rest/v1/trading_pairs?id=eq.${pairId}`, {
                                    method: 'PATCH',
                                    headers: {
                                        'apikey': SUPABASE_SERVICE_ROLE_KEY,
                                        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({ last_seen_at: timestamp })
                                });
                            }
                        }

                        // Create if doesn't exist
                        if (!pairId) {
                            const baseCurrency = pair.symbol.replace(/USD$|UST$/, '');
                            const quoteCurrency = pair.symbol.endsWith('UST') ? 'UST' : 'USD';
                            
                            const createRes = await fetch(`${SUPABASE_URL}/rest/v1/trading_pairs`, {
                                method: 'POST',
                                headers: {
                                    'apikey': SUPABASE_SERVICE_ROLE_KEY,
                                    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                                    'Content-Type': 'application/json',
                                    'Prefer': 'return=representation'
                                },
                                body: JSON.stringify({
                                    symbol: pair.symbol,
                                    base_currency: baseCurrency,
                                    quote_currency: quoteCurrency,
                                    is_active: true,
                                    first_seen_at: timestamp,
                                    last_seen_at: timestamp
                                })
                            });

                            if (createRes.ok) {
                                const created = await createRes.json();
                                pairId = Array.isArray(created) ? created[0].id : created.id;
                            }
                        }

                        if (pairId) {
                            pairMap.set(pair.symbol, pairId);
                        }
                    }

                    // Create snapshot record
                    if (pairId) {
                        const status = getMovementStatus(pair.symbol);
                        await fetch(`${SUPABASE_URL}/rest/v1/trading_pair_snapshots`, {
                            method: 'POST',
                            headers: {
                                'apikey': SUPABASE_SERVICE_ROLE_KEY,
                                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                                'Content-Type': 'application/json',
                                'Prefer': 'return=minimal'
                            },
                            body: JSON.stringify({
                                trading_pair_id: pairId,
                                snapshot_timestamp: timestamp,
                                last_price: pair.lastPrice || null,
                                daily_change_percent: pair.change || null,
                                volume_24h_usd: pair.volumeUSD || null,
                                volume_7d_usd: pair.vol7d || null,
                                volume_30d_usd: pair.vol30d || null,
                                spread_percent: pair.spreadPercent || null,
                                bid_price: null,
                                ask_price: null,
                                deposit_status: status.deposit,
                                withdrawal_status: status.withdrawal
                            })
                        });
                    }
                } catch (error) {
                    if (!isProd) console.error(`[Snapshot] Error normalizing pair ${pair.symbol}:`, error.message);
                }
            }

            // 2. Normalize funding rates
            for (const stat of fundingData.fundingStats || []) {
                try {
                    await fetch(`${SUPABASE_URL}/rest/v1/funding_rates`, {
                        method: 'POST',
                        headers: {
                            'apikey': SUPABASE_SERVICE_ROLE_KEY,
                            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                            'Content-Type': 'application/json',
                            'Prefer': 'return=minimal'
                        },
                        body: JSON.stringify({
                            symbol: stat.symbol || null,
                            snapshot_timestamp: timestamp,
                            apr_1h: stat.apr1h || null,
                            volume_24h: stat.volume24h || null,
                            frr: stat.frr || null
                        })
                    });
                } catch (error) {
                    if (!isProd) console.error(`[Snapshot] Error normalizing funding rate for ${stat.symbol}:`, error.message);
                }
            }

            // 3. Normalize wallet token snapshots
            for (const token of walletData.tokens || []) {
                try {
                    const inVolUSD = token.inVolumeUSD || token.inVolume || 0;
                    const outVolUSD = token.outVolumeUSD || token.outVolume || 0;
                    const netVolUSD = inVolUSD - outVolUSD;

                    await fetch(`${SUPABASE_URL}/rest/v1/wallet_token_snapshots`, {
                        method: 'POST',
                        headers: {
                            'apikey': SUPABASE_SERVICE_ROLE_KEY,
                            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                            'Content-Type': 'application/json',
                            'Prefer': 'return=minimal'
                        },
                        body: JSON.stringify({
                            token_symbol: token.symbol || 'UNKNOWN',
                            snapshot_timestamp: timestamp,
                            in_volume: token.inVolume || null,
                            in_volume_usd: inVolUSD || null,
                            out_volume: token.outVolume || null,
                            out_volume_usd: outVolUSD || null,
                            net_volume_usd: netVolUSD || null
                        })
                    });
                } catch (error) {
                    if (!isProd) console.error(`[Snapshot] Error normalizing wallet token ${token.symbol}:`, error.message);
                }
            }

            // 4. Calculate daily aggregation
            try {
                await fetch(`${SUPABASE_URL}/rest/v1/rpc/calculate_daily_aggregation?date=${new Date().toISOString().split('T')[0]}`, {
                    method: 'POST',
                    headers: {
                        'apikey': SUPABASE_SERVICE_ROLE_KEY,
                        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                        'Content-Type': 'application/json'
                    }
                });
            } catch (error) {
                if (!isProd) console.error('[Snapshot] Error calculating daily aggregation:', error.message);
            }

            if (!isProd) console.log('[Snapshot] Normalized data saved successfully');
        } catch (error) {
            // Don't fail the entire request if normalization fails
            console.error('[Snapshot] Error saving normalized data:', error);
        }

        return NextResponse.json({
            success: true,
            message: 'Snapshots saved successfully',
            timestamp,
            counts: {
                volume_pairs: (volumeData.topPairs?.length || 0) + (volumeData.lowPairs?.length || 0),
                funding_currencies: fundingData.fundingStats?.length || 0,
                wallet_tokens: walletData.tokens?.length || 0
            }
        });

    } catch (error) {
        console.error('[Snapshot] Error saving snapshots:', error);
        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Failed to save snapshots'
            },
            { status: 500 }
        );
    }
}

