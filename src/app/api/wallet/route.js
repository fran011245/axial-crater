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
            ethTxData.result.forEach(tx => {
                const timestamp = parseInt(tx.timeStamp);
                if (timestamp <= oneDayAgo) return;

                // Convert Wei to ETH (1 ETH = 10^18 Wei)
                const ethValue = parseFloat(tx.value) / Math.pow(10, 18);
                const isFromWallet = tx.from.toLowerCase() === WALLET_ADDRESS.toLowerCase();
                const isToWallet = tx.to.toLowerCase() === WALLET_ADDRESS.toLowerCase();

                // Only track transactions with actual ETH value transfers (exclude contract calls with 0 ETH)
                if (ethValue > 0) {
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
        
        // Attempt to fetch token prices from CoinGecko
        let tokenPrices = {};
        try {
            // Fetch ETH price separately (native token)
            const ethPriceRes = await fetch(
                'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
                {
                    next: { revalidate: 300 } // Cache for 5 minutes
                }
            );
            
            if (ethPriceRes.ok) {
                const ethPriceData = await ethPriceRes.json();
                if (ethPriceData.ethereum?.usd) {
                    tokenPrices['ETH'] = ethPriceData.ethereum.usd;
                }
            }

            // Fetch ERC-20 token prices using contract addresses
            const contractAddresses = Array.from(allSymbols)
                .filter(symbol => symbol !== 'ETH') // Exclude ETH, already fetched
                .map(symbol => tokenMap[symbol])
                .filter(addr => addr && addr !== '0x0000000000000000000000000000000000000000'); // Filter out invalid addresses
            
            if (contractAddresses.length > 0) {
                // CoinGecko API allows up to 100 contract addresses per request
                const addressesToFetch = contractAddresses.slice(0, 100).join(',');
                const priceRes = await fetch(
                    `https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${addressesToFetch}&vs_currencies=usd`,
                    {
                        next: { revalidate: 300 } // Cache for 5 minutes
                    }
                );
                
                if (priceRes.ok) {
                    const priceData = await priceRes.json();
                    // Map contract addresses back to symbols
                    Object.keys(priceData).forEach(contractAddr => {
                        const symbol = Object.keys(tokenMap).find(s => 
                            tokenMap[s]?.toLowerCase() === contractAddr.toLowerCase()
                        );
                        if (symbol && priceData[contractAddr]?.usd) {
                            tokenPrices[symbol] = priceData[contractAddr].usd;
                        }
                    });
                }
            }
        } catch (error) {
            console.error("Error fetching token prices from CoinGecko:", error);
            // Continue without prices - will fall back to raw amounts
        }

        // Combine and format token data
        topTokens = Array.from(allSymbols).map(symbol => {
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
            // Sort by total volume (out + in) descending
            const totalA = (a.outVolume || 0) + (a.inVolume || 0);
            const totalB = (b.outVolume || 0) + (b.inVolume || 0);
            return totalB - totalA;
        }).slice(0, 10);

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
