export const ALLOWED_ORIGINS = [
    "hapapp://",
    "exp://",
    "https://www.gethapa.com",
];

export const ALLOWED_METHODS = "GET, POST, PUT, DELETE, OPTIONS";
export const ALLOWED_HEADERS = "authorization, x-client-info, apikey, content-type, x-sub-path, x-paystack-signature";

export function corsHeaders(requestOrigin: string | null): Record<string, string> {
    const isAllowed = requestOrigin && (
        ALLOWED_ORIGINS.includes(requestOrigin) ||
        requestOrigin.startsWith("http://localhost:") ||
        requestOrigin.startsWith("http://192.168.")
    );

    // Echo the request origin if allowed; otherwise fall back to primary domain
    const originToEcho = isAllowed ? requestOrigin : "https://hapapp.co";

    return {
        "Access-Control-Allow-Origin": originToEcho,
        "Access-Control-Allow-Methods": ALLOWED_METHODS,
        "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    };
}
