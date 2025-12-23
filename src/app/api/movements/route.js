import { NextResponse } from 'next/server';
import { getNetworkName } from '../../../utils/networkMapper';

export async function GET() {
    try {
        const [statusRes, methodRes] = await Promise.all([
            fetch('https://api-pub.bitfinex.com/v2/conf/pub:info:tx:status', { cache: 'no-store' }),
            fetch('https://api-pub.bitfinex.com/v2/conf/pub:map:tx:method', { cache: 'no-store' })
        ]);

        const statusData = await statusRes.json();
        const methodData = await methodRes.json();

        // methodData: [ ["BITCOIN", ["BTC"]], ... ]
        // Map FULL_NAME -> SYMBOL
        const methodMap = new Map();
        methodData[0].forEach(item => {
            methodMap.set(item[0], item[1][0]);
        });

        // statusData: [ ["BITCOIN", 1, 1, null, null, null, null, 0, 0, null, null, confirmation_count], ... ]
        // Index 1: Deposit (1=Active, 0=Closed)
        // Index 2: Withdrawal (1=Active, 0=Closed)
        // Index 11: Confirmation count (NOT network ID)

        const movements = statusData[0].map(item => {
            const fullName = item[0];
            const depositStatus = item[1];
            const withdrawalStatus = item[2];
            const confirmationCount = item[11]; // Confirmation count at index 11
            const symbol = methodMap.get(fullName) || fullName;
            // Infer network from token name since index 11 is confirmation count, not network ID
            const network = getNetworkName(null, fullName);

            return {
                name: fullName,
                symbol: symbol,
                network: network,
                confirmationCount: confirmationCount,
                depositValues: item, // debugging
                deposit: depositStatus === 1 ? 'Active' : 'Closed',
                withdrawal: withdrawalStatus === 1 ? 'Active' : 'Closed',
                isSuspended: depositStatus === 0 || withdrawalStatus === 0
            };
        });

        return NextResponse.json(movements);
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Failed to fetch movements' }, { status: 500 });
    }
}
