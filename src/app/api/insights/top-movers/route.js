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
        const metric = searchParams.get('metric') || 'volume'; // 'volume', 'price', 'spread'
        const hours = parseInt(searchParams.get('hours') || '24'); // Default 24 hours
        const limit = parseInt(searchParams.get('limit') || '10'); // Default top 10
        const direction = searchParams.get('direction') || 'both'; // 'up', 'down', 'both'

        // Calculate time range
        const now = new Date();
        const startTime = new Date(now.getTime() - hours * 60 * 60 * 1000);

        // Build query based on metric type
        let selectFields = 'trading_pairs(symbol),snapshot_timestamp';
        if (metric === 'volume') {
            selectFields += ',volume_24h_usd';
        } else if (metric === 'price') {
            selectFields += ',last_price,daily_change_percent';
        } else if (metric === 'spread') {
            selectFields += ',spread_percent';
        }

        const query = `trading_pair_snapshots?snapshot_timestamp=gte.${startTime.toISOString()}&select=${selectFields}&order=snapshot_timestamp.desc&limit=1000`;

        const dataRes = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
            headers: {
                'apikey': SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
            }
        });

        if (!dataRes.ok) {
            throw new Error('Failed to fetch data from Supabase');
        }

        const rawData = await dataRes.json();

        // Process data to find top movers
        const pairMap = new Map();

        for (const record of rawData) {
            const symbolName = record.trading_pairs?.symbol || 'UNKNOWN';
            if (!pairMap.has(symbolName)) {
                pairMap.set(symbolName, {
                    symbol: symbolName,
                    values: [],
                    timestamps: []
                });
            }

            const pair = pairMap.get(symbolName);
            let value = null;

            if (metric === 'volume' && record.volume_24h_usd !== null) {
                value = parseFloat(record.volume_24h_usd);
            } else if (metric === 'price' && record.daily_change_percent !== null) {
                value = parseFloat(record.daily_change_percent);
            } else if (metric === 'spread' && record.spread_percent !== null) {
                value = parseFloat(record.spread_percent);
            }

            if (value !== null) {
                pair.values.push(value);
                pair.timestamps.push(record.snapshot_timestamp);
            }
        }

        // Calculate movers for each pair
        const movers = Array.from(pairMap.values())
            .map(pair => {
                if (pair.values.length < 2) return null;

                const current = pair.values[pair.values.length - 1];
                const previous = pair.values[pair.values.length - 2];
                const earliest = pair.values[0];

                let changePercent = 0;
                let absoluteChange = 0;

                if (metric === 'volume') {
                    // Volume change: current vs previous
                    if (previous > 0) {
                        changePercent = ((current - previous) / previous) * 100;
                    } else if (current > 0) {
                        changePercent = 100;
                    }
                    absoluteChange = current - previous;
                } else if (metric === 'price') {
                    // Price change: use daily_change_percent directly
                    changePercent = current;
                    absoluteChange = current;
                } else if (metric === 'spread') {
                    // Spread change: current vs previous
                    if (previous > 0) {
                        changePercent = ((current - previous) / previous) * 100;
                    } else if (current > 0) {
                        changePercent = 100;
                    }
                    absoluteChange = current - previous;
                }

                // Calculate trend over entire period
                const periodChange = earliest > 0 
                    ? ((current - earliest) / earliest) * 100 
                    : (current > 0 ? 100 : 0);

                return {
                    symbol: pair.symbol,
                    metric: metric,
                    current_value: current,
                    previous_value: previous,
                    earliest_value: earliest,
                    change_percent: changePercent,
                    absolute_change: absoluteChange,
                    period_change_percent: periodChange,
                    trend_direction: changePercent > 5 ? 'up' : changePercent < -5 ? 'down' : 'stable',
                    snapshot_count: pair.values.length,
                    latest_timestamp: pair.timestamps[pair.timestamps.length - 1]
                };
            })
            .filter(m => m !== null)
            .filter(m => {
                // Filter by direction
                if (direction === 'up') return m.trend_direction === 'up';
                if (direction === 'down') return m.trend_direction === 'down';
                return true; // 'both'
            })
            .sort((a, b) => {
                // Sort by absolute change percentage (biggest movers first)
                return Math.abs(b.change_percent) - Math.abs(a.change_percent);
            })
            .slice(0, limit);

        return NextResponse.json({
            success: true,
            data: movers,
            metric: metric,
            period_hours: hours,
            direction: direction,
            timestamp: new Date().toISOString()
        }, {
            headers: getRateLimitHeaders(rateLimitResult)
        });

    } catch (error) {
        console.error('Error fetching top movers:', error);
        return NextResponse.json(
            { error: 'Failed to fetch top movers' },
            { status: 500 }
        );
    }
}

