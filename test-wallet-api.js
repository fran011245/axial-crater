/**
 * Test script to diagnose wallet API token transfer issues
 */

const WALLET_ADDRESS = '0x77134cbC06cB00b66F4c7e623D5fdBF6777635EC';
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || 'YourApiKeyToken';

async function testWalletAPI() {
    console.log('🔍 Testing Wallet API Token Transfers...\n');
    console.log(`Wallet: ${WALLET_ADDRESS}`);
    console.log(`API Key: ${ETHERSCAN_API_KEY === 'YourApiKeyToken' ? '⚠️  Using default (invalid)' : '✅ Custom key'}\n`);

    // Test Token Transfers API
    console.log('📡 Testing Token Transfers API (ERC-20)...');
    try {
        const tokenRes = await fetch(
            `https://api.etherscan.io/v2/api?module=account&action=tokentx&address=${WALLET_ADDRESS}&chainid=1&startblock=0&endblock=99999999&sort=desc&apikey=${ETHERSCAN_API_KEY}`
        );
        
        console.log('Response status:', tokenRes.status, tokenRes.statusText);
        console.log('Content-Type:', tokenRes.headers.get('content-type'));
        
        const tokenData = await tokenRes.json();
        console.log('\nResponse:', JSON.stringify(tokenData, null, 2));
        
        if (tokenData.status === '1' && Array.isArray(tokenData.result)) {
            console.log(`\n✅ Token transfers found: ${tokenData.result.length} transactions`);
            if (tokenData.result.length > 0) {
                console.log('\nFirst transaction sample:');
                console.log(JSON.stringify(tokenData.result[0], null, 2));
                
                // Check last 24 hours
                const now = Math.floor(Date.now() / 1000);
                const oneDayAgo = now - 86400;
                const recentTxs = tokenData.result.filter(tx => parseInt(tx.timeStamp) >= oneDayAgo);
                console.log(`\n📊 Transactions in last 24h: ${recentTxs.length}`);
                
                if (recentTxs.length > 0) {
                    console.log('\nRecent transaction sample:');
                    console.log(JSON.stringify(recentTxs[0], null, 2));
                    
                    // Group by token symbol
                    const tokens = {};
                    recentTxs.forEach(tx => {
                        const symbol = tx.tokenSymbol || 'UNKNOWN';
                        if (!tokens[symbol]) {
                            tokens[symbol] = { count: 0, in: 0, out: 0 };
                        }
                        tokens[symbol].count++;
                        if (tx.to.toLowerCase() === WALLET_ADDRESS.toLowerCase()) {
                            tokens[symbol].in++;
                        } else if (tx.from.toLowerCase() === WALLET_ADDRESS.toLowerCase()) {
                            tokens[symbol].out++;
                        }
                    });
                    
                    console.log('\n📈 Tokens found in last 24h:');
                    Object.entries(tokens).forEach(([symbol, data]) => {
                        console.log(`  ${symbol}: ${data.count} txs (IN: ${data.in}, OUT: ${data.out})`);
                    });
                }
            }
        } else {
            console.log('\n❌ Token transfers API error:', tokenData.message, tokenData.result);
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
    }

    console.log('\n\n📡 Testing ETH Transactions API...');
    try {
        const ethRes = await fetch(
            `https://api.etherscan.io/v2/api?module=account&action=txlist&address=${WALLET_ADDRESS}&chainid=1&startblock=0&endblock=99999999&sort=desc&apikey=${ETHERSCAN_API_KEY}`
        );
        
        const ethData = await ethRes.json();
        if (ethData.status === '1' && Array.isArray(ethData.result)) {
            console.log(`✅ ETH transactions found: ${ethData.result.length} transactions`);
            
            const now = Math.floor(Date.now() / 1000);
            const oneDayAgo = now - 86400;
            const recentTxs = ethData.result.filter(tx => parseInt(tx.timeStamp) >= oneDayAgo);
            console.log(`📊 ETH transactions in last 24h: ${recentTxs.length}`);
        } else {
            console.log('❌ ETH transactions API error:', ethData.message, ethData.result);
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testWalletAPI().catch(console.error);

