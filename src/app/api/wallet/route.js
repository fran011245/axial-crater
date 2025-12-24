import { NextResponse } from 'next/server';

const WALLET_ADDRESS = "0x77134cbC06cB00b66F4c7e623D5fdBF6777635EC";
const API_KEY = process.env.ETHERSCAN_API_KEY || "YourApiKeyToken"; // Fallback to demo key
const BASE_URL = "https://api.etherscan.io/v2/api";
const CHAIN_ID = "1"; // Ethereum Mainnet

export async function GET() {
    try {
        // 1. Fetch Token Transfers (Last 1000)
        // V2: module=account&action=tokentx&chainid=1&address={address}&page=1&offset=1000&sort=desc&apikey={apikey}
        const tokenRes = await fetch(`${BASE_URL}?chainid=${CHAIN_ID}&module=account&action=tokentx&address=${WALLET_ADDRESS}&page=1&offset=1000&sort=desc&apikey=${API_KEY}`, {
            next: { revalidate: 30 } // Cache for 30s
        });
        const tokenData = await tokenRes.json();

        // 1b. Fetch Regular ETH Transactions (Last 1000)
        // V2: module=account&action=txlist&chainid=1&address={address}&page=1&offset=1000&sort=desc&apikey={apikey}
        const ethTxRes = await fetch(`${BASE_URL}?chainid=${CHAIN_ID}&module=account&action=txlist&address=${WALLET_ADDRESS}&page=1&offset=1000&sort=desc&apikey=${API_KEY}`, {
            next: { revalidate: 30 } // Cache for 30s
        });
        const ethTxData = await ethTxRes.json();

        // 2. Fetch Pending Count
        // V2: module=proxy&action=eth_getTransactionCount&chainid=1&address={address}&tag=pending&apikey={apikey}
        const pendingRes = await fetch(`${BASE_URL}?chainid=${CHAIN_ID}&module=proxy&action=eth_getTransactionCount&address=${WALLET_ADDRESS}&tag=pending&apikey=${API_KEY}`, {
            cache: 'no-store' // Do not cache real-time status
        });
        const pendingData = await pendingRes.json();

        // 3. Fetch Latest Count
        // V2: module=proxy&action=eth_getTransactionCount&chainid=1&address={address}&tag=latest&apikey={apikey}
        const latestRes = await fetch(`${BASE_URL}?chainid=${CHAIN_ID}&module=proxy&action=eth_getTransactionCount&address=${WALLET_ADDRESS}&tag=latest&apikey=${API_KEY}`, {
            cache: 'no-store'
        });
        const latestData = await latestRes.json();

        // Process Data
        let topTokens = [];
        let tokensIn = {}; // Track incoming volumes
        let tokensOut = {}; // Track outgoing volumes

        const now = Date.now() / 1000;
        const oneDayAgo = now - 86400;

        // Process ERC-20 Token Transfers
        if (tokenData.status === "1" && Array.isArray(tokenData.result)) {
            tokenData.result.forEach(tx => {
                const timestamp = parseInt(tx.timeStamp);
                if (timestamp <= oneDayAgo) return;

                const symbol = tx.tokenSymbol;
                const decimal = parseInt(tx.tokenDecimal);
                const val = parseFloat(tx.value) / Math.pow(10, decimal);
                const isFromWallet = tx.from.toLowerCase() === WALLET_ADDRESS.toLowerCase();
                const isToWallet = tx.to.toLowerCase() === WALLET_ADDRESS.toLowerCase();

                if (isFromWallet) {
                    // Outgoing transaction
                    if (!tokensOut[symbol]) {
                        tokensOut[symbol] = 0;
                    }
                    tokensOut[symbol] += val;
                }

                if (isToWallet) {
                    // Incoming transaction
                    if (!tokensIn[symbol]) {
                        tokensIn[symbol] = 0;
                    }
                    tokensIn[symbol] += val;
                }
            });
        }

        // Process ETH Transactions (regular transactions, not token transfers)
        if (ethTxData.status === "1" && Array.isArray(ethTxData.result)) {
            let ethTxCount = 0;
            let ethTxWithValue = 0;
            
            ethTxData.result.forEach(tx => {
                const timestamp = parseInt(tx.timeStamp);
                if (timestamp <= oneDayAgo) return;
                
                ethTxCount++;

                // Convert Wei to ETH (1 ETH = 10^18 Wei)
                const ethValue = parseFloat(tx.value) / Math.pow(10, 18);
                const isFromWallet = tx.from.toLowerCase() === WALLET_ADDRESS.toLowerCase();
                const isToWallet = tx.to.toLowerCase() === WALLET_ADDRESS.toLowerCase();

                // Only track transactions with actual ETH value transfers (exclude contract calls with 0 ETH)
                if (ethValue > 0) {
                    ethTxWithValue++;
                    
                    if (isFromWallet) {
                        // Outgoing ETH
                        if (!tokensOut['ETH']) {
                            tokensOut['ETH'] = 0;
                        }
                        tokensOut['ETH'] += ethValue;
                    }

                    if (isToWallet) {
                        // Incoming ETH
                        if (!tokensIn['ETH']) {
                            tokensIn['ETH'] = 0;
                        }
                        tokensIn['ETH'] += ethValue;
                    }
                }
            });
            
            // Log ETH processing for debugging
            console.log(`ETH Transactions processed: ${ethTxCount} total, ${ethTxWithValue} with value > 0`);
            console.log(`ETH Volumes - IN: ${tokensIn['ETH'] || 0}, OUT: ${tokensOut['ETH'] || 0}`);
        } else {
            console.log(`ETH Transaction fetch failed or empty. Status: ${ethTxData.status}`);
        }

        // Get unique token symbols and their contract addresses
        const tokenMap = {}; // symbol -> contractAddress
        if (tokenData.status === "1" && Array.isArray(tokenData.result)) {
            tokenData.result.forEach(tx => {
                const timestamp = parseInt(tx.timeStamp);
                if (timestamp <= oneDayAgo) return;
                
                const symbol = tx.tokenSymbol;
                const contractAddress = tx.contractAddress;
                if (symbol && contractAddress && !tokenMap[symbol]) {
                    tokenMap[symbol] = contractAddress.toLowerCase();
                }
            });
        }

        const allSymbols = new Set([...Object.keys(tokensIn), ...Object.keys(tokensOut)]);
        
        // Map common token symbols to CoinGecko IDs for direct price lookup
        const symbolToCoinGeckoId = {
            'ETH': 'ethereum',
            'USDT': 'tether',
            'USDC': 'usd-coin',
            'PEPE': 'pepe',
            'SHIB': 'shiba-inu',
            'FLOKI': 'floki',
            'CHZ': 'chiliz',
            'PNK': 'kleros',
            'WBTC': 'wrapped-bitcoin',
            'DAI': 'dai',
            'UNI': 'uniswap',
            'LINK': 'chainlink',
            'MATIC': 'matic-network',
            'AAVE': 'aave',
            'CRV': 'curve-dao-token'
        };
        
        // Attempt to fetch token prices from CoinGecko
        let tokenPrices = {};
        try {
            // Strategy 1: Fetch prices by CoinGecko ID for known tokens
            const knownTokenIds = Array.from(allSymbols)
                .filter(symbol => symbolToCoinGeckoId[symbol])
                .map(symbol => symbolToCoinGeckoId[symbol]);
            
            if (knownTokenIds.length > 0) {
                const idsToFetch = knownTokenIds.join(',');
                const knownPriceRes = await fetch(
                    `https://api.coingecko.com/api/v3/simple/price?ids=${idsToFetch}&vs_currencies=usd`,
                    {
                        next: { revalidate: 300 } // Cache for 5 minutes
                    }
                );
                
                if (knownPriceRes.ok) {
                    const knownPriceData = await knownPriceRes.json();
                    // Map CoinGecko IDs back to symbols
                    Object.keys(knownPriceData).forEach(coinGeckoId => {
                        const symbol = Object.keys(symbolToCoinGeckoId).find(s => 
                            symbolToCoinGeckoId[s] === coinGeckoId
                        );
                        if (symbol && knownPriceData[coinGeckoId]?.usd) {
                            tokenPrices[symbol] = knownPriceData[coinGeckoId].usd;
                        }
                    });
                }
            }

            // Strategy 2: Fetch ERC-20 token prices using contract addresses (for unknown tokens)
            const contractAddresses = Array.from(allSymbols)
                .filter(symbol => !tokenPrices[symbol] && symbol !== 'ETH') // Skip already fetched and ETH
                .map(symbol => tokenMap[symbol])
                .filter(addr => addr && addr !== '0x0000000000000000000000000000000000000000');
            
            if (contractAddresses.length > 0) {
                // CoinGecko API allows up to 100 contract addresses per request
                const addressesToFetch = contractAddresses.slice(0, 100).join(',');
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
                    
                    const priceRes = await fetch(
                        `https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${addressesToFetch}&vs_currencies=usd`,
                        {
                            next: { revalidate: 300 }, // Cache for 5 minutes
                            signal: controller.signal
                        }
                    );
                    
                    clearTimeout(timeoutId);
                    
                    if (priceRes.ok) {
                        const priceData = await priceRes.json();
                        // Map contract addresses back to symbols
                        Object.keys(priceData).forEach(contractAddr => {
                            const symbol = Object.keys(tokenMap).find(s => 
                                tokenMap[s]?.toLowerCase() === contractAddr.toLowerCase()
                            );
                            if (symbol && priceData[contractAddr]?.usd && !tokenPrices[symbol]) {
                                tokenPrices[symbol] = priceData[contractAddr].usd;
                            }
                        });
                    } else {
                        console.warn(`CoinGecko API returned status ${priceRes.status}`);
                    }
                } catch (error) {
                    if (error.name === 'AbortError') {
                        console.warn('CoinGecko API request timed out after 10 seconds');
                    } else {
                        console.warn('Error fetching token prices from CoinGecko:', error.message);
                    }
                    // Continue without prices - tokens will show raw amounts instead of USD
                }
            }
            
            // Log prices fetched for debugging
            console.log(`Fetched prices for ${Object.keys(tokenPrices).length} tokens:`, Object.keys(tokenPrices));
        } catch (error) {
            console.error("Error fetching token prices from CoinGecko:", error);
            // Continue without prices - will fall back to raw amounts
        }

        // Combine and format token data
        // Ensure ETH is always included if it has any volume (even if only IN or only OUT)
        const allSymbolsArray = Array.from(allSymbols);
        const ethInVolume = tokensIn['ETH'] || 0;
        const ethOutVolume = tokensOut['ETH'] || 0;
        
        // Add ETH if it has volume but wasn't included (shouldn't happen, but safety check)
        if ((ethInVolume > 0 || ethOutVolume > 0) && !allSymbolsArray.includes('ETH')) {
            allSymbolsArray.push('ETH');
            console.log('Added ETH to symbols list - IN:', ethInVolume, 'OUT:', ethOutVolume);
        }
        
        // Log all symbols before processing
        console.log('All symbols before processing:', Array.from(allSymbols));
        console.log('ETH volumes - IN:', ethInVolume, 'OUT:', ethOutVolume);
        
        topTokens = allSymbolsArray.map(symbol => {
            const outVolume = tokensOut[symbol] || 0;
            const inVolume = tokensIn[symbol] || 0;
            const price = tokenPrices[symbol] || null;
            
            return {
                symbol,
                volume: outVolume, // Keep for backward compatibility
                outVolume,
                inVolume,
                outVolumeUSD: price ? outVolume * price : null,
                inVolumeUSD: price ? inVolume * price : null
            };
        }).sort((a, b) => {
            // PRIORITY: ETH always first if it has volume
            const aIsETH = a.symbol === 'ETH';
            const bIsETH = b.symbol === 'ETH';
            const aTotalVolume = (a.outVolume || 0) + (a.inVolume || 0);
            const bTotalVolume = (b.outVolume || 0) + (b.inVolume || 0);
            
            if (aIsETH && aTotalVolume > 0) return -1; // ETH first
            if (bIsETH && bTotalVolume > 0) return 1;  // ETH first
            
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

        // Process Pending Status
        let pendingCount = 0;
        if (pendingData.result && latestData.result) {
            const pCount = parseInt(pendingData.result, 16); // Hex to Dec
            const lCount = parseInt(latestData.result, 16);
            pendingCount = Math.max(0, pCount - lCount);
        }

        return NextResponse.json({
            topTokens,
            pendingCount,
            status: pendingCount >= 5 ? "WARNING" : "OPERATIONAL",
            lastUpdate: new Date().toISOString()
        });

    } catch (error) {
        console.error("Etherscan API Error:", error);
        return NextResponse.json({
            topTokens: [],
            pendingCount: 0,
            status: "ERROR",
            error: error.message
        }, { status: 500 });
    }
}
