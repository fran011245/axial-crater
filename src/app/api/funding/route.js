import { NextResponse } from 'next/server';
import { rateLimit, getRateLimitHeaders } from '@/lib/rateLimit';

export async function GET(request) {
    try {
        // Rate limiting
        const rateLimitResult = rateLimit(request, 'publicApi');
        if (!rateLimitResult.success) {
            return NextResponse.json(
                { 
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

        // Lista de símbolos de funding a obtener
        const fundingSymbols = ['fUSD', 'fBTC', 'fETH', 'fUST', 'fSOL'];
        
        // Fetch funding stats para cada símbolo
        const fundingPromises = fundingSymbols.map(async (symbol) => {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout per request
                
                const res = await fetch(`https://api-pub.bitfinex.com/v2/funding/stats/${symbol}/hist?limit=1`, {
                    headers: { 'Content-Type': 'application/json' },
                    next: { revalidate: 60 }, // Cache for 60 seconds
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!res.ok) {
                    if (process.env.NODE_ENV === 'development') {
                        console.warn(`[Funding] Failed to fetch ${symbol}: ${res.status}`);
                    }
                    return null;
                }

                const data = await res.json();
                
                // Estructura según documentación:
                // [0] = MTS (timestamp)
                // [3] = FRR (1/365th of Flash Return Rate)
                // [7] = FUNDING_AMOUNT (total funding provided)
                // [11] = FUNDING_BELOW_THRESHOLD
                if (!Array.isArray(data) || data.length === 0 || !Array.isArray(data[0]) || data[0].length < 12) {
                    if (process.env.NODE_ENV === 'development') {
                        console.warn(`[Funding] Invalid data format for ${symbol}`);
                    }
                    return null;
                }

                const stats = data[0]; // Último valor histórico
                const frr = stats[3]; // FRR en índice [3]
                const fundingAmount = stats[7] || 0; // FUNDING_AMOUNT como proxy de volumen
                const fundingBelowThreshold = stats[11] || 0;
                
                // Según documentación: APR = rate × 100 × 365 × 365
                // Donde rate es el FRR que ya es 1/365th
                const frrValue = frr || 0;
                const apr1h = frrValue * 100 * 365 * 365;
                
                // Convert symbol: remove 'f' and map UST -> USDt
                let displaySymbol = symbol.substring(1);
                if (displaySymbol === 'UST') {
                    displaySymbol = 'USDt';
                }
                
                return {
                    symbol: displaySymbol,
                    apr1h: apr1h,
                    volume24h: fundingAmount, // Usar FUNDING_AMOUNT como proxy de volumen
                    frr: frrValue
                };
            } catch (error) {
                if (process.env.NODE_ENV === 'development') {
                    console.error(`[Funding] Error fetching ${symbol}:`, error.message);
                }
                return null;
            }
        });

        // Esperar todas las promesas y filtrar nulos
        const fundingResults = await Promise.all(fundingPromises);
        const fundingTickers = fundingResults
            .filter(item => item !== null)
            .sort((a, b) => b.volume24h - a.volume24h) // Sort by volume descending
            .slice(0, 5); // Top 5

        return NextResponse.json(
            {
                fundingStats: fundingTickers,
                lastUpdate: new Date().toISOString()
            },
            {
                headers: getRateLimitHeaders(rateLimitResult)
            }
        );
    } catch (error) {
        if (error.name === 'AbortError') {
            console.warn('Funding API request timed out after 10 seconds');
        } else {
            console.error('Funding API Error:', error.message || error);
        }
        return NextResponse.json({ 
            fundingStats: [],
            error: 'Failed to fetch funding data',
            lastUpdate: new Date().toISOString()
        }, { status: 500 });
    }
}

