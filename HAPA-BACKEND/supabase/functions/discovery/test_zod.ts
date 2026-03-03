import { z } from "https://deno.land/x/zod@v3.21.4/mod.ts";

try {
    const OldFeedSchema = z.object({
        lat: z.preprocess((val) => parseFloat(val as string), z.number()).optional(),
        lng: z.preprocess((val) => parseFloat(val as string), z.number()).optional(),
        radius_km: z.preprocess((val) => parseFloat(val as string), z.number()).default(10),
    });
    console.log("Old Schema result:", OldFeedSchema.parse({}));
} catch (e) {
    console.log("Old Schema error:", e.message);
}

try {
    const params = { q: "test" };
    const SearchSchema = z.object({
        q: z.string().optional(),
        city: z.string().optional(),
        area: z.string().optional(),
    });
    console.log("Search Schema result:", SearchSchema.parse(params));
} catch (e) {
    console.log("Search Schema error:", e.message);
}
