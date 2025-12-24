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

        if (!isProd) console.log('[Snapshot] Data fetched successfully');

        // Prepare data for insertion
        const timestamp = new Date().toISOString();

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

