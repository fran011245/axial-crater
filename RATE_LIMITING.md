# Rate Limiting Implementation

**Status:** ✅ Implemented and Tested  
**Date:** December 23, 2025

---

## Overview

All API routes now have rate limiting to prevent abuse, reduce costs, and ensure fair usage. The implementation uses an in-memory cache (suitable for single-instance deployments like Vercel).

---

## Rate Limit Configuration

### Current Limits

| Endpoint | Limit | Window | Notes |
|----------|-------|--------|-------|
| `/api/snapshot` | 2 requests | 5 minutes | Bypassed for Supabase Edge Functions |
| `/api/wallet` | 30 requests | 1 minute | Per IP address |
| `/api/volume` | 30 requests | 1 minute | Per IP address |
| `/api/funding` | 30 requests | 1 minute | Per IP address |
| `/api/movements` | 30 requests | 1 minute | Per IP address |

### Response Headers

All API responses include rate limit headers:

```
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 25
X-RateLimit-Reset: 45
```

- **Limit:** Maximum requests allowed in the window
- **Remaining:** Requests remaining in current window
- **Reset:** Seconds until the window resets

---

## Rate Limit Response

When rate limited, the API returns:

**Status:** `429 Too Many Requests`

**Headers:**
```
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 45
Retry-After: 45
```

**Body:**
```json
{
  "error": "Rate limit exceeded",
  "retryAfter": 45
}
```

---

## Implementation Details

### File: `src/lib/rateLimit.js`

**Key Features:**
- In-memory Map for tracking requests per IP
- Automatic cleanup of expired entries (every 60 seconds)
- IP extraction from `x-forwarded-for`, `x-real-ip`, `cf-connecting-ip` headers
- Bypass mechanism for Supabase Edge Functions (checks `user-agent` and `cf-ray`)

**Rate Limit Types:**
```javascript
const RATE_LIMITS = {
  snapshot: {
    windowMs: 5 * 60 * 1000,  // 5 minutes
    maxRequests: 2,
  },
  publicApi: {
    windowMs: 60 * 1000,      // 1 minute
    maxRequests: 30,
  },
  strict: {
    windowMs: 60 * 1000,      // 1 minute
    maxRequests: 10,          // For future expensive operations
  },
};
```

### Usage in API Routes

```javascript
import { rateLimit, getRateLimitHeaders } from '@/lib/rateLimit';

export async function GET(request) {
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

    // ... rest of API logic ...

    return NextResponse.json(
        { data: ... },
        {
            headers: getRateLimitHeaders(rateLimitResult)
        }
    );
}
```

---

## Testing

### Test Script: `test-rate-limit.sh`

```bash
# Test wallet API with 35 requests
./test-rate-limit.sh http://localhost:3001/api/wallet 35 0.1
```

### Manual Testing

```bash
# Send 35 rapid requests
for i in {1..35}; do 
    curl -s -w "HTTP %{http_code}\n" -o /dev/null http://localhost:3001/api/wallet
    sleep 0.1
done
```

**Expected Results:**
- First ~30 requests: HTTP 200 (or 500 if API fails)
- Remaining requests: HTTP 429 (Rate Limited)

### Test Results (December 23, 2025)

```
Request 1-29: HTTP 500 (Etherscan API errors)
Request 30-35: HTTP 429 ✅ (Rate Limited)
```

**Conclusion:** Rate limiting works as expected.

---

## Scaling Considerations

### Current Implementation (In-Memory)

**Pros:**
- Simple, no external dependencies
- Fast (no network calls)
- Free

**Cons:**
- Not shared across multiple instances
- Lost on server restart
- Not suitable for horizontal scaling

### For Production at Scale

If you deploy multiple Vercel instances or need persistent rate limiting, consider:

#### Option 1: Upstash Redis (Recommended)

```javascript
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const ratelimit = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(30, "1 m"),
});

export async function GET(request) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const { success, limit, remaining, reset } = await ratelimit.limit(ip);
  
  if (!success) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }
  // ... rest of logic
}
```

**Cost:** ~$0.20/month for 10K requests/day

#### Option 2: Vercel Edge Config

```javascript
import { get } from '@vercel/edge-config';

// Store rate limit state in Edge Config
// (requires manual implementation)
```

**Cost:** Free tier available

---

## Adjusting Rate Limits

To change rate limits, edit `src/lib/rateLimit.js`:

```javascript
const RATE_LIMITS = {
  snapshot: {
    windowMs: 5 * 60 * 1000,
    maxRequests: 5,  // Increase from 2 to 5
  },
  publicApi: {
    windowMs: 60 * 1000,
    maxRequests: 60,  // Increase from 30 to 60
  },
};
```

**Note:** Higher limits = higher API costs (Etherscan, CoinGecko, Bitfinex).

---

## Monitoring

### Check Rate Limit Abuse

```sql
-- In Supabase SQL Editor
SELECT 
  timestamp::date as date,
  COUNT(*) as snapshot_count
FROM volume_snapshots
GROUP BY date
ORDER BY date DESC;
```

**Expected:** ~288 snapshots/day (every 5 minutes)

**If higher:** Check for rate limit bypass or unauthorized access.

---

## Bypass for Supabase Edge Functions

The rate limiter automatically bypasses Supabase Edge Functions:

```javascript
export function isSupabaseEdgeFunction(request) {
  const userAgent = request.headers.get('user-agent') || '';
  const cfRay = request.headers.get('cf-ray');
  
  // Supabase Edge Functions have Deno user agent + Cloudflare
  return userAgent.includes('Deno') && cfRay !== null;
}
```

This ensures cron jobs can trigger `/api/snapshot` without being rate limited.

---

## Security Notes

1. **IP Spoofing:** The rate limiter trusts `x-forwarded-for` header. Vercel validates this, but be aware of potential spoofing in other environments.

2. **Memory Leak Prevention:** Old entries are automatically cleaned up every 60 seconds.

3. **DDoS Protection:** In-memory rate limiting provides basic protection. For serious DDoS attacks, use Cloudflare or similar CDN.

---

## Future Improvements

1. **Persistent Storage:** Migrate to Redis for multi-instance support
2. **Per-User Limits:** Track authenticated users separately (higher limits)
3. **Dynamic Limits:** Adjust limits based on time of day or load
4. **Rate Limit Dashboard:** Visualize rate limit hits in real-time

---

*Last updated: December 23, 2025*


