/**
 * Test script to diagnose Etherscan API issues
 */

const WALLET_ADDRESS = '0x77134cbC06cB00b66F4c7e623D5fdBF6777635EC';
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || 'YourApiKeyToken';

async function testEtherscanAPI() {
    console.log('🔍 Testing Etherscan API...\n');
    console.log(`Wallet: ${WALLET_ADDRESS}`);
    console.log(`API Key: ${ETHERSCAN_API_KEY === 'YourApiKeyToken' ? '⚠️  Using default (invalid)' : '✅ Custom key'}\n`);

    // Test V1 API (deprecated)
    console.log('📡 Testing V1 API (should be deprecated)...');
    try {
        const v1Res = await fetch(
            `https://api.etherscan.io/api?module=account&action=txlist&address=${WALLET_ADDRESS}&startblock=0&endblock=99999999&sort=desc&apikey=${ETHERSCAN_API_KEY}`
        );
        const v1Data = await v1Res.json();
        console.log('V1 Response:', JSON.stringify(v1Data, null, 2));
    } catch (error) {
        console.error('V1 Error:', error.message);
    }

    console.log('\n');

    // Test V2 API
    console.log('📡 Testing V2 API...');
    try {
        const v2Res = await fetch(
            `https://api.etherscan.io/v2/api?module=account&action=txlist&address=${WALLET_ADDRESS}&chainid=1&startblock=0&endblock=99999999&sort=desc&apikey=${ETHERSCAN_API_KEY}`
        );
        const v2Data = await v2Res.json();
        console.log('V2 Response:', JSON.stringify(v2Data, null, 2));
        
        if (v2Data.status === '1' && Array.isArray(v2Data.result)) {
            console.log(`✅ V2 API works! Found ${v2Data.result.length} transactions`);
            if (v2Data.result.length > 0) {
                console.log('Sample transaction:', JSON.stringify(v2Data.result[0], null, 2));
            }
        } else {
            console.log('❌ V2 API error:', v2Data.message, v2Data.result);
        }
    } catch (error) {
        console.error('V2 Error:', error.message);
    }

    console.log('\n');

    // Test V2 Token Transfers
    console.log('📡 Testing V2 Token Transfers API...');
    try {
        const tokenRes = await fetch(
            `https://api.etherscan.io/v2/api?module=account&action=tokentx&address=${WALLET_ADDRESS}&chainid=1&startblock=0&endblock=99999999&sort=desc&apikey=${ETHERSCAN_API_KEY}`
        );
        const tokenData = await tokenRes.json();
        console.log('Token Response Status:', tokenData.status);
        console.log('Token Response Message:', tokenData.message);
        
        if (tokenData.status === '1' && Array.isArray(tokenData.result)) {
            console.log(`✅ Token API works! Found ${tokenData.result.length} token transfers`);
        } else {
            console.log('❌ Token API error:', tokenData.message, tokenData.result);
        }
    } catch (error) {
        console.error('Token Error:', error.message);
    }
}

testEtherscanAPI().catch(console.error);

