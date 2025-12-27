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

        // Return empty data gracefully when Supabase isn't configured
        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            return NextResponse.json({
                success: true,
                data: [],
                aggregate_stats: {
                    total_pairs_analyzed: 0,
                    avg_spread_all_pairs: 0,
                    pairs_with_poor_liquidity: 0,
                    pairs_with_moderate_liquidity: 0,
                    pairs_with_good_liquidity: 0
                },
                period_hours: 24,
                timestamp: new Date().toISOString(),
                message: 'Insights not available - database not configured'
            }, {
                headers: getRateLimitHeaders(rateLimitResult)
            });
        }

        const { searchParams } = new URL(request.url);
        const symbol = searchParams.get('symbol'); // Optional: filter by specific pair
        const hours = parseInt(searchParams.get('hours') || '24'); // Default 24 hours
        const minSpread = parseFloat(searchParams.get('min_spread') || '0'); // Minimum spread threshold
        const maxSpread = parseFloat(searchParams.get('max_spread') || '100'); // Maximum spread threshold

        // Calculate time range
        const now = new Date();
        const startTime = new Date(now.getTime() - hours * 60 * 60 * 1000);

        // Build query
        const query = symbol
            ? `trading_pair_snapshots?snapshot_timestamp=gte.${startTime.toISOString()}&trading_pairs.symbol=eq.${symbol}&select=trading_pairs(symbol),spread_percent,volume_24h_usd,snapshot_timestamp&order=snapshot_timestamp.desc`
            : `trading_pair_snapshots?snapshot_timestamp=gte.${startTime.toISOString()}&spread_percent=gte.${minSpread}&spread_percent=lte.${maxSpread}&select=trading_pairs(symbol),spread_percent,volume_24h_usd,snapshot_timestamp&order=snapshot_timestamp.desc&limit=1000`;

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

        // Process data to analyze liquidity
        const pairMap = new Map();

        for (const record of rawData) {
            const symbolName = record.trading_pairs?.symbol || 'UNKNOWN';
            if (!pairMap.has(symbolName)) {
                pairMap.set(symbolName, {
                    symbol: symbolName,
                    spreads: [],
                    volumes: [],
                    timestamps: []
                });
            }

            const pair = pairMap.get(symbolName);
            if (record.spread_percent !== null) {
                pair.spreads.push(parseFloat(record.spread_percent));
                pair.volumes.push(record.volume_24h_usd ? parseFloat(record.volume_24h_usd) : 0);
                pair.timestamps.push(record.snapshot_timestamp);
            }
        }

        // Calculate liquidity metrics for each pair
        const analysis = Array.from(pairMap.values())
            .map(pair => {
                if (pair.spreads.length === 0) return null;

                const sortedSpreads = [...pair.spreads].sort((a, b) => a - b);
                const avgSpread = pair.spreads.reduce((a, b) => a + b, 0) / pair.spreads.length;
                const maxSpread = Math.max(...pair.spreads);
                const minSpread = Math.min(...pair.spreads);
                const medianSpread = sortedSpreads[Math.floor(sortedSpreads.length / 2)];

                // Calculate volatility (standard deviation)
                const variance = pair.spreads.reduce((acc, val) => {
                    return acc + Math.pow(val - avgSpread, 2);
                }, 0) / pair.spreads.length;
                const volatility = Math.sqrt(variance);

                // Current vs previous spread
                const currentSpread = pair.spreads[pair.spreads.length - 1];
                const previousSpread = pair.spreads.length > 1 ? pair.spreads[pair.spreads.length - 2] : currentSpread;
                const spreadChange = previousSpread > 0 
                    ? ((currentSpread - previousSpread) / previousSpread) * 100 
                    : 0;

                // Average volume
                const avgVolume = pair.volumes.length > 0
                    ? pair.volumes.reduce((a, b) => a + b, 0) / pair.volumes.length
                    : 0;

                // Liquidity score: lower spread + higher volume = better liquidity
                // Score ranges from 0-100, higher is better
                const spreadScore = Math.max(0, 100 - (avgSpread * 10)); // Penalize high spreads
                const volumeScore = Math.min(100, Math.log10(avgVolume + 1) * 10); // Reward high volumes
                const liquidityScore = (spreadScore * 0.7 + volumeScore * 0.3);

                // Determine liquidity status
                let liquidityStatus = 'good';
                if (avgSpread > 5 || avgVolume < 10000) {
                    liquidityStatus = 'poor';
                } else if (avgSpread > 2 || avgVolume < 100000) {
                    liquidityStatus = 'moderate';
                }

                return {
                    symbol: pair.symbol,
                    avg_spread: avgSpread,
                    min_spread: minSpread,
                    max_spread: maxSpread,
                    median_spread: medianSpread,
                    spread_volatility: volatility,
                    current_spread: currentSpread,
                    previous_spread: previousSpread,
                    spread_change_percent: spreadChange,
                    avg_volume_24h: avgVolume,
                    liquidity_score: liquidityScore,
                    liquidity_status: liquidityStatus,
                    snapshot_count: pair.spreads.length,
                    latest_timestamp: pair.timestamps[pair.timestamps.length - 1]
                };
            })
            .filter(a => a !== null)
            .sort((a, b) => {
                // Sort by liquidity score (best first)
                return b.liquidity_score - a.liquidity_score;
            });

        // Calculate aggregate statistics
        const aggregateStats = {
            total_pairs_analyzed: analysis.length,
            avg_spread_all_pairs: analysis.reduce((sum, a) => sum + a.avg_spread, 0) / analysis.length || 0,
            pairs_with_poor_liquidity: analysis.filter(a => a.liquidity_status === 'poor').length,
            pairs_with_moderate_liquidity: analysis.filter(a => a.liquidity_status === 'moderate').length,
            pairs_with_good_liquidity: analysis.filter(a => a.liquidity_status === 'good').length
        };

        return NextResponse.json({
            success: true,
            data: analysis,
            aggregate_stats: aggregateStats,
            period_hours: hours,
            timestamp: new Date().toISOString()
        }, {
            headers: getRateLimitHeaders(rateLimitResult)
        });

    } catch (error) {
        if (process.env.NODE_ENV === 'development') {
            console.error('Error fetching liquidity analysis:', error);
        }
        return NextResponse.json({
            success: true,
            data: [],
            aggregate_stats: {
                total_pairs_analyzed: 0,
                avg_spread_all_pairs: 0,
                pairs_with_poor_liquidity: 0,
                pairs_with_moderate_liquidity: 0,
                pairs_with_good_liquidity: 0
            },
            period_hours: 24,
            timestamp: new Date().toISOString(),
            message: 'Insights temporarily unavailable'
        });
    }
}

