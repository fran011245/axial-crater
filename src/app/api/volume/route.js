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

        // Fetch derivatives status directly from Bitfinex to get Open Interest
        let openInterestMap = {};
        let derivativesDebugLog = []; // Para debug detallado
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
            
            // La API de Bitfinex requiere el parámetro 'keys' para devolver datos
            // Usamos 'ALL' para obtener todos los derivativos
            const derivRes = await fetch('https://api-pub.bitfinex.com/v2/status/deriv?keys=ALL', {
                headers: { 'Content-Type': 'application/json' },
                next: { revalidate: 60 }, // Cache for 60 seconds
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (derivRes.ok) {
                const derivData = await derivRes.json();
                
                // Process derivatives data to create mapping
                // Response format: [KEY, MTS, ..., OPEN_INTEREST (index 18), ...]
                // KEY format: "tBTCF0:USD" -> map to "BTCUSD"
                // KEY format: "tBTCF0:USTF0" -> map to "BTCUST" (or BTCUSDt según el usuario)
                if (Array.isArray(derivData)) {
                    derivData.forEach(status => {
                        if (!Array.isArray(status) || status.length < 19) return;
                        
                        const key = status[0]; // e.g., "tBTCF0:USD" or "tBTCF0:USTF0"
                        const openInterest = status[18]; // OPEN_INTEREST
                        
                        if (!key || openInterest === null || openInterest === undefined) return;
                        
                        // DEBUG: Guardar el formato original
                        const originalKey = key;
                        
                        // Map derivative symbol to spot symbol
                        // Formatos posibles:
                        // - tBTCF0:USD -> BTCUSD (perpetual USD)
                        // - tBTCF0:USTF0 -> BTCUST (USDt - en Bitfinex USDt se representa como UST)
                        // - tETHF0:USD -> ETHUSD
                        // - tETHF0:USTF0 -> ETHUST
                        let spotSymbol = key;
                        
                        // Remove 't' prefix
                        if (spotSymbol.startsWith('t')) {
                            spotSymbol = spotSymbol.substring(1);
                        }
                        
                        // DEBUG: Guardar después de quitar 't'
                        const afterT = spotSymbol;
                        
                        // Detectar si es USDt (USTF0) o USD (USD sin F0)
                        // En Bitfinex, USDt se representa como UST
                        const isUSDt = spotSymbol.includes('USTF0');
                        const isUSD = spotSymbol.includes(':USD') && !spotSymbol.includes('USTF0');
                        
                        // Remove 'F0' from both sides if present
                        // Handle cases like BTCF0:USTF0 -> BTC:UST -> BTCUST
                        spotSymbol = spotSymbol.replace(/F0/g, ''); // Remove all F0 occurrences
                        spotSymbol = spotSymbol.replace(':', ''); // Remove ':'
                        
                        // El resultado será:
                        // - BTCUSD (de tBTCF0:USD)
                        // - BTCUST (de tBTCF0:USTF0) - USDt en Bitfinex es UST
                        const finalSymbol = spotSymbol;
                        
                        // Only add if we have a valid openInterest value
                        if (typeof openInterest === 'number' && !isNaN(openInterest)) {
                            openInterestMap[finalSymbol] = openInterest;
                            
                            // DEBUG: Guardar para análisis
                            derivativesDebugLog.push({
                                original: originalKey,
                                afterT: afterT,
                                final: finalSymbol,
                                isUSDt: isUSDt,
                                isUSD: isUSD,
                                oi: openInterest
                            });
                        }
                    });
                }
                
                if (process.env.NODE_ENV === 'development') {
                    console.log('=== DERIVATIVES MAPPING DEBUG ===');
                    console.log(`Total derivatives: ${derivData?.length || 0}`);
                    console.log(`Mapped symbols: ${Object.keys(openInterestMap).length}`);
                    console.log('\n--- Sample Derivative Mappings (first 20) ---');
                    derivativesDebugLog.slice(0, 20).forEach(item => {
                        const type = item.isUSDt ? 'USDt (UST)' : (item.isUSD ? 'USD perpetual' : 'OTHER');
                        console.log(`${item.original} → ${item.afterT} → ${item.final} [${type}] (OI: ${item.oi})`);
                    });
                    
                    // Buscar específicamente BTC, ETH, SOL
                    const btcDerivs = derivativesDebugLog.filter(d => d.original.includes('BTC'));
                    const ethDerivs = derivativesDebugLog.filter(d => d.original.includes('ETH'));
                    const solDerivs = derivativesDebugLog.filter(d => d.original.includes('SOL'));
                    
                    console.log('\n--- BTC Derivatives ---');
                    btcDerivs.forEach(item => {
                        const type = item.isUSDt ? 'USDt (UST)' : (item.isUSD ? 'USD perpetual' : 'OTHER');
                        console.log(`${item.original} → ${item.final} [${type}] (OI: ${item.oi})`);
                    });
                    console.log('\n--- ETH Derivatives ---');
                    ethDerivs.forEach(item => {
                        const type = item.isUSDt ? 'USDt (UST)' : (item.isUSD ? 'USD perpetual' : 'OTHER');
                        console.log(`${item.original} → ${item.final} [${type}] (OI: ${item.oi})`);
                    });
                    console.log('\n--- SOL Derivatives ---');
                    solDerivs.forEach(item => {
                        const type = item.isUSDt ? 'USDt (UST)' : (item.isUSD ? 'USD perpetual' : 'OTHER');
                        console.log(`${item.original} → ${item.final} [${type}] (OI: ${item.oi})`);
                    });
                    
                    // Mostrar todos los símbolos únicos en el mapa
                    console.log(`\n--- All mapped derivative symbols (first 50) ---`);
                    Object.keys(openInterestMap).slice(0, 50).forEach(key => {
                        console.log(`  ${key}: OI = ${openInterestMap[key]}`);
                    });
                }
            } else {
                if (process.env.NODE_ENV === 'development') {
                    console.warn('[Open Interest] Bitfinex API returned status:', derivRes.status);
                }
            }
        } catch (e) {
            if (e.name === 'AbortError') {
                if (process.env.NODE_ENV === 'development') {
                    console.warn('[Open Interest] Request timed out after 10 seconds');
                }
            } else {
                if (process.env.NODE_ENV === 'development') {
                    console.error('[Open Interest] Error fetching derivatives status:', e.message);
                }
            }
        }

        // Add openInterest to all pairs
        const allPairs = [...topPairs, ...lowPairs];
        
        if (process.env.NODE_ENV === 'development') {
            console.log('\n=== SPOT SYMBOLS FROM TABLE ===');
            console.log(`Total pairs: ${allPairs.length}`);
            console.log('Sample symbols:', allPairs.slice(0, 20).map(p => p.symbol));
            console.log('Sample symbols (normalized):', allPairs.slice(0, 20).map(p => {
                const normalized = p.symbol.replace(':', '');
                return `${p.symbol} → ${normalized}`;
            }));
        }
        
        // Debug: Ver qué símbolos de la tabla tienen match y cuáles no
        const matchingDebug = [];
        const noMatchDebug = [];
        
        // Primero asignar openInterest a todos los pairs
        allPairs.forEach(pair => {
            // Normalizar el símbolo removiendo ':' si existe
            // Esto maneja casos donde el símbolo es "BTC:USD" pero el mapa tiene "BTCUSD"
            const normalizedSymbol = pair.symbol.replace(':', '');
            
            // Intentar match primero con el símbolo normalizado
            pair.openInterest = openInterestMap[normalizedSymbol] !== undefined 
                ? openInterestMap[normalizedSymbol] 
                : (openInterestMap[pair.symbol] !== undefined ? openInterestMap[pair.symbol] : null);
            
            if (pair.openInterest !== null) {
                matchingDebug.push({
                    symbol: pair.symbol,
                    normalized: normalizedSymbol,
                    oi: pair.openInterest
                });
            } else {
                // Buscar si hay algún símbolo similar en el mapa
                const similarKeys = Object.keys(openInterestMap).filter(k => 
                    k.includes(normalizedSymbol.substring(0, 3)) || 
                    normalizedSymbol.substring(0, 3).includes(k.substring(0, 3)) ||
                    k.includes(pair.symbol.substring(0, 3)) ||
                    pair.symbol.substring(0, 3).includes(k.substring(0, 3))
                );
                noMatchDebug.push({
                    symbol: pair.symbol,
                    normalized: normalizedSymbol,
                    similarInMap: similarKeys.slice(0, 5) // Primeros 5 similares
                });
            }
        });

        // AHORA extraer símbolos base únicos para obtener precios desde CoinMarketCap
        // (después de que openInterest ya fue asignado)
        const baseSymbols = new Set();
        allPairs.forEach(pair => {
            if (pair.openInterest !== null && pair.openInterest !== undefined) {
                // Extraer símbolo base: BTCUSD -> BTC, ETHUSD -> ETH, BTC:USD -> BTC, etc.
                let baseSymbol = pair.symbol.replace(':', ''); // Normalizar primero
                // Remover USD, UST, etc. del final
                baseSymbol = baseSymbol.replace(/USD$/, '').replace(/UST$/, '');
                if (baseSymbol && baseSymbol.length > 0) {
                    baseSymbols.add(baseSymbol);
                    if (process.env.NODE_ENV === 'development') {
                        console.log(`[OI] Extracting base symbol: ${pair.symbol} -> ${baseSymbol}`);
                    }
                }
            }
        });
        
        if (process.env.NODE_ENV === 'development') {
            console.log(`[OI] Total base symbols to fetch prices for: ${baseSymbols.size}`);
            console.log(`[OI] Base symbols:`, Array.from(baseSymbols).join(', '));
        }

        // Obtener precios desde CoinMarketCap (misma lógica que wallet)
        let tokenPrices = {};
        if (baseSymbols.size > 0) {
            const CMC_API_KEY = process.env.COINMARKETCAP_API_KEY;
            const MAX_RETRIES = 2;
            const RETRY_DELAY = 1000;

            const fetchCoinMarketCapPrices = async (symbols) => {
                if (!CMC_API_KEY) {
                    if (process.env.NODE_ENV === 'development') {
                        console.log('[OI] COINMARKETCAP_API_KEY not set. OI will be shown in raw units.');
                    }
                    return null;
                }

                const symbolsArray = Array.from(symbols).slice(0, 100);
                const symbolsList = symbolsArray.join(',');

                for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                    try {
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 20000);

                        const response = await fetch(
                            `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${symbolsList}&convert=USD`,
                            {
                                signal: controller.signal,
                                headers: {
                                    'X-CMC_PRO_API_KEY': CMC_API_KEY,
                                    'Accept': 'application/json'
                                },
                                cache: 'no-store'
                            }
                        );

                        clearTimeout(timeoutId);

                        if (!response.ok) {
                            if ((response.status >= 500 || response.status === 429) && attempt < MAX_RETRIES) {
                                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
                                continue;
                            }
                            if (response.status === 401 || response.status === 403) {
                                if (process.env.NODE_ENV === 'development') {
                                    console.warn('[OI] CoinMarketCap API key invalid. OI will be shown in raw units.');
                                }
                                return null;
                            }
                            return {};
                        }

                        const data = await response.json();
                        const prices = {};

                        if (data.data) {
                            Object.keys(data.data).forEach(symbol => {
                                const tokenData = data.data[symbol];
                                const tokenArray = Array.isArray(tokenData) ? tokenData : [tokenData];
                                const ethereumToken = tokenArray.find(t => 
                                    t.platform && t.platform.name === 'Ethereum'
                                ) || tokenArray[0];
                                
                                if (ethereumToken && ethereumToken.quote && ethereumToken.quote.USD && ethereumToken.quote.USD.price) {
                                    prices[symbol.toUpperCase()] = ethereumToken.quote.USD.price;
                                }
                            });
                        }

                        if (process.env.NODE_ENV === 'development') {
                            console.log(`[OI] Fetched ${Object.keys(prices).length} prices from CoinMarketCap for OI calculation`);
                            console.log(`[OI] Symbols requested: ${Array.from(symbols).join(', ')}`);
                            console.log(`[OI] Prices obtained:`, Object.keys(prices).join(', '));
                        }

                        return prices;
                    } catch (error) {
                        const isTimeout = error.name === 'AbortError' || error.message.includes('timeout');
                        const isNetworkError = error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED');
                        
                        if (process.env.NODE_ENV === 'development') {
                            console.error(`[OI] Error fetching CoinMarketCap prices (attempt ${attempt}/${MAX_RETRIES}):`, error.message);
                        }
                        
                        if ((isTimeout || isNetworkError) && attempt < MAX_RETRIES) {
                            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
                            continue;
                        }
                        return null;
                    }
                }
                return null;
            };

            // Obtener precios
            const prices = await fetchCoinMarketCapPrices(baseSymbols);
            if (prices) {
                // Normalizar precios (CoinMarketCap devuelve uppercase, pero necesitamos ambos casos)
                Array.from(baseSymbols).forEach(symbol => {
                    const symbolUpper = symbol.toUpperCase();
                    if (prices[symbolUpper]) {
                        tokenPrices[symbol] = prices[symbolUpper];
                        tokenPrices[symbolUpper] = prices[symbolUpper]; // También guardar uppercase
                        if (process.env.NODE_ENV === 'development') {
                            console.log(`[OI] Price for ${symbol} (${symbolUpper}): $${prices[symbolUpper]}`);
                        }
                    } else {
                        if (process.env.NODE_ENV === 'development') {
                            console.warn(`[OI] No price found for ${symbol} (${symbolUpper}) in CoinMarketCap response`);
                        }
                    }
                });
            } else {
                if (process.env.NODE_ENV === 'development') {
                    console.warn(`[OI] Failed to fetch prices from CoinMarketCap. OI will be shown in raw units.`);
                }
            }
        }

        // Calcular openInterestUSD para cada par (después de obtener precios)
        allPairs.forEach(pair => {
            // Calcular openInterestUSD si tenemos OI y precio
            if (pair.openInterest !== null && pair.openInterest !== undefined) {
                // Extraer símbolo base para buscar precio
                const normalizedSymbol = pair.symbol.replace(':', '');
                let baseSymbol = normalizedSymbol;
                baseSymbol = baseSymbol.replace(/USD$/, '').replace(/UST$/, '');
                
                // Obtener precio
                const price = tokenPrices[baseSymbol] || tokenPrices[baseSymbol.toUpperCase()] || null;
                
                // Calcular OI en USD
                if (price && price > 0) {
                    pair.openInterestUSD = pair.openInterest * price;
                } else {
                    pair.openInterestUSD = null;
                    if (process.env.NODE_ENV === 'development' && pair.openInterest > 0) {
                        console.warn(`[OI] No price found for ${pair.symbol} (base: ${baseSymbol}). Available prices:`, Object.keys(tokenPrices).join(', '));
                    }
                }
                
                // Actualizar matchingDebug con oiUSD
                const existingMatch = matchingDebug.find(m => m.symbol === pair.symbol);
                if (existingMatch) {
                    existingMatch.oiUSD = pair.openInterestUSD;
                }
            } else {
                pair.openInterestUSD = null;
            }
        });
        
        if (process.env.NODE_ENV === 'development') {
            console.log('\n=== MATCHING ANALYSIS ===');
            console.log(`Pairs WITH OI: ${matchingDebug.length}`);
            matchingDebug.slice(0, 15).forEach(item => {
                console.log(`✓ ${item.symbol} (${item.normalized}): OI = ${item.oi}`);
            });
            
            console.log(`\nPairs WITHOUT OI: ${noMatchDebug.length}`);
            noMatchDebug.slice(0, 15).forEach(item => {
                console.log(`✗ ${item.symbol} (normalized: ${item.normalized}) - Similar in map: ${item.similarInMap.join(', ') || 'none'}`);
            });
            
            // Buscar específicamente BTCUSD, ETHUSD, SOLUSD (con y sin dos puntos)
            const btcPair = allPairs.find(p => p.symbol === 'BTCUSD' || p.symbol === 'BTC:USD');
            const ethPair = allPairs.find(p => p.symbol === 'ETHUSD' || p.symbol === 'ETH:USD');
            const solPair = allPairs.find(p => p.symbol === 'SOLUSD' || p.symbol === 'SOL:USD');
            
            // También buscar variantes UST
            const btcUstPair = allPairs.find(p => p.symbol === 'BTCUST' || p.symbol === 'BTC:UST');
            const ethUstPair = allPairs.find(p => p.symbol === 'ETHUST' || p.symbol === 'ETH:UST');
            const solUstPair = allPairs.find(p => p.symbol === 'SOLUST' || p.symbol === 'SOL:UST');
            
            console.log('\n--- Key Pairs Check ---');
            console.log(`BTCUSD/BTC:USD: ${btcPair ? `symbol="${btcPair.symbol}", OI = ${btcPair.openInterest || 'null'}` : 'not found'}`);
            console.log(`ETHUSD/ETH:USD: ${ethPair ? `symbol="${ethPair.symbol}", OI = ${ethPair.openInterest || 'null'}` : 'not found'}`);
            console.log(`SOLUSD/SOL:USD: ${solPair ? `symbol="${solPair.symbol}", OI = ${solPair.openInterest || 'null'}` : 'not found'}`);
            console.log(`\nBTCUST/BTC:UST: ${btcUstPair ? `symbol="${btcUstPair.symbol}", OI = ${btcUstPair.openInterest || 'null'}` : 'not found'}`);
            console.log(`ETHUST/ETH:UST: ${ethUstPair ? `symbol="${ethUstPair.symbol}", OI = ${ethUstPair.openInterest || 'null'}` : 'not found'}`);
            console.log(`SOLUST/SOL:UST: ${solUstPair ? `symbol="${solUstPair.symbol}", OI = ${solUstPair.openInterest || 'null'}` : 'not found'}`);
            
            // Ver qué hay en el mapa para BTC, ETH y SOL
            const btcInMap = Object.keys(openInterestMap).filter(k => k.includes('BTC'));
            const ethInMap = Object.keys(openInterestMap).filter(k => k.includes('ETH'));
            const solInMap = Object.keys(openInterestMap).filter(k => k.includes('SOL'));
            console.log(`\nBTC keys in map: ${btcInMap.join(', ') || 'none'}`);
            console.log(`ETH keys in map: ${ethInMap.join(', ') || 'none'}`);
            console.log(`SOL keys in map: ${solInMap.join(', ') || 'none'}`);
            
            console.log(`\n[Open Interest] Total pairs: ${allPairs.length}, Pairs with OI: ${matchingDebug.length}`);
            
            // Debug de OI USD
            const pairsWithOIUSD = allPairs.filter(p => p.openInterestUSD !== null);
            console.log(`\n=== OPEN INTEREST USD CALCULATION ===`);
            console.log(`Pairs with OI in USD: ${pairsWithOIUSD.length}`);
            pairsWithOIUSD.slice(0, 5).forEach(p => {
                const baseSymbol = p.symbol.replace(':', '').replace(/USD$/, '').replace(/UST$/, '');
                const price = tokenPrices[baseSymbol] || tokenPrices[baseSymbol.toUpperCase()] || null;
                console.log(`${p.symbol}: OI=${p.openInterest}, Base=${baseSymbol}, Price=${price || 'N/A'}, OI_USD=${p.openInterestUSD?.toFixed(2) || 'N/A'}`);
            });
        }

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
