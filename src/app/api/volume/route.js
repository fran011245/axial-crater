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

        // Fetch valid trading pairs list for URL mapping
        const pairsRes = await fetch('https://api-pub.bitfinex.com/v2/conf/pub:list:pair:exchange', {
            headers: { 'Content-Type': 'application/json' },
            next: { revalidate: 3600 } // Cache for 1 hour (pairs don't change often)
        });
        const pairsData = await pairsRes.json();

        // Create map: BTCUSD -> BTC:USD format
        const pairUrlMap = {};
        if (Array.isArray(pairsData) && pairsData[0]) {
            pairsData[0].forEach(pairSymbol => {
                // pairSymbol format: "tBTCUSD" or "tCELO:UST" (some pairs already have colon)
                const symbol = pairSymbol.substring(1); // Remove 't' prefix -> "BTCUSD" or "CELO:UST"
                
                // If symbol already has colon, use it directly
                if (symbol.includes(':')) {
                    pairUrlMap[symbol] = symbol;
                } else {
                    // Convert BTCUSD -> BTC:USD
                    if (symbol.endsWith('USD')) {
                        const base = symbol.slice(0, -3);
                        pairUrlMap[symbol] = `${base}:USD`;
                    } else if (symbol.endsWith('UST')) {
                        const base = symbol.slice(0, -3);
                        pairUrlMap[symbol] = `${base}:UST`;
                    }
                    // Add more quote currencies if needed in the future
                }
            });
        }

        // Fetch all tickers
        const res = await fetch('https://api-pub.bitfinex.com/v2/tickers?symbols=ALL', {
            headers: { 'Content-Type': 'application/json' },
            next: { revalidate: 60 } // Cache for 60 seconds
        });

        const data = await res.json();

        // Ticker format: [SYMBOL, BID, BID_SIZE, ASK, ASK_SIZE, DAILY_CHANGE, DAILY_CHANGE_PERC, LAST_PRICE, VOLUME, HIGH, LOW]
        // We only care about trading pairs 't...' matching USD/UST/EUT etc.
        // For simplicity, we'll sum up volumes converted to USD for major pairs

        let totalVolumeUSD = 0;
        const tickersWithVolume = [];

        data.forEach(ticker => {
            const symbol = ticker[0];
            if (!symbol.startsWith('t')) return;

            const bid = ticker[1]; // BID price
            const ask = ticker[3]; // ASK price
            const lastPrice = ticker[7];
            const volume = ticker[8];

            // Calculate spread percentage: ((ASK - BID) / midPrice) * 100
            const midPrice = (bid + ask) / 2;
            const spreadPercent = midPrice > 0 ? ((ask - bid) / midPrice) * 100 : 0;

            // We only sum pairs where quote is USD or UST to avoid complex conversion logic/double counting
            // This is an approximation for the dashboard
            if ((symbol.endsWith('USD') || symbol.endsWith('UST')) && !symbol.includes('TEST')) {
                const usdVolume = volume * lastPrice;
                totalVolumeUSD += usdVolume;

                tickersWithVolume.push({
                    symbol: symbol.substring(1), // Remove 't' prefix
                    lastPrice,
                    change: ticker[6], // DAILY_CHANGE_PERC
                    volumeUSD: usdVolume,
                    volume: volume, // Raw volume in base currency
                    spreadPercent: spreadPercent // Spread as percentage
                });
            }
        });

        // Sort by volume descending
        tickersWithVolume.sort((a, b) => b.volumeUSD - a.volumeUSD);

        const topPairs = tickersWithVolume.slice(0, 12);
        const lowPairs = tickersWithVolume.slice(-100).reverse(); // Bottom 100, reversed to show lowest first

        // Fetch 30-day candles for top pairs to calculate 7D and 30D volume
        // Limit to 30 candles (1D timeframe)
        if (process.env.NODE_ENV === 'development') {
            console.log(`[7D/30D Volume] Processing ${topPairs.length} top pairs`);
        }
        
        await Promise.all(topPairs.map(async (pair) => {
            try {
                // Ensure symbol has 't' prefix for API call
                // Handle symbols with ':' format (e.g., "BTC:USD" -> "tBTC:USD")
                let apiSymbol = pair.symbol;
                if (!apiSymbol.startsWith('t')) {
                    // If has ':', maintain the format (e.g., "BTC:USD" -> "tBTC:USD")
                    if (apiSymbol.includes(':')) {
                        apiSymbol = `t${apiSymbol}`;
                    } else {
                        apiSymbol = `t${apiSymbol}`;
                    }
                }
                
                // Candle response: [MTS, OPEN, CLOSE, HIGH, LOW, VOLUME]
                const candleRes = await fetch(`https://api-pub.bitfinex.com/v2/candles/trade:1D:${apiSymbol}/hist?limit=30`, {
                    next: { revalidate: 1800 } // Cache historical for 30 minutes (reduced from 1 hour)
                });
                
                if (!candleRes.ok) {
                    const errorText = await candleRes.text().catch(() => '');
                    console.error(`[7D/30D Volume] API error for ${pair.symbol} (${apiSymbol}): ${candleRes.status} - ${errorText.substring(0, 100)}`);
                    pair.vol7d = 0;
                    pair.vol30d = 0;
                    return;
                }
                
                const candles = await candleRes.json();

                // Validate response format
                if (!Array.isArray(candles)) {
                    if (process.env.NODE_ENV === 'development') {
                        console.warn(`[7D/30D Volume] Invalid response for ${pair.symbol}: not an array`, candles);
                    }
                    pair.vol7d = 0;
                    pair.vol30d = 0;
                    return;
                }

                if (candles.length === 0) {
                    if (process.env.NODE_ENV === 'development') {
                        console.warn(`[7D/30D Volume] No candles returned for ${pair.symbol}`);
                    }
                    pair.vol7d = 0;
                    pair.vol30d = 0;
                    return;
                }

                // Validate candle format: each candle should be an array with at least 6 elements
                const isValidCandle = candles.every(c => Array.isArray(c) && c.length >= 6);
                if (!isValidCandle) {
                    if (process.env.NODE_ENV === 'development') {
                        console.warn(`[7D/30D Volume] Invalid candle format for ${pair.symbol}`, candles[0]);
                    }
                    pair.vol7d = 0;
                    pair.vol30d = 0;
                    return;
                }

                // Sum volumes. Index 5 is VOLUME, Index 2 is CLOSE price.
                // Note: Candles are reversed (newest first)
                // 7D sum: volume * close price (approximate USD volume)
                const vol7d = candles.slice(0, 7).reduce((acc, c) => {
                    const volume = c[5] || 0;
                    const closePrice = c[2] || 0;
                    return acc + (volume * closePrice);
                }, 0);

                // 30D sum
                const vol30d = candles.slice(0, 30).reduce((acc, c) => {
                    const volume = c[5] || 0;
                    const closePrice = c[2] || 0;
                    return acc + (volume * closePrice);
                }, 0);

                pair.vol7d = vol7d;
                pair.vol30d = vol30d;
                
                if (process.env.NODE_ENV === 'development') {
                    console.log(`[7D/30D Volume] ${pair.symbol}: 7D=${vol7d.toFixed(2)}, 30D=${vol30d.toFixed(2)}`);
                }
            } catch (e) {
                console.error(`[7D/30D Volume] Failed to fetch candles for ${pair.symbol}:`, {
                    message: e.message,
                    stack: process.env.NODE_ENV === 'development' ? e.stack : undefined,
                    symbol: pair.symbol
                });
                pair.vol7d = 0;
                pair.vol30d = 0;
            }
        }));

        // Fetch 30-day candles for low pairs to calculate 7D and 30D volume
        if (process.env.NODE_ENV === 'development') {
            console.log(`[7D/30D Volume] Processing ${lowPairs.length} low pairs`);
        }
        
        await Promise.all(lowPairs.map(async (pair) => {
            try {
                // Ensure symbol has 't' prefix for API call
                // Handle symbols with ':' format (e.g., "BTC:USD" -> "tBTC:USD")
                let apiSymbol = pair.symbol;
                if (!apiSymbol.startsWith('t')) {
                    // If has ':', maintain the format (e.g., "BTC:USD" -> "tBTC:USD")
                    if (apiSymbol.includes(':')) {
                        apiSymbol = `t${apiSymbol}`;
                    } else {
                        apiSymbol = `t${apiSymbol}`;
                    }
                }
                
                const candleRes = await fetch(`https://api-pub.bitfinex.com/v2/candles/trade:1D:${apiSymbol}/hist?limit=30`, {
                    next: { revalidate: 1800 } // Cache historical for 30 minutes (reduced from 1 hour)
                });
                
                if (!candleRes.ok) {
                    const errorText = await candleRes.text().catch(() => '');
                    console.error(`[7D/30D Volume] API error for ${pair.symbol} (${apiSymbol}): ${candleRes.status} - ${errorText.substring(0, 100)}`);
                    pair.vol7d = 0;
                    pair.vol30d = 0;
                    return;
                }
                
                const candles = await candleRes.json();

                // Validate response format
                if (!Array.isArray(candles)) {
                    if (process.env.NODE_ENV === 'development') {
                        console.warn(`[7D/30D Volume] Invalid response for ${pair.symbol}: not an array`, candles);
                    }
                    pair.vol7d = 0;
                    pair.vol30d = 0;
                    return;
                }

                if (candles.length === 0) {
                    if (process.env.NODE_ENV === 'development') {
                        console.warn(`[7D/30D Volume] No candles returned for ${pair.symbol}`);
                    }
                    pair.vol7d = 0;
                    pair.vol30d = 0;
                    return;
                }

                // Validate candle format: each candle should be an array with at least 6 elements
                const isValidCandle = candles.every(c => Array.isArray(c) && c.length >= 6);
                if (!isValidCandle) {
                    if (process.env.NODE_ENV === 'development') {
                        console.warn(`[7D/30D Volume] Invalid candle format for ${pair.symbol}`, candles[0]);
                    }
                    pair.vol7d = 0;
                    pair.vol30d = 0;
                    return;
                }

                // Sum volumes: c[5] = VOLUME, c[2] = CLOSE price
                // Calculate USD volume: volume * close price
                const vol7d = candles.slice(0, 7).reduce((acc, c) => {
                    const volume = c[5] || 0;
                    const closePrice = c[2] || 0;
                    return acc + (volume * closePrice);
                }, 0);
                
                // 30D sum
                const vol30d = candles.slice(0, 30).reduce((acc, c) => {
                    const volume = c[5] || 0;
                    const closePrice = c[2] || 0;
                    return acc + (volume * closePrice);
                }, 0);
                
                pair.vol7d = vol7d;
                pair.vol30d = vol30d;
                
                if (process.env.NODE_ENV === 'development') {
                    console.log(`[7D/30D Volume] ${pair.symbol}: 7D=${vol7d.toFixed(2)}, 30D=${vol30d.toFixed(2)}`);
                }
            } catch (e) {
                console.error(`[7D/30D Volume] Failed to fetch candles for ${pair.symbol}:`, {
                    message: e.message,
                    stack: process.env.NODE_ENV === 'development' ? e.stack : undefined,
                    symbol: pair.symbol
                });
                pair.vol7d = 0;
                pair.vol30d = 0;
            }
        }));

        return NextResponse.json(
            {
                totalVolumeUSD,
                tickerCount: data.length,
                topPairs,
                lowPairs,
                pairUrlMap // Mapeo de símbolos a formato URL para Bitfinex trading
            },
            {
                headers: getRateLimitHeaders(rateLimitResult)
            }
        );
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Failed to fetch volume' }, { status: 500 });
    }
}
