import { NextResponse } from 'next/server';
import { rateLimit, getRateLimitHeaders } from '@/lib/rateLimit';

const WALLET_ADDRESS = '0x77134cbC06cB00b66F4c7e623D5fdBF6777635EC';
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || 'YourApiKeyToken';

// Mapa de contract addresses conocidos para tokens populares
// Esto permite obtener balances incluso si el token no tuvo transacciones recientes
const KNOWN_TOKEN_CONTRACTS = {
    'UNI': '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
    'USDT': '0xdac17f958d2ee523a2206206994597c13d831ec7',
    'USDC': '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    'LINK': '0x514910771af9ca656af840dff83e8264ecf986ca',
    'AAVE': '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9',
    'ZRX': '0xe41d2489571d322189246dafa5ebde1f4699f498',
    'LEO': '0x2af5d2ad76741191d15dfe7bf6ac92d4bd912ca3',
    'GMT': '0x7ddc52c4de30e94be3a6a0a2b259b2850f421989',
    'XAUt': '0x68749665ff8d2d112fa859aa293f07a622782f38',
    'FLOKI': '0xcf0c122c6b73ff809c693db761e7baebe62b6a2e',
    'PEPE': '0x6982508145454ce325ddbe47a25d4ec3d2311933',
    'LIF3': '0x7138eb0d563f3f6722500936a11dcae99d738a2c',
    'PNK': '0x93ed3fbe21207ec2e8f2d3c3de6e058cb73bc04d',
    'SPEC': '0xadf7c35560035944e805d98ff17d58cde2449389',
};

// Mapa de decimals conocidos para tokens populares
const KNOWN_TOKEN_DECIMALS = {
    'UNI': 18,
    'USDT': 6,
    'USDC': 6,
    'LINK': 18,
    'AAVE': 18,
    'ZRX': 18,
    'LEO': 18,
    'GMT': 18,
    'XAUt': 6,
    'FLOKI': 18,
    'PEPE': 18,
    'LIF3': 18,
    'PNK': 18,
    'SPEC': 18,
};

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
                        const sample = tokenTxData.result[0];
                        console.log('Sample token transfer fields:', Object.keys(sample));
                        console.log('Sample token transfer contract address field:', {
                            contractAddress: sample.contractAddress,
                            tokenAddress: sample.tokenAddress,
                            address: sample.address,
                            contract: sample.contract
                        });
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
        const tokenContractAddresses = {}; // Map symbol -> contract address

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
            let contractAddressCount = 0;
            let missingContractAddress = [];
            
            if (process.env.NODE_ENV === 'development') {
                console.log(`\n=== TOKEN TRANSFERS DEBUG ===`);
                console.log(`Total transactions from Etherscan: ${tokenTxData.result.length}`);
                console.log(`Time window: ${new Date(oneDayAgo * 1000).toISOString()} to ${new Date(now * 1000).toISOString()}`);
            }
            
            tokenTxData.result.forEach((tx, index) => {
                const txTime = parseInt(tx.timeStamp);
                if (txTime < oneDayAgo) {
                    filteredCount++;
                    return;
                }

                processedCount++;
                const symbol = tx.tokenSymbol || 'UNKNOWN';
                const decimals = parseInt(tx.tokenDecimal) || 18;
                const value = parseFloat(tx.value) / Math.pow(10, decimals);
                // Try multiple possible field names for contract address (Etherscan V2 API uses 'contractAddress')
                const contractAddress = tx.contractAddress || tx.tokenAddress || tx.address || tx.contract || null;

                // Debug first few transactions
                if (process.env.NODE_ENV === 'development' && processedCount <= 3) {
                    console.log(`\nTransaction ${processedCount}:`);
                    console.log(`  Symbol: ${symbol}`);
                    console.log(`  Name: ${tx.tokenName || 'N/A'}`);
                    console.log(`  Contract Address: ${contractAddress || 'MISSING'}`);
                    console.log(`  Value (raw): ${tx.value}`);
                    console.log(`  Value (formatted): ${value}`);
                    console.log(`  Decimals: ${decimals}`);
                    console.log(`  From: ${tx.from}`);
                    console.log(`  To: ${tx.to}`);
                    console.log(`  Direction: ${tx.to.toLowerCase() === WALLET_ADDRESS.toLowerCase() ? 'IN' : 'OUT'}`);
                    console.log(`  Timestamp: ${new Date(txTime * 1000).toISOString()}`);
                }

                tokenDecimals[symbol] = decimals;
                tokenNames[symbol] = tx.tokenName || symbol;
                // Store contract address for balance fetching (use first occurrence)
                if (contractAddress && !tokenContractAddresses[symbol]) {
                    tokenContractAddresses[symbol] = contractAddress;
                    contractAddressCount++;
                } else if (!contractAddress && !missingContractAddress.includes(symbol)) {
                    missingContractAddress.push(symbol);
                }

                if (tx.to.toLowerCase() === WALLET_ADDRESS.toLowerCase()) {
                    tokensIn[symbol] = (tokensIn[symbol] || 0) + value;
                } else if (tx.from.toLowerCase() === WALLET_ADDRESS.toLowerCase()) {
                    tokensOut[symbol] = (tokensOut[symbol] || 0) + value;
                }
            });

            if (process.env.NODE_ENV === 'development') {
                console.log(`\n=== PROCESSING SUMMARY ===`);
                console.log(`ERC-20 Tokens processed: ${processedCount} in last 24h, ${filteredCount} filtered (older than 24h)`);
                console.log(`ERC-20 Tokens found:`, Object.keys(tokensIn).concat(Object.keys(tokensOut)).filter((v, i, a) => a.indexOf(v) === i));
                console.log(`ERC-20 Tokens IN:`, Object.keys(tokensIn).length, 'symbols');
                console.log(`ERC-20 Tokens OUT:`, Object.keys(tokensOut).length, 'symbols');
                console.log(`Contract addresses stored: ${contractAddressCount}`);
                console.log(`Tokens with contract addresses:`, Object.keys(tokenContractAddresses));
                if (missingContractAddress.length > 0) {
                    console.warn(`⚠️ Tokens missing contract address:`, missingContractAddress);
                }
                console.log(`========================\n`);
            }
        } else {
            if (process.env.NODE_ENV === 'development') {
                console.warn('⚠️ Token transfer data not available or invalid format');
                console.warn('Status:', tokenTxData.status, 'Message:', tokenTxData.message);
                console.warn('Result type:', typeof tokenTxData.result);
                console.warn('Result:', tokenTxData.result);
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
        
        // Add known tokens to allSymbols to ensure we fetch prices for them
        // This is important for tokens that may have balances but no recent transactions
        Object.keys(KNOWN_TOKEN_CONTRACTS).forEach(symbol => {
            allSymbols.add(symbol);
        });
        
        if (process.env.NODE_ENV === 'development') {
            console.log('Tokens IN keys:', Object.keys(tokensIn));
            console.log('Tokens OUT keys:', Object.keys(tokensOut));
            console.log('All symbols collected (including known tokens):', Array.from(allSymbols));
            console.log('Tokens IN volumes:', Object.entries(tokensIn).filter(([k, v]) => v > 0).map(([k, v]) => `${k}:${v}`).join(', '));
            console.log('Tokens OUT volumes:', Object.entries(tokensOut).filter(([k, v]) => v > 0).map(([k, v]) => `${k}:${v}`).join(', '));
        }
        
        // Simple in-memory cache for prices (5 minutes TTL)
        // In production, consider using Redis or similar for distributed caching
        const PRICE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
        if (!global.priceCache) {
            global.priceCache = new Map();
        }
        const priceCache = global.priceCache;
        
        // Clean old cache entries periodically
        const cacheNow = Date.now();
        for (const [key, value] of priceCache.entries()) {
            if (cacheNow - value.timestamp > PRICE_CACHE_TTL) {
                priceCache.delete(key);
            }
        }
        
        // Check cache first
        const cacheKey = Array.from(allSymbols).sort().join(',');
        const cached = priceCache.get(cacheKey);
        let tokenPrices = {};
        
        if (cached && (cacheNow - cached.timestamp) < PRICE_CACHE_TTL) {
            if (process.env.NODE_ENV === 'development') {
                console.log('✅ Using cached prices');
            }
            tokenPrices = cached.prices;
        } else {
            // Fetch token prices from CoinMarketCap (with CoinGecko fallback)
        const CMC_API_KEY = process.env.COINMARKETCAP_API_KEY;
        const MAX_RETRIES = 2;
        const RETRY_DELAY = 1000;

        // Function to fetch prices from CoinMarketCap
        const fetchCoinMarketCapPrices = async (symbols) => {
            if (!CMC_API_KEY) {
                if (process.env.NODE_ENV === 'development') {
                    console.log('ℹ️ COINMARKETCAP_API_KEY not set. Will use CoinGecko as fallback.');
                }
                return null; // Signal to use fallback
            }

            // CoinMarketCap allows up to 100 symbols per request
            const symbolsArray = Array.from(symbols).slice(0, 100);
            const symbolsList = symbolsArray.join(',');

            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 second timeout

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
                        const errorText = await response.text().catch(() => 'Unable to read error response');
                        console.warn(`CoinMarketCap API returned status ${response.status} (attempt ${attempt}/${MAX_RETRIES}): ${errorText.substring(0, 100)}`);
                        
                        // Retry on 5xx errors or rate limit (429)
                        if ((response.status >= 500 || response.status === 429) && attempt < MAX_RETRIES) {
                            console.warn(`Retrying CoinMarketCap API in ${RETRY_DELAY * attempt}ms...`);
                            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
                            continue;
                        }
                        
                        // If 401/403, API key might be invalid, try fallback
                        if (response.status === 401 || response.status === 403) {
                            if (process.env.NODE_ENV === 'development') {
                                console.warn('⚠️ CoinMarketCap API key invalid or missing. Using CoinGecko fallback.');
                            }
                            return null; // Signal to use fallback
                        }
                        
                        return {}; // Empty prices on other errors
                    }

                    const data = await response.json();
                    const prices = {};

                    // CoinMarketCap response structure:
                    // { data: { SYMBOL: [{ quote: { USD: { price: ... } } }] } }
                    if (data.data) {
                        Object.keys(data.data).forEach(symbol => {
                            const tokenData = data.data[symbol];
                            // Handle array response (multiple tokens with same symbol)
                            const tokenArray = Array.isArray(tokenData) ? tokenData : [tokenData];
                            
                            // Use first result (most popular) or filter by Ethereum platform
                            const ethereumToken = tokenArray.find(t => 
                                t.platform && t.platform.name === 'Ethereum'
                            ) || tokenArray[0];
                            
                            if (ethereumToken && ethereumToken.quote && ethereumToken.quote.USD && ethereumToken.quote.USD.price) {
                                prices[symbol.toUpperCase()] = ethereumToken.quote.USD.price;
                            }
                        });
                    }

                    if (process.env.NODE_ENV === 'development') {
                        console.log(`✅ Fetched ${Object.keys(prices).length} prices from CoinMarketCap`);
                    }

                    return prices;
                } catch (error) {
                    const isTimeout = error.name === 'AbortError' || error.message.includes('timeout');
                    const isNetworkError = error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND');
                    
                    console.error(`Error fetching CoinMarketCap prices (attempt ${attempt}/${MAX_RETRIES}):`, error.message);
                    
                    if (process.env.NODE_ENV === 'development') {
                        console.error('Full error:', error);
                    }
                    
                    // Retry on timeout or network errors
                    if ((isTimeout || isNetworkError) && attempt < MAX_RETRIES) {
                        console.warn(`Retrying CoinMarketCap API in ${RETRY_DELAY * attempt}ms due to ${isTimeout ? 'timeout' : 'network error'}...`);
                        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
                        continue;
                    }
                    
                    // On final failure, try fallback
                    return null;
                }
            }
            
            return null; // Signal to use fallback
        };

        // Function to fetch prices from CoinGecko (fallback, no API key needed)
        const fetchCoinGeckoPrices = async (symbols) => {
            // CoinGecko mapping for common tokens
        const symbolToCoinGeckoId = {
                'ETH': 'ethereum',
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
                'PEPE': 'pepe',
                'FLOKI': 'floki',
                'CHZ': 'chiliz',
                'GALA': 'gala',
                'GMT': 'stepn',
                'FET': 'fetch-ai',
                'POL': 'polygon',
                'JASMY': 'jasmycoin',
                'ENA': 'ethena'
            };

            // Build list of CoinGecko IDs
            const coinGeckoIds = [];
            const symbolToIdMap = new Map();
            
            Array.from(symbols).forEach(symbol => {
                const id = symbolToCoinGeckoId[symbol.toUpperCase()];
                if (id) {
                    coinGeckoIds.push(id);
                    symbolToIdMap.set(id, symbol.toUpperCase());
                }
            });

            if (coinGeckoIds.length === 0) {
                return {};
            }

            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000);
                
                const idsList = coinGeckoIds.join(',');
                const response = await fetch(
                    `https://api.coingecko.com/api/v3/simple/price?ids=${idsList}&vs_currencies=usd`,
                    {
                        signal: controller.signal,
                        cache: 'no-store',
                        headers: {
                            'Accept': 'application/json'
                        }
                    }
                );

                clearTimeout(timeoutId);

                if (!response.ok) {
                    console.warn(`CoinGecko API returned status ${response.status}`);
                    return {};
                }

                const data = await response.json();
                const prices = {};

                // CoinGecko response: { "ethereum": { "usd": 2920.1 }, ... }
                Object.keys(data).forEach(id => {
                    const symbol = symbolToIdMap.get(id);
                    if (symbol && data[id].usd) {
                        prices[symbol] = data[id].usd;
                    }
                });

                if (process.env.NODE_ENV === 'development') {
                    console.log(`✅ Fetched ${Object.keys(prices).length} prices from CoinGecko (fallback)`);
                }

                return prices;
            } catch (error) {
                console.error('Error fetching CoinGecko prices:', error.message);
                return {};
            }
        };

        // Try CoinMarketCap first, fallback to CoinGecko
        let prices = await fetchCoinMarketCapPrices(allSymbols);
        
        if (prices === null) {
            // Use CoinGecko as fallback
            if (process.env.NODE_ENV === 'development') {
                console.log('Using CoinGecko as fallback for token prices');
            }
            prices = await fetchCoinGeckoPrices(allSymbols);
        }

        // Merge prices into tokenPrices
        Object.assign(tokenPrices, prices);

        // Normalize prices: ensure all symbols in allSymbols have their price mapped correctly
        // CoinMarketCap returns uppercase symbols, but we need to match original case
        const normalizedPrices = {};
        Array.from(allSymbols).forEach(symbol => {
            const symbolUpper = symbol.toUpperCase();
            // Try uppercase first (CoinMarketCap format), then original case, then case-insensitive search
            if (tokenPrices[symbolUpper]) {
                normalizedPrices[symbol] = tokenPrices[symbolUpper];
            } else if (tokenPrices[symbol]) {
                normalizedPrices[symbol] = tokenPrices[symbol];
            } else {
                // Case-insensitive search
                const foundKey = Object.keys(tokenPrices).find(k => k.toUpperCase() === symbolUpper);
                if (foundKey) {
                    normalizedPrices[symbol] = tokenPrices[foundKey];
                }
            }
        });
        
            // Replace tokenPrices with normalized version
            Object.assign(tokenPrices, normalizedPrices);

            if (process.env.NODE_ENV === 'development') {
                console.log(`✅ Total tokens with prices: ${Object.keys(tokenPrices).length} out of ${allSymbols.size}`);
                console.log(`Tokens with prices:`, Object.keys(tokenPrices).join(', '));
                const tokensWithoutPrice = Array.from(allSymbols).filter(s => !tokenPrices[s.toUpperCase()] && !tokenPrices[s]);
                if (tokensWithoutPrice.length > 0) {
                    console.log(`Tokens without prices:`, tokensWithoutPrice.join(', '));
                }
            }

            // Store in cache
            priceCache.set(cacheKey, {
                prices: tokenPrices,
                timestamp: cacheNow
            });
        }

        if (Object.keys(tokenPrices).length === 0 && allSymbols.size > 0) {
            console.warn(`⚠️ No token prices fetched. ${allSymbols.size} tokens will have price 0.`);
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
            // Usar contract address de transacciones, o del mapa conocido, o null
            const contractAddress = tokenContractAddresses[symbol] || KNOWN_TOKEN_CONTRACTS[symbol] || null;
            
            const tokenData = {
                symbol,
                name: tokenNames[symbol] || symbol,
                inVolume,
                outVolume,
                inVolumeUSD: price > 0 ? inVolume * price : 0,
                outVolumeUSD: price > 0 ? outVolume * price : 0,
                price,
                contractAddress: contractAddress,
            };
            
            if (process.env.NODE_ENV === 'development' && (inVolume > 0 || outVolume > 0)) {
                console.log(`Token ${symbol}: IN=${inVolume.toFixed(4)}, OUT=${outVolume.toFixed(4)}, Price=$${price.toFixed(6)}, Contract=${contractAddress || 'MISSING'}`);
            }
            
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

        // Fetch current balances for top tokens
        const fetchTokenBalance = async (contractAddress, decimals) => {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);
                
                // Use V2 API with chainid=1
                const response = await fetch(
                    `https://api.etherscan.io/v2/api?module=account&action=tokenbalance&contractaddress=${contractAddress}&address=${WALLET_ADDRESS}&chainid=1&tag=latest&apikey=${ETHERSCAN_API_KEY}`,
                    {
                        signal: controller.signal,
                        cache: 'no-store',
                        headers: { 'Accept': 'application/json' }
                    }
                );
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    if (process.env.NODE_ENV === 'development') {
                        console.warn(`Token balance API HTTP error for ${contractAddress}: ${response.status}`);
                    }
                    return null;
                }
                
                const data = await response.json();
                if (data.status === '1' && data.result) {
                    const rawBalance = data.result;
                    const balance = parseFloat(rawBalance) / Math.pow(10, decimals);
                    if (process.env.NODE_ENV === 'development') {
                        console.log(`✅ Balance fetched for contract ${contractAddress}: ${balance.toFixed(6)} (raw: ${rawBalance}, decimals: ${decimals})`);
                    }
                    return balance;
                } else {
                    if (process.env.NODE_ENV === 'development') {
                        console.warn(`❌ Token balance API error for ${contractAddress}:`, data.message, data.result);
                        console.warn(`   Response status: ${data.status}, Message: ${data.message}`);
                    }
                }
                return null;
            } catch (error) {
                if (process.env.NODE_ENV === 'development') {
                    console.warn(`Error fetching balance for contract ${contractAddress}:`, error.message);
                }
                return null;
            }
        };

        const fetchETHBalance = async () => {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);
                
                // Use V2 API with chainid=1
                const response = await fetch(
                    `https://api.etherscan.io/v2/api?module=account&action=balance&address=${WALLET_ADDRESS}&chainid=1&tag=latest&apikey=${ETHERSCAN_API_KEY}`,
                    {
                        signal: controller.signal,
                        cache: 'no-store',
                        headers: { 'Accept': 'application/json' }
                    }
                );
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    if (process.env.NODE_ENV === 'development') {
                        console.warn(`ETH balance API HTTP error: ${response.status}`);
                    }
                    return null;
                }
                
                const data = await response.json();
                if (data.status === '1' && data.result) {
                    const rawBalance = data.result;
                    const balance = parseFloat(rawBalance) / 1e18;
                    if (process.env.NODE_ENV === 'development') {
                        console.log(`✅ ETH balance fetched: ${balance.toFixed(6)} ETH (raw: ${rawBalance})`);
                    }
                    return balance;
                } else {
                    if (process.env.NODE_ENV === 'development') {
                        console.warn('❌ ETH balance API error:', data.message, data.result);
                        console.warn(`   Response status: ${data.status}, Message: ${data.message}`);
                    }
                }
                return null;
            } catch (error) {
                if (process.env.NODE_ENV === 'development') {
                    console.warn('Error fetching ETH balance:', error.message);
                }
                return null;
            }
        };

        // Fetch balances in parallel
        if (process.env.NODE_ENV === 'development') {
            console.log(`\n=== BALANCE FETCHING DEBUG ===`);
            console.log(`Fetching balances for ${topTokens.length} tokens`);
            console.log(`Available prices in tokenPrices:`, Object.keys(tokenPrices).join(', '));
            topTokens.forEach(t => {
                console.log(`  ${t.symbol}: price in token=${t.price || 'N/A'}, price in tokenPrices=${tokenPrices[t.symbol] || 'N/A'}`);
            });
        }
        
        const balancePromises = topTokens.map(async (token) => {
            let balance = null;
            let balanceError = null;
            
            if (token.symbol === 'ETH') {
                balance = await fetchETHBalance();
                if (balance === null) {
                    balanceError = 'ETH balance fetch failed';
                }
            } else {
                // Usar contract address del token, de transacciones, o del mapa conocido
                const contractAddress = token.contractAddress || tokenContractAddresses[token.symbol] || KNOWN_TOKEN_CONTRACTS[token.symbol];
                if (contractAddress) {
                    // Usar decimals de transacciones, del mapa conocido, o 18 por defecto
                    const decimals = tokenDecimals[token.symbol] || KNOWN_TOKEN_DECIMALS[token.symbol] || 18;
                    balance = await fetchTokenBalance(contractAddress, decimals);
                    if (balance === null) {
                        balanceError = 'Token balance fetch failed';
                    }
                } else {
                    balanceError = 'No contract address';
                    if (process.env.NODE_ENV === 'development') {
                        console.warn(`⚠️ No contract address found for token ${token.symbol}`);
                        console.warn(`  Available contract addresses:`, Object.keys(tokenContractAddresses));
                        console.warn(`  Token contractAddress field:`, token.contractAddress);
                        console.warn(`  Token object keys:`, Object.keys(token));
                    }
                }
            }
            
            // Use the price from the token object (already fetched from CoinMarketCap/CoinGecko)
            // If price is not in token object, try to get it from tokenPrices (fallback)
            let price = token.price || 0;
            if (price === 0 && tokenPrices && tokenPrices[token.symbol]) {
                price = tokenPrices[token.symbol];
                if (process.env.NODE_ENV === 'development') {
                    console.log(`  ℹ️ Price not in token object, using tokenPrices for ${token.symbol}: $${price}`);
                }
            }
            
            // Calculate balanceUSD: only if we have both balance > 0 AND price > 0
            const balanceUSD = (balance !== null && balance !== undefined && balance > 0 && price > 0) 
                ? balance * price 
                : 0;
            
            if (process.env.NODE_ENV === 'development') {
                console.log(`Token ${token.symbol}:`);
                console.log(`  Balance: ${balance !== null && balance !== undefined ? balance.toFixed(6) : 'null'}`);
                console.log(`  Price: $${price.toFixed(6)} (from token.price: ${token.price || 'N/A'}, from tokenPrices: ${tokenPrices?.[token.symbol] || 'N/A'})`);
                console.log(`  Balance USD: $${balanceUSD.toFixed(2)}`);
                if (balanceError) {
                    console.warn(`  ⚠️ Error: ${balanceError}`);
                } else if (balance === 0) {
                    console.log(`  ℹ️ Balance is 0 (wallet has no ${token.symbol})`);
                } else if (price === 0) {
                    console.warn(`  ⚠️ Price is 0 (cannot calculate USD value) - token may not be in price fetch list`);
                }
            }
            
            return {
                ...token,
                currentBalance: balance !== null && balance !== undefined ? balance : 0,
                currentBalanceUSD: balanceUSD,
                balanceError: balanceError || null
            };
        });

        // Wait for all balance fetches to complete
        const topTokensWithBalances = await Promise.all(balancePromises);

        if (process.env.NODE_ENV === 'development') {
            console.log(`\n=== FINAL RESPONSE SUMMARY ===`);
            console.log(`Total tokens in response: ${topTokensWithBalances.length}`);
            console.log(`Tokens with balances:`, topTokensWithBalances.filter(t => t.currentBalance > 0).length);
            console.log(`Tokens with balance errors:`, topTokensWithBalances.filter(t => t.balanceError).length);
            topTokensWithBalances.forEach(t => {
                console.log(`  ${t.symbol}: IN=$${t.inVolumeUSD?.toFixed(2) || 0}, OUT=$${t.outVolumeUSD?.toFixed(2) || 0}, BAL=$${t.currentBalanceUSD?.toFixed(2) || 0}`);
            });
            console.log(`============================\n`);
        }

        return NextResponse.json(
            {
                address: WALLET_ADDRESS,
                pendingTxCount,
                topTokens: topTokensWithBalances, // Changed from 'tokens' to 'topTokens' to match frontend
                tokens: topTokensWithBalances, // Keep for backward compatibility
                lastUpdate: new Date().toISOString(),
                debug: process.env.NODE_ENV === 'development' ? {
                    contractAddresses: tokenContractAddresses,
                    tokenDecimals: Object.fromEntries(Object.entries(tokenDecimals).slice(0, 10)), // Limit to first 10
                    tokenNames: Object.fromEntries(Object.entries(tokenNames).slice(0, 10)), // Limit to first 10
                    tokensInCount: Object.keys(tokensIn).length,
                    tokensOutCount: Object.keys(tokensOut).length,
                    balanceErrors: topTokensWithBalances.filter(t => t.balanceError).map(t => ({ symbol: t.symbol, error: t.balanceError }))
                } : undefined
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
