import { NextResponse } from 'next/server';
import { rateLimit, getRateLimitHeaders } from '@/lib/rateLimit';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET(request) {
    try {
        // Rate limiting
        const rateLimitResult = rateLimit(request, 'publicApi');
        if (!rateLimitResult.success) {
            return NextResponse.json(
                { error: 'Too many requests. Please try again later.' },
                { 
                    status: 429,
                    headers: {
                        ...getRateLimitHeaders(rateLimitResult),
                        'Retry-After': rateLimitResult.reset.toString()
                    }
                }
            );
        }

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            return NextResponse.json(
                { error: 'Server configuration error' },
                { status: 500 }
            );
        }

        const { searchParams } = new URL(request.url);
        const symbol = searchParams.get('symbol'); // Optional: filter by specific pair
        const hours = parseInt(searchParams.get('hours') || '24'); // Default 24 hours
        const limit = parseInt(searchParams.get('limit') || '10'); // Default top 10

        // Calculate time range
        const now = new Date();
        const startTime = new Date(now.getTime() - hours * 60 * 60 * 1000);

        // Use direct REST query
        const directQuery = symbol
            ? `trading_pair_snapshots?snapshot_timestamp=gte.${startTime.toISOString()}&trading_pairs.symbol=eq.${symbol}&select=trading_pairs(symbol),volume_24h_usd,snapshot_timestamp&order=snapshot_timestamp.desc`
            : `trading_pair_snapshots?snapshot_timestamp=gte.${startTime.toISOString()}&select=trading_pairs(symbol),volume_24h_usd,snapshot_timestamp&order=snapshot_timestamp.desc&limit=1000`;

        const dataRes = await fetch(`${SUPABASE_URL}/rest/v1/${directQuery}`, {
            headers: {
                'apikey': SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
            }
        });

        if (!dataRes.ok) {
            throw new Error('Failed to fetch data from Supabase');
        }

        const rawData = await dataRes.json();

        // Process data to calculate trends
        const pairMap = new Map();

        for (const record of rawData) {
            const symbolName = record.trading_pairs?.symbol || 'UNKNOWN';
            if (!pairMap.has(symbolName)) {
                pairMap.set(symbolName, {
                    symbol: symbolName,
                    volumes: [],
                    timestamps: []
                });
            }

            const pair = pairMap.get(symbolName);
            if (record.volume_24h_usd !== null) {
                pair.volumes.push(parseFloat(record.volume_24h_usd));
                pair.timestamps.push(record.snapshot_timestamp);
            }
        }

        // Calculate trends for each pair
        const trends = Array.from(pairMap.values())
            .map(pair => {
                if (pair.volumes.length < 2) return null;

                const sorted = pair.volumes.sort((a, b) => a - b);
                const current = pair.volumes[pair.volumes.length - 1];
                const previous = pair.volumes[pair.volumes.length - 2];
                const avg = pair.volumes.reduce((a, b) => a + b, 0) / pair.volumes.length;
                const max = Math.max(...pair.volumes);
                const min = Math.min(...pair.volumes);

                let changePercent = 0;
                if (previous > 0) {
                    changePercent = ((current - previous) / previous) * 100;
                } else if (current > 0) {
                    changePercent = 100;
                }

                return {
                    symbol: pair.symbol,
                    current_volume: current,
                    previous_volume: previous,
                    avg_volume: avg,
                    max_volume: max,
                    min_volume: min,
                    change_percent: changePercent,
                    trend_direction: changePercent > 5 ? 'up' : changePercent < -5 ? 'down' : 'stable',
                    snapshot_count: pair.volumes.length,
                    latest_timestamp: pair.timestamps[pair.timestamps.length - 1],
                    earliest_timestamp: pair.timestamps[0]
                };
            })
            .filter(t => t !== null)
            .sort((a, b) => {
                // Sort by absolute change percentage
                return Math.abs(b.change_percent) - Math.abs(a.change_percent);
            })
            .slice(0, limit);

        return NextResponse.json({
            success: true,
            data: trends,
            period_hours: hours,
            timestamp: new Date().toISOString()
        }, {
            headers: getRateLimitHeaders(rateLimitResult)
        });

    } catch (error) {
        console.error('Error fetching volume trends:', error);
        return NextResponse.json(
            { error: 'Failed to fetch volume trends' },
            { status: 500 }
        );
    }
}

