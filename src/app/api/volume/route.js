import { NextResponse } from 'next/server';

export async function GET() {
    try {
        // Fetch all tickers
        const res = await fetch('https://api-pub.bitfinex.com/v2/tickers?symbols=ALL', {
            headers: { 'Content-Type': 'application/json' },
            next: { revalidate: 60 } // Cache for 60 seconds
        });

        const data = await res.json();

        // Ticker format: [SYMBOL, BID, BID_SIZE, ASK, ASK_SIZE, DAILY_CHANGE, DAILY_CHANGE_PERC, LAST_PRICE, VOLUME, HIGH, LOW]
        // We only care about trading pairs 't...' matching USD/UST/EUT etc.
        // For simplicity, we'll sum up volumes converted to USD for major pairs

        let totalVolumeUSD = 0;
        const tickersWithVolume = [];

        data.forEach(ticker => {
            const symbol = ticker[0];
            if (!symbol.startsWith('t')) return;

            const lastPrice = ticker[7];
            const volume = ticker[8];

            // We only sum pairs where quote is USD or UST to avoid complex conversion logic/double counting
            // This is an approximation for the dashboard
            if ((symbol.endsWith('USD') || symbol.endsWith('UST')) && !symbol.includes('TEST')) {
                const usdVolume = volume * lastPrice;
                totalVolumeUSD += usdVolume;

                tickersWithVolume.push({
                    symbol: symbol.substring(1), // Remove 't' prefix
                    lastPrice,
                    change: ticker[6], // DAILY_CHANGE_PERC
                    volumeUSD: usdVolume,
                    volume: volume // Raw volume in base currency
                });
            }
        });

        // Sort by volume descending
        tickersWithVolume.sort((a, b) => b.volumeUSD - a.volumeUSD);

        const topPairs = tickersWithVolume.slice(0, 12);
        const lowPairs = tickersWithVolume.slice(-100).reverse(); // Bottom 100, reversed to show lowest first

        // Fetch 30-day candles for top pairs to calculate 7D and 30D volume
        // Limit to 30 candles (1D timeframe)
        await Promise.all(topPairs.map(async (pair) => {
            try {
                // Candle response: [MTS, OPEN, CLOSE, HIGH, LOW, VOLUME]
                const candleRes = await fetch(`https://api-pub.bitfinex.com/v2/candles/trade:1D:t${pair.symbol}/hist?limit=30`, {
                    next: { revalidate: 3600 } // Cache historical for 1 hour
                });
                const candles = await candleRes.json();

                if (Array.isArray(candles)) {
                    // Sum volumes. Index 5 is VOLUME.
                    // Note: Candles are reversed (newest first)
                    // 7D sum
                    const vol7d = candles.slice(0, 7).reduce((acc, c) => acc + (c[5] * c[2]), 0); // Vol * Close Price (Approx USD)

                    // 30D sum
                    const vol30d = candles.slice(0, 30).reduce((acc, c) => acc + (c[5] * c[2]), 0);

                    pair.vol7d = vol7d;
                    pair.vol30d = vol30d;
                } else {
                    pair.vol7d = 0;
                    pair.vol30d = 0;
                }
            } catch (e) {
                console.error(`Failed to fetch candles for ${pair.symbol}`, e);
                pair.vol7d = 0;
                pair.vol30d = 0;
            }
        }));

        return NextResponse.json({
            totalVolumeUSD,
            tickerCount: data.length,
            topPairs,
            lowPairs
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Failed to fetch volume' }, { status: 500 });
    }
}
