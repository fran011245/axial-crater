import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const res = await fetch('https://api-pub.bitfinex.com/v2/platform/status', {
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store'
        });

        // Response is [1] for operative, [0] for maintenance
        const data = await res.json();
        const isOperative = data[0] === 1;

        return NextResponse.json({
            status: isOperative ? "Operational" : "Maintenance",
            raw: data
        });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 });
    }
}
