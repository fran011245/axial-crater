import { NextResponse } from 'next/server';

export async function GET() {
    try {
        // Fetch ALL tickers to get all funding currencies
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        const res = await fetch('https://api-pub.bitfinex.com/v2/tickers?symbols=ALL', {
            headers: { 'Content-Type': 'application/json' },
            next: { revalidate: 60 }, // Cache for 60 seconds
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
            throw new Error(`Bitfinex API returned status ${res.status}`);
        }

        const data = await res.json();
        
        // Filter only funding currencies (start with 'f') and process
        const fundingTickers = data
            .filter(ticker => {
                const symbol = ticker[0];
                return symbol.startsWith('f') && symbol.length > 1; // fUSD, fBTC, etc.
            })
            .map(ticker => {
                const symbol = ticker[0];
                const frr = ticker[1]; // Flash Return Rate
                const lastPrice = ticker[10]; // Last funding rate
                const volume24h = ticker[11]; // 24H volume
                
                // APR 1H = FRR × 365 × 365 × 100
                const frrValue = frr || lastPrice || 0;
                const apr1h = frrValue * 365 * 365 * 100;
                
                // Convert symbol: remove 'f' and map UST -> USDt
                let displaySymbol = symbol.substring(1);
                if (displaySymbol === 'UST') {
                    displaySymbol = 'USDt';
                }
                
                return {
                    symbol: displaySymbol,
                    apr1h: apr1h,
                    volume24h: volume24h || 0,
                    frr: frrValue
                };
            })
            .sort((a, b) => b.volume24h - a.volume24h) // Sort by volume descending
            .slice(0, 5); // Top 5

        return NextResponse.json({
            fundingStats: fundingTickers,
            lastUpdate: new Date().toISOString()
        });
    } catch (error) {
        if (error.name === 'AbortError') {
            console.warn('Funding API request timed out after 10 seconds');
        } else {
            console.error('Funding API Error:', error.message || error);
        }
        return NextResponse.json({ 
            fundingStats: [],
            error: 'Failed to fetch funding data',
            lastUpdate: new Date().toISOString()
        }, { status: 500 });
    }
}

