import { NextResponse } from 'next/server';
import { rateLimit, getRateLimitHeaders } from '@/lib/rateLimit';

export async function GET(request) {
    try {
        // Rate limiting
        const rateLimitResult = rateLimit(request, 'publicApi');
        if (!rateLimitResult.success) {
            return NextResponse.json(
                { 
                    error: 'Rate limit exceeded',
                    retryAfter: rateLimitResult.reset 
                },
                { 
                    status: 429,
                    headers: {
                        ...getRateLimitHeaders(rateLimitResult),
                        'Retry-After': rateLimitResult.reset.toString(),
                    }
                }
            );
        }

        // Fetch derivatives status from Bitfinex
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        // La API de Bitfinex requiere el parámetro 'keys' para devolver datos
        // Usamos 'ALL' para obtener todos los derivativos
        const res = await fetch('https://api-pub.bitfinex.com/v2/status/deriv?keys=ALL', {
            headers: { 'Content-Type': 'application/json' },
            next: { revalidate: 60 }, // Cache for 60 seconds
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
            throw new Error(`Bitfinex API returned status ${res.status}`);
        }

        const data = await res.json();
        
        // Create mapping: spotSymbol -> openInterest
        // Response format: [KEY, MTS, ..., OPEN_INTEREST (index 18), ...]
        // KEY format: "tBTCF0:USD" -> map to "BTCUSD"
        const openInterestMap = {};
        
        if (Array.isArray(data)) {
            data.forEach(status => {
                if (!Array.isArray(status) || status.length < 19) return;
                
                const key = status[0]; // e.g., "tBTCF0:USD"
                const openInterest = status[18]; // OPEN_INTEREST
                
                if (!key || openInterest === null || openInterest === undefined) return;
                
                // Map derivative symbol to spot symbol
                // tBTCF0:USD -> BTCUSD
                // Remove 't' prefix, remove 'F0', convert ':' to nothing
                let spotSymbol = key;
                if (spotSymbol.startsWith('t')) {
                    spotSymbol = spotSymbol.substring(1); // Remove 't'
                }
                // Remove 'F0' (perpetual futures indicator)
                spotSymbol = spotSymbol.replace('F0', '');
                // Convert ':' to nothing
                spotSymbol = spotSymbol.replace(':', '');
                
                // Only add if we have a valid openInterest value
                if (typeof openInterest === 'number' && !isNaN(openInterest)) {
                    openInterestMap[spotSymbol] = openInterest;
                }
            });
        }

        return NextResponse.json(
            {
                openInterest: openInterestMap,
                lastUpdate: new Date().toISOString()
            },
            {
                headers: getRateLimitHeaders(rateLimitResult)
            }
        );
    } catch (error) {
        if (error.name === 'AbortError') {
            console.warn('Derivatives status API request timed out after 10 seconds');
        } else {
            console.error('Derivatives status API Error:', error.message || error);
        }
        return NextResponse.json({ 
            openInterest: {},
            error: 'Failed to fetch derivatives status',
            lastUpdate: new Date().toISOString()
        }, { status: 500 });
    }
}

