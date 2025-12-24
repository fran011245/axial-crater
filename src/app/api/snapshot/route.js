import { NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function POST(request) {
    try {
        // Determine the base URL for internal API calls
        const protocol = request.headers.get('x-forwarded-proto') || 'http';
        const host = request.headers.get('host') || 'localhost:3001';
        const baseUrl = `${protocol}://${host}`;

        console.log('[Snapshot] Starting snapshot collection...');

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

        console.log('[Snapshot] Data fetched successfully');

        // Prepare data for insertion
        const timestamp = new Date().toISOString();

        // 1. Volume Snapshot
        const volumeSnapshot = {
            timestamp,
            total_volume_usd: volumeData.totalVolumeUSD || null,
            ticker_count: volumeData.tickerCount || null,
            top_pairs: JSON.stringify(volumeData.topPairs || []),
            low_pairs: JSON.stringify(volumeData.lowPairs || [])
        };

        // 2. Funding Snapshot
        const fundingSnapshot = {
            timestamp,
            funding_stats: JSON.stringify(fundingData.fundingStats || [])
        };

        // 3. Wallet Snapshot
        const walletSnapshot = {
            timestamp,
            wallet_address: '0x77134cbC06cB00b66F4c7e623D5fdBF6777635EC',
            pending_tx_count: walletData.pendingTxCount || null,
            tokens: JSON.stringify(walletData.tokens || [])
        };

        // Insert into Supabase using REST API
        const insertResults = await Promise.all([
            // Insert volume snapshot
            fetch(`${SUPABASE_URL}/rest/v1/volume_snapshots`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify(volumeSnapshot)
            }),
            // Insert funding snapshot
            fetch(`${SUPABASE_URL}/rest/v1/funding_snapshots`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify(fundingSnapshot)
            }),
            // Insert wallet snapshot
            fetch(`${SUPABASE_URL}/rest/v1/wallet_snapshots`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
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

        console.log('[Snapshot] All snapshots saved successfully');

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

