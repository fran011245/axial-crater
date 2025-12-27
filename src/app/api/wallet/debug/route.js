import { NextResponse } from 'next/server';

const WALLET_ADDRESS = '0x77134cbC06cB00b66F4c7e623D5fdBF6777635EC';
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || 'YourApiKeyToken';

export async function GET(request) {
    const debugInfo = {
        timestamp: new Date().toISOString(),
        walletAddress: WALLET_ADDRESS,
        apiKeyStatus: ETHERSCAN_API_KEY === 'YourApiKeyToken' ? 'missing_or_default' : 'configured',
        tests: {}
    };

    // Test 1: Token Transfers API
    try {
        const tokenRes = await fetch(
            `https://api.etherscan.io/v2/api?module=account&action=tokentx&address=${WALLET_ADDRESS}&chainid=1&startblock=0&endblock=99999999&sort=desc&apikey=${ETHERSCAN_API_KEY}`,
            { cache: 'no-store' }
        );
        
        const tokenData = await tokenRes.json();
        debugInfo.tests.tokenTransfers = {
            status: tokenRes.status,
            etherscanStatus: tokenData.status,
            message: tokenData.message,
            resultType: Array.isArray(tokenData.result) ? 'array' : typeof tokenData.result,
            resultCount: Array.isArray(tokenData.result) ? tokenData.result.length : 0,
            sampleTransaction: Array.isArray(tokenData.result) && tokenData.result.length > 0 ? {
                tokenSymbol: tokenData.result[0].tokenSymbol,
                tokenName: tokenData.result[0].tokenName,
                contractAddress: tokenData.result[0].contractAddress || tokenData.result[0].tokenAddress || tokenData.result[0].address,
                value: tokenData.result[0].value,
                tokenDecimal: tokenData.result[0].tokenDecimal,
                from: tokenData.result[0].from,
                to: tokenData.result[0].to,
                timeStamp: tokenData.result[0].timeStamp
            } : null,
            error: tokenData.status === '0' ? tokenData.result : null
        };
    } catch (error) {
        debugInfo.tests.tokenTransfers = {
            error: error.message,
            stack: error.stack
        };
    }

    // Test 2: ETH Transactions API
    try {
        const ethRes = await fetch(
            `https://api.etherscan.io/v2/api?module=account&action=txlist&address=${WALLET_ADDRESS}&chainid=1&startblock=0&endblock=99999999&sort=desc&apikey=${ETHERSCAN_API_KEY}`,
            { cache: 'no-store' }
        );
        
        const ethData = await ethRes.json();
        debugInfo.tests.ethTransactions = {
            status: ethRes.status,
            etherscanStatus: ethData.status,
            message: ethData.message,
            resultType: Array.isArray(ethData.result) ? 'array' : typeof ethData.result,
            resultCount: Array.isArray(ethData.result) ? ethData.result.length : 0,
            sampleTransaction: Array.isArray(ethData.result) && ethData.result.length > 0 ? {
                value: ethData.result[0].value,
                from: ethData.result[0].from,
                to: ethData.result[0].to,
                timeStamp: ethData.result[0].timeStamp
            } : null,
            error: ethData.status === '0' ? ethData.result : null
        };
    } catch (error) {
        debugInfo.tests.ethTransactions = {
            error: error.message,
            stack: error.stack
        };
    }

    // Test 3: ETH Balance
    try {
        const balanceRes = await fetch(
            `https://api.etherscan.io/v2/api?module=account&action=balance&address=${WALLET_ADDRESS}&chainid=1&tag=latest&apikey=${ETHERSCAN_API_KEY}`,
            { cache: 'no-store' }
        );
        
        const balanceData = await balanceRes.json();
        debugInfo.tests.ethBalance = {
            status: balanceRes.status,
            etherscanStatus: balanceData.status,
            message: balanceData.message,
            rawBalance: balanceData.result,
            balanceETH: balanceData.status === '1' && balanceData.result ? (parseFloat(balanceData.result) / 1e18).toFixed(6) : null,
            error: balanceData.status === '0' ? balanceData.result : null
        };
    } catch (error) {
        debugInfo.tests.ethBalance = {
            error: error.message,
            stack: error.stack
        };
    }

    // Test 4: Token Balance (if we have a contract address from token transfers)
    if (debugInfo.tests.tokenTransfers?.sampleTransaction?.contractAddress) {
        try {
            const contractAddress = debugInfo.tests.tokenTransfers.sampleTransaction.contractAddress;
            const tokenBalanceRes = await fetch(
                `https://api.etherscan.io/v2/api?module=account&action=tokenbalance&contractaddress=${contractAddress}&address=${WALLET_ADDRESS}&chainid=1&tag=latest&apikey=${ETHERSCAN_API_KEY}`,
                { cache: 'no-store' }
            );
            
            const tokenBalanceData = await tokenBalanceRes.json();
            debugInfo.tests.tokenBalance = {
                contractAddress: contractAddress,
                tokenSymbol: debugInfo.tests.tokenTransfers.sampleTransaction.tokenSymbol,
                status: tokenBalanceRes.status,
                etherscanStatus: tokenBalanceData.status,
                message: tokenBalanceData.message,
                rawBalance: tokenBalanceData.result,
                decimals: debugInfo.tests.tokenTransfers.sampleTransaction.tokenDecimal,
                balanceFormatted: tokenBalanceData.status === '1' && tokenBalanceData.result ? 
                    (parseFloat(tokenBalanceData.result) / Math.pow(10, parseInt(debugInfo.tests.tokenTransfers.sampleTransaction.tokenDecimal || 18))).toFixed(6) : null,
                error: tokenBalanceData.status === '0' ? tokenBalanceData.result : null
            };
        } catch (error) {
            debugInfo.tests.tokenBalance = {
                error: error.message,
                stack: error.stack
            };
        }
    }

    // Summary
    debugInfo.summary = {
        tokenTransfersWorking: debugInfo.tests.tokenTransfers?.etherscanStatus === '1',
        ethTransactionsWorking: debugInfo.tests.ethTransactions?.etherscanStatus === '1',
        ethBalanceWorking: debugInfo.tests.ethBalance?.etherscanStatus === '1',
        tokenBalanceWorking: debugInfo.tests.tokenBalance?.etherscanStatus === '1',
        hasApiKey: ETHERSCAN_API_KEY !== 'YourApiKeyToken',
        recommendations: []
    };

    if (!debugInfo.summary.hasApiKey) {
        debugInfo.summary.recommendations.push('Add ETHERSCAN_API_KEY to environment variables');
    }
    if (!debugInfo.summary.tokenTransfersWorking) {
        debugInfo.summary.recommendations.push('Token transfers API is not working - check API key and response');
    }
    if (!debugInfo.summary.ethBalanceWorking) {
        debugInfo.summary.recommendations.push('ETH balance API is not working - check API key and response');
    }

    return NextResponse.json(debugInfo, {
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store'
        }
    });
}

