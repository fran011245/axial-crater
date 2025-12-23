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
        let volumeOut24h = 0; // Rough USD est if possible, or just ignore general total
        let activeTokens = {};

        if (tokenData.status === "1" && Array.isArray(tokenData.result)) {
            const now = Date.now() / 1000;
            const oneDayAgo = now - 86400;

            tokenData.result.forEach(tx => {
                // Only consider outgoing txs in last 24h
                if (tx.from.toLowerCase() === WALLET_ADDRESS.toLowerCase() && parseInt(tx.timeStamp) > oneDayAgo) {
                    const symbol = tx.tokenSymbol;
                    const decimal = parseInt(tx.tokenDecimal);
                    const val = parseFloat(tx.value) / Math.pow(10, decimal);

                    if (!activeTokens[symbol]) {
                        activeTokens[symbol] = 0;
                    }
                    activeTokens[symbol] += val;
                }
            });

            // Convert to array and sort
            topTokens = Object.entries(activeTokens)
                .map(([symbol, volume]) => ({ symbol, volume }))
                .sort((a, b) => b.volume - a.volume)
                .slice(0, 10);
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
            status: pendingCount > 0 ? "WARNING" : "OPERATIONAL",
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
