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
        let tokenTxData = { status: '0', result: [] };
        try {
            const tokenTxRes = await fetch(
                `https://api.etherscan.io/v2/api?module=account&action=tokentx&address=${WALLET_ADDRESS}&chainid=1&startblock=0&endblock=99999999&sort=desc&apikey=${ETHERSCAN_API_KEY}`,
                { next: { revalidate: 300 } }
            );
            tokenTxData = await tokenTxRes.json();
            
            // Validate Etherscan response
            if (tokenTxData.status === '0') {
                if (tokenTxData.message === 'NOTOK') {
                    if (tokenTxData.result?.includes('deprecated')) {
                        console.error('Etherscan API V1 deprecated. Using V2 but may need valid API key.');
                    } else if (tokenTxData.result?.includes('Missing/Invalid API Key')) {
                        console.warn('⚠️ Etherscan API key invalid or missing. Add ETHERSCAN_API_KEY to Vercel env vars.');
                        // Return empty result instead of crashing
                        tokenTxData = { status: '0', result: [], message: 'No API key' };
                    } else if (tokenTxData.message !== 'No transactions found') {
                        console.warn('Etherscan token API error:', tokenTxData.message, tokenTxData.result);
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching token transfers:', error.message);
            tokenTxData = { status: '0', result: [] };
        }

        // Fetch normal ETH transactions (using V2 API with chainid=1 for Ethereum mainnet)
        let ethTxData = { status: '0', result: [] };
        try {
            const ethTxRes = await fetch(
                `https://api.etherscan.io/v2/api?module=account&action=txlist&address=${WALLET_ADDRESS}&chainid=1&startblock=0&endblock=99999999&sort=desc&apikey=${ETHERSCAN_API_KEY}`,
                { next: { revalidate: 300 } }
            );
            ethTxData = await ethTxRes.json();
            
            // Validate Etherscan response
            if (ethTxData.status === '0') {
                if (ethTxData.message === 'NOTOK') {
                    if (ethTxData.result?.includes('deprecated')) {
                        console.error('Etherscan API V1 deprecated. Using V2 but may need valid API key.');
                    } else if (ethTxData.result?.includes('Missing/Invalid API Key')) {
                        console.warn('⚠️ Etherscan API key invalid or missing. Add ETHERSCAN_API_KEY to Vercel env vars.');
                        // Return empty result instead of crashing
                        ethTxData = { status: '0', result: [], message: 'No API key' };
                    } else if (ethTxData.message !== 'No transactions found') {
                        console.warn('Etherscan ETH API error:', ethTxData.message, ethTxData.result);
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching ETH transactions:', error.message);
            ethTxData = { status: '0', result: [] };
        }

        // Get pending transactions count (using V2 API with chainid=1 for Ethereum mainnet)
        let pendingData = { status: '0', result: [] };
        try {
            const pendingRes = await fetch(
                `https://api.etherscan.io/v2/api?module=account&action=txlist&address=${WALLET_ADDRESS}&chainid=1&startblock=0&endblock=99999999&sort=desc&apikey=${ETHERSCAN_API_KEY}`,
                { next: { revalidate: 60 } }
            );
            pendingData = await pendingRes.json();
            
            // Validate response before processing
            if (pendingData.status === '0' && pendingData.message === 'NOTOK') {
                if (pendingData.result?.includes('Missing/Invalid API Key')) {
                    console.warn('⚠️ Etherscan API key invalid for pending transactions check.');
                    pendingData = { status: '0', result: [] };
                } else {
                    console.warn('Etherscan pending API error:', pendingData.message, pendingData.result);
                }
            }
        } catch (error) {
            console.error('Error fetching pending transactions:', error.message);
            pendingData = { status: '0', result: [] };
        }
        
        const pendingTxCount = (Array.isArray(pendingData.result) 
            ? pendingData.result.filter(tx => !tx.blockNumber || tx.blockNumber === '0').length 
            : 0);

        // Process token transfers
        const tokensIn = {};
        const tokensOut = {};
        const tokenDecimals = {};
        const tokenNames = {};

        if (tokenTxData.status === '1' && Array.isArray(tokenTxData.result)) {
            tokenTxData.result.forEach(tx => {
                const txTime = parseInt(tx.timeStamp);
                if (txTime < oneDayAgo) return;

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

        // Mapping for common tokens to CoinGecko IDs
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
            'STORJ': 'storj',
            'SUB': 'substratum',
            'TNB': 'time-new-bank',
            'TNT': 'tierion',
            'TRX': 'tron',
            'VEN': 'vechain',
            'VIB': 'viberate',
            'VIBE': 'vibe',
            'WABI': 'wabi',
            'WTC': 'waltonchain',
            'XVG': 'verge',
            'XZC': 'zcoin',
            'YOYO': 'yoyow'
        };

        // Fetch token prices from CoinGecko
        const tokenPrices = {};
        try {
            const contractAddresses = new Map();
            if (tokenTxData.status === '1' && Array.isArray(tokenTxData.result)) {
                tokenTxData.result.forEach(tx => {
                    const symbol = tx.tokenSymbol || 'UNKNOWN';
                    if (allSymbols.has(symbol) && tx.contractAddress) {
                        contractAddresses.set(symbol, tx.contractAddress.toLowerCase());
                    }
                });
            }

            const addressesToFetch = Array.from(contractAddresses.values()).join(',');
            if (addressesToFetch) {
                try {
                    const priceRes = await Promise.race([
                        fetch(`https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${addressesToFetch}&vs_currencies=usd`, {
                            next: { revalidate: 300 }
                        }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('CoinGecko fetch timed out')), 10000))
                    ]);

                    if (!priceRes.ok) {
                        console.warn(`CoinGecko API returned status ${priceRes.status}`);
                    } else {
                        const priceData = await priceRes.json();
                        for (const [symbol, address] of contractAddresses.entries()) {
                            if (priceData[address]?.usd) {
                                tokenPrices[symbol] = priceData[address].usd;
                            }
                        }
                    }
                } catch (error) {
                    if (error.message === 'CoinGecko fetch timed out') {
                        console.warn('CoinGecko API request timed out after 10 seconds');
                    } else {
                        console.warn('Error fetching token prices from CoinGecko:', error.message);
                    }
                }
            }

            if (process.env.NODE_ENV === 'development') {
                console.log(`Fetched prices for ${Object.keys(tokenPrices).length} tokens:`, Object.keys(tokenPrices));
            }
        } catch (error) {
            console.error("Error fetching token prices from CoinGecko:", error);
        }

        // Add ETH price
        try {
            const ethPriceRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd', {
                next: { revalidate: 300 }
            });
            const ethPriceData = await ethPriceRes.json();
            if (ethPriceData.ethereum?.usd) {
                tokenPrices['ETH'] = ethPriceData.ethereum.usd;
            }
        } catch (error) {
            console.error("Error fetching ETH price:", error);
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

            return {
                symbol,
                name: tokenNames[symbol] || symbol,
                inVolume,
                outVolume,
                inVolumeUSD: price > 0 ? inVolume * price : 0,
                outVolumeUSD: price > 0 ? outVolume * price : 0,
                price,
            };
        });

        // Sort by total volume (IN + OUT) descending, but prioritize ETH if it has volume
        const topTokens = tokens.sort((a, b) => {
            // Always put ETH first if it has volume
            const ethTotalVolume = (ethInVolume + ethOutVolume);
            if (a.symbol === 'ETH' && ethTotalVolume > 0) return -1;
            if (b.symbol === 'ETH' && ethTotalVolume > 0) return 1;
            
            const aTotalVolume = (a.outVolume || 0) + (a.inVolume || 0);
            const bTotalVolume = (b.outVolume || 0) + (b.inVolume || 0);
            
            // Sort by total volume descending
            return bTotalVolume - aTotalVolume;
        }).filter((token, index, array) => {
            // Always include ETH if it has volume
            const tokenTotalVolume = (token.outVolume || 0) + (token.inVolume || 0);
            if (token.symbol === 'ETH' && tokenTotalVolume > 0) {
                return true; // Always include ETH
            }
            // For other tokens, include top 10 (but reserve 1 slot for ETH if needed)
            const ethIncluded = array.some(t => t.symbol === 'ETH' && ((t.outVolume || 0) + (t.inVolume || 0) > 0));
            const availableSlots = ethIncluded ? 9 : 10;
            return index < availableSlots;
        });
        
        // Log final tokens for debugging
        if (process.env.NODE_ENV === 'development') {
            console.log(`Final tokens in response (${topTokens.length}):`, topTokens.map(t => `${t.symbol}(IN:${t.inVolume},OUT:${t.outVolume})`).join(', '));
            const ethToken = topTokens.find(t => t.symbol === 'ETH');
            if (ethToken) {
                console.log(`✅ ETH found in response - IN: ${ethToken.inVolume}, OUT: ${ethToken.outVolume}, IN_USD: ${ethToken.inVolumeUSD}, OUT_USD: ${ethToken.outVolumeUSD}`);
            } else {
                console.log('❌ ETH NOT found in final response');
                if (ethInVolume > 0 || ethOutVolume > 0) {
                    console.log('⚠️ ETH has volume but was excluded - this is a bug!');
                } else {
                    console.log('ℹ️ ETH has no volume in last 24h, so it was correctly excluded');
                }
            }
        }

        return NextResponse.json(
            {
                address: WALLET_ADDRESS,
                pendingTxCount,
                tokens: topTokens,
                lastUpdate: new Date().toISOString(),
            },
            {
                headers: getRateLimitHeaders(rateLimitResult)
            }
        );

    } catch (error) {
        console.error("Etherscan API Error:", error);
        return NextResponse.json(
            { 
                error: "Failed to fetch wallet data",
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            },
            { status: 500 }
        );
    }
}
