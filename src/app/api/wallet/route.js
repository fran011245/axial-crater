import { NextResponse } from 'next/server';
import { rateLimit, getRateLimitHeaders } from '@/lib/rateLimit';

const WALLET_ADDRESS = '0x77134cbC06cB00b66F4c7e623D5fdBF6777635EC';
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || 'YourApiKeyToken';

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

        const now = Math.floor(Date.now() / 1000);
        const oneDayAgo = now - 86400;

        // Fetch ERC-20 token transfers (using V2 API with chainid=1 for Ethereum mainnet)
        // Retry logic for Etherscan API
        let tokenTxData = { status: '0', result: [] };
        const MAX_RETRIES = 3;
        const RETRY_DELAY = 1000; // 1 second
        
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout per attempt
                
                const tokenTxRes = await fetch(
                    `https://api.etherscan.io/v2/api?module=account&action=tokentx&address=${WALLET_ADDRESS}&chainid=1&startblock=0&endblock=99999999&sort=desc&apikey=${ETHERSCAN_API_KEY}`,
                    { 
                        signal: controller.signal,
                        cache: 'no-store',
                        headers: {
                            'Accept': 'application/json',
                        }
                    }
                );
                
                clearTimeout(timeoutId);
                
                if (!tokenTxRes.ok) {
                    const errorText = await tokenTxRes.text().catch(() => 'Unable to read error response');
                    console.error(`Etherscan token API HTTP error (attempt ${attempt}/${MAX_RETRIES}): ${tokenTxRes.status} ${tokenTxRes.statusText}`);
                    
                    // Retry on 5xx errors or rate limit (429)
                    if ((tokenTxRes.status >= 500 || tokenTxRes.status === 429) && attempt < MAX_RETRIES) {
                        console.warn(`Retrying Etherscan token API in ${RETRY_DELAY}ms...`);
                        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt)); // Exponential backoff
                        continue;
                    }
                    
                    tokenTxData = { status: '0', result: [], message: `HTTP ${tokenTxRes.status}: ${errorText.substring(0, 100)}` };
                    break;
                }
                
                const contentType = tokenTxRes.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    tokenTxData = await tokenTxRes.json();
                } else {
                    const text = await tokenTxRes.text();
                    console.error(`Etherscan token API returned non-JSON (attempt ${attempt}/${MAX_RETRIES}):`, text.substring(0, 200));
                    
                    if (attempt < MAX_RETRIES) {
                        console.warn(`Retrying Etherscan token API in ${RETRY_DELAY}ms...`);
                        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
                        continue;
                    }
                    
                    tokenTxData = { status: '0', result: [], message: 'Invalid response format' };
                    break;
                }
                
                // Validate Etherscan response
                if (tokenTxData.status === '0') {
                    if (tokenTxData.message === 'NOTOK') {
                        if (tokenTxData.result?.includes('deprecated')) {
                            console.error('Etherscan API V1 deprecated. Using V2 but may need valid API key.');
                            break; // Don't retry deprecated API
                        } else if (tokenTxData.result?.includes('Missing/Invalid API Key')) {
                            console.warn('⚠️ Etherscan API key invalid or missing. Add ETHERSCAN_API_KEY to Vercel env vars.');
                            tokenTxData = { status: '0', result: [], message: 'No API key' };
                            break; // Don't retry invalid API key
                        } else if (tokenTxData.result?.includes('timeout') || tokenTxData.result?.includes('server too busy')) {
                            // Retry on timeout/busy errors
                            if (attempt < MAX_RETRIES) {
                                console.warn(`Etherscan timeout/busy (attempt ${attempt}/${MAX_RETRIES}), retrying in ${RETRY_DELAY * attempt}ms...`);
                                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
                                continue;
                            } else {
                                console.error('Etherscan API timeout/busy after all retries:', tokenTxData.message);
                            }
                        } else if (tokenTxData.message !== 'No transactions found') {
                            console.warn(`Etherscan token API error (attempt ${attempt}/${MAX_RETRIES}):`, tokenTxData.message, tokenTxData.result);
                            // Don't retry on other NOTOK errors
                            break;
                        }
                    }
                } else if (tokenTxData.status === '1') {
                    if (process.env.NODE_ENV === 'development') {
                        console.log(`✅ Token transfers fetched successfully (attempt ${attempt}): ${Array.isArray(tokenTxData.result) ? tokenTxData.result.length : 'N/A'} transactions`);
                        if (Array.isArray(tokenTxData.result) && tokenTxData.result.length > 0) {
                            console.log('Sample token transfer:', JSON.stringify(tokenTxData.result[0], null, 2));
                        }
                    }
                    break; // Success, exit retry loop
                }
                
            } catch (error) {
                const isTimeout = error.name === 'AbortError' || error.message.includes('timeout');
                const isNetworkError = error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND');
                
                console.error(`Error fetching token transfers (attempt ${attempt}/${MAX_RETRIES}):`, error.message);
                
                if (process.env.NODE_ENV === 'development') {
                    console.error('Full error:', error);
                }
                
                // Retry on timeout or network errors
                if ((isTimeout || isNetworkError) && attempt < MAX_RETRIES) {
                    console.warn(`Retrying Etherscan token API in ${RETRY_DELAY * attempt}ms due to ${isTimeout ? 'timeout' : 'network error'}...`);
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
                    continue;
                }
                
                tokenTxData = { status: '0', result: [], message: error.message };
                break;
            }
        }
        
        if (tokenTxData.status === '0' && tokenTxData.result?.length === 0) {
            console.warn('⚠️ Failed to fetch token transfers from Etherscan after all retries. Wallet data will be incomplete.');
        }

        // Fetch normal ETH transactions (using V2 API with chainid=1 for Ethereum mainnet)
        // Retry logic for Etherscan API
        let ethTxData = { status: '0', result: [] };
        
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout per attempt
                
                const ethTxRes = await fetch(
                    `https://api.etherscan.io/v2/api?module=account&action=txlist&address=${WALLET_ADDRESS}&chainid=1&startblock=0&endblock=99999999&sort=desc&apikey=${ETHERSCAN_API_KEY}`,
                    { 
                        signal: controller.signal,
                        cache: 'no-store',
                        headers: {
                            'Accept': 'application/json',
                        }
                    }
                );
                
                clearTimeout(timeoutId);
                
                if (!ethTxRes.ok) {
                    const errorText = await ethTxRes.text().catch(() => 'Unable to read error response');
                    console.error(`Etherscan ETH API HTTP error (attempt ${attempt}/${MAX_RETRIES}): ${ethTxRes.status} ${ethTxRes.statusText}`);
                    
                    // Retry on 5xx errors or rate limit (429)
                    if ((ethTxRes.status >= 500 || ethTxRes.status === 429) && attempt < MAX_RETRIES) {
                        console.warn(`Retrying Etherscan ETH API in ${RETRY_DELAY}ms...`);
                        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
                        continue;
                    }
                    
                    ethTxData = { status: '0', result: [], message: `HTTP ${ethTxRes.status}: ${errorText.substring(0, 100)}` };
                    break;
                }
                
                ethTxData = await ethTxRes.json();
                
                // Validate Etherscan response
                if (ethTxData.status === '0') {
                    if (ethTxData.message === 'NOTOK') {
                        if (ethTxData.result?.includes('deprecated')) {
                            console.error('Etherscan API V1 deprecated. Using V2 but may need valid API key.');
                            break; // Don't retry deprecated API
                        } else if (ethTxData.result?.includes('Missing/Invalid API Key')) {
                            console.warn('⚠️ Etherscan API key invalid or missing. Add ETHERSCAN_API_KEY to Vercel env vars.');
                            ethTxData = { status: '0', result: [], message: 'No API key' };
                            break; // Don't retry invalid API key
                        } else if (ethTxData.result?.includes('timeout') || ethTxData.result?.includes('server too busy')) {
                            // Retry on timeout/busy errors
                            if (attempt < MAX_RETRIES) {
                                console.warn(`Etherscan ETH timeout/busy (attempt ${attempt}/${MAX_RETRIES}), retrying in ${RETRY_DELAY * attempt}ms...`);
                                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
                                continue;
                            } else {
                                console.error('Etherscan ETH API timeout/busy after all retries:', ethTxData.message);
                            }
                        } else if (ethTxData.message !== 'No transactions found') {
                            console.warn(`Etherscan ETH API error (attempt ${attempt}/${MAX_RETRIES}):`, ethTxData.message, ethTxData.result);
                            // Don't retry on other NOTOK errors
                            break;
                        }
                    }
                } else if (ethTxData.status === '1') {
                    if (process.env.NODE_ENV === 'development') {
                        console.log(`✅ ETH transactions fetched successfully (attempt ${attempt}): ${Array.isArray(ethTxData.result) ? ethTxData.result.length : 'N/A'} transactions`);
                    }
                    break; // Success, exit retry loop
                }
                
            } catch (error) {
                const isTimeout = error.name === 'AbortError' || error.message.includes('timeout');
                const isNetworkError = error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND');
                
                console.error(`Error fetching ETH transactions (attempt ${attempt}/${MAX_RETRIES}):`, error.message);
                
                if (process.env.NODE_ENV === 'development') {
                    console.error('Full error:', error);
                }
                
                // Retry on timeout or network errors
                if ((isTimeout || isNetworkError) && attempt < MAX_RETRIES) {
                    console.warn(`Retrying Etherscan ETH API in ${RETRY_DELAY * attempt}ms due to ${isTimeout ? 'timeout' : 'network error'}...`);
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
                    continue;
                }
                
                ethTxData = { status: '0', result: [], message: error.message };
                break;
            }
        }
        
        if (ethTxData.status === '0' && ethTxData.result?.length === 0) {
            console.warn('⚠️ Failed to fetch ETH transactions from Etherscan after all retries. ETH volume will be incomplete.');
        }

        // Get pending transactions count (using V2 API with chainid=1 for Ethereum mainnet)
        // Retry logic for pending transactions (less critical, so fewer retries)
        let pendingData = { status: '0', result: [] };
        const PENDING_MAX_RETRIES = 2;
        
        for (let attempt = 1; attempt <= PENDING_MAX_RETRIES; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout per attempt
                
                const pendingRes = await fetch(
                    `https://api.etherscan.io/v2/api?module=account&action=txlist&address=${WALLET_ADDRESS}&chainid=1&startblock=0&endblock=99999999&sort=desc&apikey=${ETHERSCAN_API_KEY}`,
                    { 
                        signal: controller.signal,
                        cache: 'no-store',
                        headers: {
                            'Accept': 'application/json',
                        }
                    }
                );
                
                clearTimeout(timeoutId);
                
                if (!pendingRes.ok) {
                    // Don't retry pending transactions on HTTP errors, just log and continue
                    if (attempt === PENDING_MAX_RETRIES) {
                        console.warn(`Etherscan pending API HTTP error (final attempt): ${pendingRes.status} ${pendingRes.statusText}`);
                    }
                    pendingData = { status: '0', result: [] };
                    break;
                }
                
                pendingData = await pendingRes.json();
                
                // Validate response before processing
                if (pendingData.status === '0' && pendingData.message === 'NOTOK') {
                    if (pendingData.result?.includes('Missing/Invalid API Key')) {
                        console.warn('⚠️ Etherscan API key invalid for pending transactions check.');
                        pendingData = { status: '0', result: [] };
                        break; // Don't retry invalid API key
                    } else if (pendingData.result?.includes('timeout') || pendingData.result?.includes('server too busy')) {
                        // Retry on timeout/busy errors
                        if (attempt < PENDING_MAX_RETRIES) {
                            console.warn(`Etherscan pending timeout/busy (attempt ${attempt}/${PENDING_MAX_RETRIES}), retrying in ${RETRY_DELAY * attempt}ms...`);
                            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
                            continue;
                        } else {
                            console.warn('Etherscan pending API timeout/busy after retries:', pendingData.message);
                        }
                    } else {
                        console.warn(`Etherscan pending API error (attempt ${attempt}/${PENDING_MAX_RETRIES}):`, pendingData.message, pendingData.result);
                        break; // Don't retry on other errors
                    }
                } else {
                    break; // Success or no transactions found, exit retry loop
                }
                
            } catch (error) {
                const isTimeout = error.name === 'AbortError' || error.message.includes('timeout');
                const isNetworkError = error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND');
                
                if (attempt === PENDING_MAX_RETRIES) {
                    console.warn(`Error fetching pending transactions (final attempt):`, error.message);
                }
                
                // Retry on timeout or network errors
                if ((isTimeout || isNetworkError) && attempt < PENDING_MAX_RETRIES) {
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
                    continue;
                }
                
                pendingData = { status: '0', result: [] };
                break;
            }
        }
        
        const pendingTxCount = (Array.isArray(pendingData.result) 
            ? pendingData.result.filter(tx => !tx.blockNumber || tx.blockNumber === '0').length 
            : 0);

        // Process token transfers
        const tokensIn = {};
        const tokensOut = {};
        const tokenDecimals = {};
        const tokenNames = {};

        if (process.env.NODE_ENV === 'development') {
            console.log('Token transfer data status:', tokenTxData.status);
            console.log('Token transfer result type:', Array.isArray(tokenTxData.result) ? 'array' : typeof tokenTxData.result);
            console.log('Token transfer result length:', Array.isArray(tokenTxData.result) ? tokenTxData.result.length : 'N/A');
            if (tokenTxData.status === '0') {
                console.log('Token transfer error:', tokenTxData.message, tokenTxData.result);
            }
        }

        if (tokenTxData.status === '1' && Array.isArray(tokenTxData.result)) {
            let processedCount = 0;
            let filteredCount = 0;
            
            tokenTxData.result.forEach(tx => {
                const txTime = parseInt(tx.timeStamp);
                if (txTime < oneDayAgo) {
                    filteredCount++;
                    return;
                }

                processedCount++;
                const symbol = tx.tokenSymbol || 'UNKNOWN';
                const decimals = parseInt(tx.tokenDecimal) || 18;
                const value = parseFloat(tx.value) / Math.pow(10, decimals);

                tokenDecimals[symbol] = decimals;
                tokenNames[symbol] = tx.tokenName || symbol;

                if (tx.to.toLowerCase() === WALLET_ADDRESS.toLowerCase()) {
                    tokensIn[symbol] = (tokensIn[symbol] || 0) + value;
                } else if (tx.from.toLowerCase() === WALLET_ADDRESS.toLowerCase()) {
                    tokensOut[symbol] = (tokensOut[symbol] || 0) + value;
                }
            });

            if (process.env.NODE_ENV === 'development') {
                console.log(`ERC-20 Tokens processed: ${processedCount} in last 24h, ${filteredCount} filtered (older than 24h)`);
                console.log(`ERC-20 Tokens found:`, Object.keys(tokensIn).concat(Object.keys(tokensOut)).filter((v, i, a) => a.indexOf(v) === i));
                console.log(`ERC-20 Tokens IN:`, Object.keys(tokensIn).length, 'symbols');
                console.log(`ERC-20 Tokens OUT:`, Object.keys(tokensOut).length, 'symbols');
            }
        } else {
            if (process.env.NODE_ENV === 'development') {
                console.warn('⚠️ Token transfer data not available or invalid format');
                console.warn('Status:', tokenTxData.status, 'Message:', tokenTxData.message);
            }
        }

        // Process ETH transactions
        let ethInVolume = 0;
        let ethOutVolume = 0;

        if (ethTxData.status === '1' && Array.isArray(ethTxData.result)) {
            let ethTxCount = 0;
            let ethTxWithValue = 0;

            ethTxData.result.forEach(tx => {
                const txTime = parseInt(tx.timeStamp);
                if (txTime < oneDayAgo) return;

                ethTxCount++;
                const ethValue = parseFloat(tx.value) / 1e18;

                if (ethValue > 0.000000001) {
                    ethTxWithValue++;
                    if (tx.to.toLowerCase() === WALLET_ADDRESS.toLowerCase()) {
                        ethInVolume += ethValue;
                    } else if (tx.from.toLowerCase() === WALLET_ADDRESS.toLowerCase()) {
                        ethOutVolume += ethValue;
                    }
                }
            });

            if (process.env.NODE_ENV === 'development') {
                console.log(`ETH Transactions processed: ${ethTxCount} total, ${ethTxWithValue} with value > 0`);
                console.log(`ETH Volumes - IN: ${tokensIn['ETH'] || 0}, OUT: ${tokensOut['ETH'] || 0}`);
            }
        } else {
            if (process.env.NODE_ENV === 'development') {
                console.log(`ETH Transaction fetch failed or empty. Status: ${ethTxData.status}`);
            }
        }

        if (ethInVolume > 0) {
            tokensIn['ETH'] = (tokensIn['ETH'] || 0) + ethInVolume;
        }
        if (ethOutVolume > 0) {
            tokensOut['ETH'] = (tokensOut['ETH'] || 0) + ethOutVolume;
        }

        // Collect all unique token symbols
        const allSymbols = new Set([...Object.keys(tokensIn), ...Object.keys(tokensOut)]);
        
        if (process.env.NODE_ENV === 'development') {
            console.log('Tokens IN keys:', Object.keys(tokensIn));
            console.log('Tokens OUT keys:', Object.keys(tokensOut));
            console.log('All symbols collected:', Array.from(allSymbols));
            console.log('Tokens IN volumes:', Object.entries(tokensIn).filter(([k, v]) => v > 0).map(([k, v]) => `${k}:${v}`).join(', '));
            console.log('Tokens OUT volumes:', Object.entries(tokensOut).filter(([k, v]) => v > 0).map(([k, v]) => `${k}:${v}`).join(', '));
        }
        
        // Mapping for common tokens to CoinGecko IDs (fallback when contract address lookup fails)
        const symbolToCoinGeckoId = {
            'USDT': 'tether',
            'USDC': 'usd-coin',
            'DAI': 'dai',
            'WETH': 'weth',
            'WBTC': 'wrapped-bitcoin',
            'LINK': 'chainlink',
            'UNI': 'uniswap',
            'AAVE': 'aave',
            'MATIC': 'matic-network',
            'SHIB': 'shiba-inu',
            'CRV': 'curve-dao-token',
            'MKR': 'maker',
            'SNX': 'havven',
            'COMP': 'compound-governance-token',
            'YFI': 'yearn-finance',
            'SUSHI': 'sushi',
            'GRT': 'the-graph',
            'BAT': 'basic-attention-token',
            'ENJ': 'enjincoin',
            'MANA': 'decentraland',
            'SAND': 'the-sandbox',
            'AXS': 'axie-infinity',
            'FTM': 'fantom',
            'AVAX': 'avalanche-2',
            'ATOM': 'cosmos',
            'DOT': 'polkadot',
            'SOL': 'solana',
            'ADA': 'cardano',
            'XRP': 'ripple',
            'DOGE': 'dogecoin',
            'LTC': 'litecoin',
            'BCH': 'bitcoin-cash',
            'ETC': 'ethereum-classic',
            'XLM': 'stellar',
            'XMR': 'monero',
            'TRX': 'tron',
            'EOS': 'eos',
            'NEO': 'neo',
            'VET': 'vechain',
            'THETA': 'theta-token',
            'FIL': 'filecoin',
            'ALGO': 'algorand',
            'XTZ': 'tezos',
            'DASH': 'dash',
            'ZEC': 'zcash',
            'WAVES': 'waves',
            'QTUM': 'qtum',
            'ONT': 'ontology',
            'ZIL': 'zilliqa',
            'ICX': 'icon',
            'OMG': 'omisego',
            'ZRX': '0x',
            'LEND': 'ethlend',
            'REN': 'republic-protocol',
            'KNC': 'kyber-network',
            'BAL': 'balancer',
            'BAND': 'band-protocol',
            'NMR': 'numeraire',
            'ANT': 'aragon',
            'REP': 'augur',
            'LRC': 'loopring',
            'STORJ': 'storj',
            'GNO': 'gnosis',
            'RLC': 'iexec-rlc',
            'BNT': 'bancor',
            'MLN': 'melon',
            'POLY': 'polymath',
            'POWR': 'power-ledger',
            'REQ': 'request-network',
            'MONA': 'monavale',
            'MTL': 'metal',
            'PAY': 'tenx',
            'SALT': 'salt',
            'SUB': 'substratum',
            'TNB': 'time-new-bank',
            'TNT': 'tierion',
            'VEN': 'vechain',
            'VIB': 'viberate',
            'VIBE': 'vibe',
            'WABI': 'wabi',
            'WTC': 'waltonchain',
            'XVG': 'verge',
            'XZC': 'zcoin',
            'YOYO': 'yoyow',
            'PEPE': 'pepe',
            'FLOKI': 'floki',
            'GALA': 'gala',
            'CHZ': 'chiliz',
            'ENA': 'ethena',
            'GMT': 'stepn',
            'FET': 'fetch-ai',
            'POL': 'polygon',
            'JASMY': 'jasmycoin'
        };

        // Fetch token prices from Bitfinex
        // Retry logic for Bitfinex API
        const tokenPrices = {};
        const BITFINEX_MAX_RETRIES = 2;
        const BITFINEX_RETRY_DELAY = 500;
        
        for (let attempt = 1; attempt <= BITFINEX_MAX_RETRIES; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
                
                const tickersRes = await fetch('https://api-pub.bitfinex.com/v2/tickers?symbols=ALL', {
                    signal: controller.signal,
                    cache: 'no-store',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                });
                
                clearTimeout(timeoutId);

                if (!tickersRes.ok) {
                    const errorText = await tickersRes.text().catch(() => 'Unable to read error response');
                    console.warn(`Bitfinex API returned status ${tickersRes.status} (attempt ${attempt}/${BITFINEX_MAX_RETRIES}): ${errorText.substring(0, 100)}`);
                    
                    // Retry on 5xx errors or rate limit (429)
                    if ((tickersRes.status >= 500 || tickersRes.status === 429) && attempt < BITFINEX_MAX_RETRIES) {
                        console.warn(`Retrying Bitfinex API in ${BITFINEX_RETRY_DELAY * attempt}ms...`);
                        await new Promise(resolve => setTimeout(resolve, BITFINEX_RETRY_DELAY * attempt));
                        continue;
                    }
                    
                    // If all retries failed, continue without prices
                    if (process.env.NODE_ENV === 'development') {
                        console.warn('⚠️ Failed to fetch prices from Bitfinex after all retries. Tokens will have price 0.');
                    }
                    break;
                } else {
                const tickersData = await tickersRes.json();
                
                // Ticker format: [SYMBOL, BID, BID_SIZE, ASK, ASK_SIZE, DAILY_CHANGE, DAILY_CHANGE_PERC, LAST_PRICE, VOLUME, HIGH, LOW]
                // Create a map of Bitfinex symbols to prices
                const bitfinexPriceMap = new Map();
                
                tickersData.forEach(ticker => {
                    const symbol = ticker[0];
                    if (symbol.startsWith('t')) {
                        const lastPrice = ticker[7]; // LAST_PRICE is at index 7
                        if (lastPrice && lastPrice > 0) {
                            // Remove 't' prefix and store: tBTCUSD -> BTCUSD
                            const symbolWithoutPrefix = symbol.substring(1);
                            bitfinexPriceMap.set(symbolWithoutPrefix, lastPrice);
                        }
                    }
                });

                if (process.env.NODE_ENV === 'development') {
                    console.log(`Fetched ${bitfinexPriceMap.size} tickers from Bitfinex`);
                }

                // Map ERC20 token symbols to Bitfinex symbols
                // Bitfinex format: SYMBOLUSD (e.g., USDTUSD, PEPEUSD) or SYMBOL:USD (e.g., ETH:USD)
                if (process.env.NODE_ENV === 'development') {
                    console.log(`Sample Bitfinex symbols:`, Array.from(bitfinexPriceMap.keys()).slice(0, 10).join(', '));
                    console.log(`Tokens to match:`, Array.from(allSymbols).join(', '));
                }
                
                Array.from(allSymbols).forEach(symbol => {
                    if (symbol === 'ETH') {
                        // ETH is special - try ETHUSD first, then ETH:USD
                        const ethPrice = bitfinexPriceMap.get('ETHUSD') || bitfinexPriceMap.get('ETH:USD');
                        if (ethPrice) {
                            tokenPrices['ETH'] = ethPrice;
                        } else if (process.env.NODE_ENV === 'development') {
                            console.log(`ETH not found in Bitfinex. Available ETH symbols:`, Array.from(bitfinexPriceMap.keys()).filter(k => k.includes('ETH')).join(', '));
                        }
                    } else {
                        // Try direct match: SYMBOLUSD
                        const directMatch = bitfinexPriceMap.get(`${symbol}USD`);
                        if (directMatch) {
                            tokenPrices[symbol] = directMatch;
                        } else {
                            // Try with colon: SYMBOL:USD
                            const colonMatch = bitfinexPriceMap.get(`${symbol}:USD`);
                            if (colonMatch) {
                                tokenPrices[symbol] = colonMatch;
                            } else if (process.env.NODE_ENV === 'development') {
                                // Debug: show similar symbols
                                const similar = Array.from(bitfinexPriceMap.keys()).filter(k => k.includes(symbol)).slice(0, 3);
                                if (similar.length > 0) {
                                    console.log(`Token ${symbol} not found. Similar symbols:`, similar.join(', '));
                                }
                            }
                        }
                    }
                });

                    if (process.env.NODE_ENV === 'development') {
                        console.log(`✅ Matched ${Object.keys(tokenPrices).length} tokens with Bitfinex prices (attempt ${attempt}):`, Object.keys(tokenPrices).join(', '));
                    }
                    break; // Success, exit retry loop
                }
            } catch (error) {
                const isTimeout = error.name === 'AbortError' || error.message.includes('timeout');
                const isNetworkError = error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND');
                
                console.error(`Error fetching token prices from Bitfinex (attempt ${attempt}/${BITFINEX_MAX_RETRIES}):`, error.message);
                
                if (process.env.NODE_ENV === 'development') {
                    console.error('Full error:', error);
                }
                
                // Retry on timeout or network errors
                if ((isTimeout || isNetworkError) && attempt < BITFINEX_MAX_RETRIES) {
                    console.warn(`Retrying Bitfinex API in ${BITFINEX_RETRY_DELAY * attempt}ms due to ${isTimeout ? 'timeout' : 'network error'}...`);
                    await new Promise(resolve => setTimeout(resolve, BITFINEX_RETRY_DELAY * attempt));
                    continue;
                }
                
                // If all retries failed, continue without prices
                if (process.env.NODE_ENV === 'development') {
                    console.warn('⚠️ Failed to fetch prices from Bitfinex after all retries. Tokens will have price 0.');
                }
                break;
            }
        }
        
        if (Object.keys(tokenPrices).length === 0 && allSymbols.size > 0) {
            console.warn(`⚠️ No token prices fetched from Bitfinex. ${allSymbols.size} tokens will have price 0.`);
        }

        // Ensure ETH is in the symbols list if it has volume
        if ((ethInVolume > 0 || ethOutVolume > 0) && !allSymbols.has('ETH')) {
            allSymbols.add('ETH');
            if (process.env.NODE_ENV === 'development') {
                console.log('Added ETH to symbols list - IN:', ethInVolume, 'OUT:', ethOutVolume);
            }
        }

        if (process.env.NODE_ENV === 'development') {
            console.log('All symbols before processing:', Array.from(allSymbols));
            console.log('ETH volumes - IN:', ethInVolume, 'OUT:', ethOutVolume);
        }

        // Build token list with volumes
        const tokens = Array.from(allSymbols).map(symbol => {
            const inVolume = tokensIn[symbol] || 0;
            const outVolume = tokensOut[symbol] || 0;
            const price = tokenPrices[symbol] || 0;
            
            const tokenData = {
                symbol,
                name: tokenNames[symbol] || symbol,
                inVolume,
                outVolume,
                inVolumeUSD: price > 0 ? inVolume * price : 0,
                outVolumeUSD: price > 0 ? outVolume * price : 0,
                price,
            };
            
            if (process.env.NODE_ENV === 'development' && (inVolume > 0 || outVolume > 0)) {
                console.log(`Token ${symbol}: IN=${inVolume}, OUT=${outVolume}, Price=${price}, IN_USD=${tokenData.inVolumeUSD}, OUT_USD=${tokenData.outVolumeUSD}`);
            }
            
            return tokenData;
        });

        // Filter out tokens with zero volume first
        const tokensWithVolume = tokens.filter(token => {
            const totalVolume = (token.inVolume || 0) + (token.outVolume || 0);
            return totalVolume > 0;
        });

        if (process.env.NODE_ENV === 'development') {
            console.log(`Tokens with volume: ${tokensWithVolume.length} out of ${tokens.length} total`);
        }

        // Sort by total volume (IN + OUT) descending, but prioritize ETH if it has volume
        const topTokens = tokensWithVolume.sort((a, b) => {
            // Always put ETH first if it has volume
            const ethTotalVolume = (ethInVolume + ethOutVolume);
            if (a.symbol === 'ETH' && ethTotalVolume > 0) return -1;
            if (b.symbol === 'ETH' && ethTotalVolume > 0) return 1;
            
            // Sort by USD volume if available, otherwise by raw volume
            const aTotalVolumeUSD = (a.inVolumeUSD || 0) + (a.outVolumeUSD || 0);
            const bTotalVolumeUSD = (b.inVolumeUSD || 0) + (b.outVolumeUSD || 0);
            
            if (aTotalVolumeUSD > 0 || bTotalVolumeUSD > 0) {
                return bTotalVolumeUSD - aTotalVolumeUSD;
            }
            
            // Fallback to raw volume
            const aTotalVolume = (a.outVolume || 0) + (a.inVolume || 0);
            const bTotalVolume = (b.outVolume || 0) + (b.inVolume || 0);
            
            return bTotalVolume - aTotalVolume;
        }).slice(0, 10); // Take top 10 tokens (ETH will be first if it has volume)
        
        // Log final tokens for debugging
        if (process.env.NODE_ENV === 'development') {
            console.log(`\n=== FINAL TOKEN SUMMARY ===`);
            console.log(`Total tokens in response: ${topTokens.length}`);
            console.log(`Tokens:`, topTokens.map(t => `${t.symbol}(IN:${t.inVolume.toFixed(2)},OUT:${t.outVolume.toFixed(2)},IN_USD:${t.inVolumeUSD.toFixed(2)},OUT_USD:${t.outVolumeUSD.toFixed(2)})`).join(', '));
            
            const ethToken = topTokens.find(t => t.symbol === 'ETH');
            if (ethToken) {
                console.log(`✅ ETH found - IN: ${ethToken.inVolume}, OUT: ${ethToken.outVolume}, IN_USD: ${ethToken.inVolumeUSD}, OUT_USD: ${ethToken.outVolumeUSD}`);
            } else {
                console.log('❌ ETH NOT found in final response');
                if (ethInVolume > 0 || ethOutVolume > 0) {
                    console.log('⚠️ ETH has volume but was excluded - this is a bug!');
                } else {
                    console.log('ℹ️ ETH has no volume in last 24h, so it was correctly excluded');
                }
            }
            
            const erc20Tokens = topTokens.filter(t => t.symbol !== 'ETH');
            console.log(`ERC-20 tokens found: ${erc20Tokens.length}`);
            if (erc20Tokens.length === 0) {
                console.warn('⚠️ No ERC-20 tokens in final response!');
                console.log('All symbols collected:', Array.from(allSymbols));
                console.log('Tokens IN keys:', Object.keys(tokensIn));
                console.log('Tokens OUT keys:', Object.keys(tokensOut));
            }
            console.log(`========================\n`);
        }

        return NextResponse.json(
            {
                address: WALLET_ADDRESS,
                pendingTxCount,
                topTokens: topTokens, // Changed from 'tokens' to 'topTokens' to match frontend
                tokens: topTokens, // Keep for backward compatibility
                lastUpdate: new Date().toISOString(),
            },
            {
                headers: getRateLimitHeaders(rateLimitResult)
            }
        );

    } catch (error) {
        console.error("Critical error in wallet API:", error.message);
        
        if (process.env.NODE_ENV === 'development') {
            console.error('Full error stack:', error.stack);
            console.error('Error details:', {
                name: error.name,
                message: error.message,
                cause: error.cause
            });
        }
        
        // Try to return partial data if we have any tokens processed
        // This allows the frontend to show something even if there was an error
        try {
            // Check if we have any data that was successfully processed before the error
            const hasAnyData = (typeof tokensIn !== 'undefined' && Object.keys(tokensIn).length > 0) || 
                              (typeof tokensOut !== 'undefined' && Object.keys(tokensOut).length > 0) ||
                              (typeof ethInVolume !== 'undefined' && ethInVolume > 0) ||
                              (typeof ethOutVolume !== 'undefined' && ethOutVolume > 0);
            
            if (hasAnyData && typeof allSymbols !== 'undefined' && allSymbols.size > 0) {
                console.warn('⚠️ Returning partial wallet data due to error');
                
                // Build minimal token list from what we have
                const partialTokens = Array.from(allSymbols).map(symbol => ({
                    symbol,
                    name: (typeof tokenNames !== 'undefined' && tokenNames[symbol]) || symbol,
                    inVolume: (typeof tokensIn !== 'undefined' && tokensIn[symbol]) || 0,
                    outVolume: (typeof tokensOut !== 'undefined' && tokensOut[symbol]) || 0,
                    inVolumeUSD: 0, // Prices not available due to error
                    outVolumeUSD: 0,
                    price: 0
                })).filter(t => (t.inVolume > 0 || t.outVolume > 0)).slice(0, 10);
                
                return NextResponse.json(
                    {
                        address: WALLET_ADDRESS,
                        pendingTxCount: (typeof pendingTxCount !== 'undefined') ? pendingTxCount : 0,
                        topTokens: partialTokens,
                        tokens: partialTokens,
                        lastUpdate: new Date().toISOString(),
                        warning: 'Partial data due to processing error',
                        error: process.env.NODE_ENV === 'development' ? error.message : 'Some data may be incomplete'
                    },
                    { 
                        status: 206, // Partial Content
                        headers: getRateLimitHeaders(rateLimitResult)
                    }
                );
            }
        } catch (partialError) {
            console.error('Error building partial response:', partialError.message);
        }
        
        return NextResponse.json(
            { 
                error: "Failed to fetch wallet data",
                details: process.env.NODE_ENV === 'development' ? error.message : undefined,
                retryAfter: 60 // Suggest retrying after 60 seconds
            },
            { 
                status: 500,
                headers: {
                    ...getRateLimitHeaders(rateLimitResult),
                    'Retry-After': '60'
                }
            }
        );
    }
}
