/**
 * Simple in-memory rate limiter for Supabase Edge Functions.
 * Limits requests per IP address using a sliding window.
 *
 * This is suitable for single-instance Edge Functions.
 * For multi-instance deployments, use Upstash Redis instead.
 */

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically to prevent memory leaks
const CLEANUP_INTERVAL_MS = 60_000; // 1 minute
let lastCleanup = Date.now();

function cleanup() {
    const now = Date.now();
    if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
    lastCleanup = now;
    for (const [key, entry] of rateLimitMap) {
        if (now > entry.resetAt) {
            rateLimitMap.delete(key);
        }
    }
}

/**
 * Check if a request should be rate-limited.
 * @param identifier - Usually the client IP or user ID
 * @param maxRequests - Max requests allowed in the window (default: 60)
 * @param windowMs - Time window in milliseconds (default: 60000 = 1 minute)
 * @returns { allowed: boolean, remaining: number, retryAfterMs: number }
 */
export function checkRateLimit(
    identifier: string,
    maxRequests = 60,
    windowMs = 60_000,
): { allowed: boolean; remaining: number; retryAfterMs: number } {
    cleanup();
    const now = Date.now();
    const entry = rateLimitMap.get(identifier);

    if (!entry || now > entry.resetAt) {
        // First request or window expired
        rateLimitMap.set(identifier, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: maxRequests - 1, retryAfterMs: 0 };
    }

    if (entry.count >= maxRequests) {
        return {
            allowed: false,
            remaining: 0,
            retryAfterMs: entry.resetAt - now,
        };
    }

    entry.count++;
    return { allowed: true, remaining: maxRequests - entry.count, retryAfterMs: 0 };
}

/**
 * Returns rate limit headers for the response.
 */
export function rateLimitHeaders(
    remaining: number,
    retryAfterMs: number,
): Record<string, string> {
    const headers: Record<string, string> = {
        "X-RateLimit-Remaining": remaining.toString(),
    };
    if (retryAfterMs > 0) {
        headers["Retry-After"] = Math.ceil(retryAfterMs / 1000).toString();
    }
    return headers;
}
