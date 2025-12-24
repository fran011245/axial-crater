/**
 * Simple in-memory rate limiter for API routes
 * For production with multiple instances, consider Redis (Upstash)
 */

const rateLimitMap = new Map();

/**
 * Rate limit configuration
 */
const RATE_LIMITS = {
  snapshot: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxRequests: 2, // Max 2 requests per 5 min window (cron + 1 manual)
  },
  publicApi: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30, // Max 30 requests per minute per IP
  },
  strict: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10, // Max 10 requests per minute (for expensive operations)
  },
};

/**
 * Clean up old entries periodically to prevent memory leak
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitMap.entries()) {
    if (now - value.resetTime > 0) {
      rateLimitMap.delete(key);
    }
  }
}, 60 * 1000); // Clean every minute

/**
 * Rate limiter middleware
 * @param {Request} request - Next.js request object
 * @param {string} limitType - Type of rate limit ('snapshot', 'publicApi', 'strict')
 * @returns {Object} { success: boolean, limit: number, remaining: number, reset: number }
 */
export function rateLimit(request, limitType = 'publicApi') {
  const config = RATE_LIMITS[limitType];
  if (!config) {
    throw new Error(`Invalid rate limit type: ${limitType}`);
  }

  // Get identifier (IP address or forwarded IP)
  const identifier = getIdentifier(request);
  const key = `${limitType}:${identifier}`;
  const now = Date.now();

  // Get or create rate limit entry
  let rateLimitEntry = rateLimitMap.get(key);

  if (!rateLimitEntry || now > rateLimitEntry.resetTime) {
    // Create new window
    rateLimitEntry = {
      count: 0,
      resetTime: now + config.windowMs,
    };
    rateLimitMap.set(key, rateLimitEntry);
  }

  // Increment request count
  rateLimitEntry.count++;

  const success = rateLimitEntry.count <= config.maxRequests;
  const remaining = Math.max(0, config.maxRequests - rateLimitEntry.count);
  const resetInSeconds = Math.ceil((rateLimitEntry.resetTime - now) / 1000);

  return {
    success,
    limit: config.maxRequests,
    remaining,
    reset: resetInSeconds,
    identifier: process.env.NODE_ENV === 'development' ? identifier : '[hidden]',
  };
}

/**
 * Get client identifier (IP address)
 * @param {Request} request
 * @returns {string}
 */
function getIdentifier(request) {
  // Try to get real IP from headers (Vercel/Cloudflare)
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cfConnectingIp = request.headers.get('cf-connecting-ip');

  // Use first IP from x-forwarded-for (client IP)
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  if (realIp) {
    return realIp;
  }

  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  // Fallback to a default (shouldn't happen in production)
  return 'unknown';
}

/**
 * Create rate limit response headers
 * @param {Object} rateLimitResult
 * @returns {Object} Headers object
 */
export function getRateLimitHeaders(rateLimitResult) {
  return {
    'X-RateLimit-Limit': rateLimitResult.limit.toString(),
    'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
    'X-RateLimit-Reset': rateLimitResult.reset.toString(),
  };
}

/**
 * Check if request is from Supabase Edge Function (bypass rate limit)
 * @param {Request} request
 * @returns {boolean}
 */
export function isSupabaseEdgeFunction(request) {
  const userAgent = request.headers.get('user-agent') || '';
  const cfRay = request.headers.get('cf-ray'); // Supabase uses Cloudflare
  
  // Supabase Edge Functions have specific user agent pattern
  return userAgent.includes('Deno') && cfRay !== null;
}

