export const ALLOWED_ORIGINS = [
    // Expo / Mobile App custom scheme
    "hapapp://",
    "exp://",    // Expo Go development
];

export const ALLOWED_METHODS = "GET, POST, PUT, DELETE, OPTIONS";
export const ALLOWED_HEADERS = "authorization, x-client-info, apikey, content-type, x-sub-path, x-paystack-signature";

export function corsHeaders(requestOrigin: string | null): Record<string, string> {
    const isAllowed = requestOrigin && (
        ALLOWED_ORIGINS.includes(requestOrigin) || 
        // Allow mobile apps which may send origin like capacitor://localhost or http://localhost (Android emulator)
        requestOrigin.startsWith("http://localhost:") || 
        requestOrigin.startsWith("http://192.168.") // Local LAN development
    );

    // If an Origin header was sent and it's allowed, echo it. Else fallback to the primary domain.
    // (If not allowed, the browser will block the response because it won't match the requester's origin).
    const originToEcho = isAllowed ? requestOrigin : "https://hapapp.co";

    return {
        "Access-Control-Allow-Origin": originToEcho,
        "Access-Control-Allow-Methods": ALLOWED_METHODS,
        "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    };
}
