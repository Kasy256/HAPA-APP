HAPA API Overview
=================

This document summarizes the main HTTP APIs used by the HAPA mobile app. In production, the app talks primarily to **Supabase Edge Functions** through a thin `apiFetch` client, using logical paths such as `/api/auth`, `/api/venues`, `/api/posts`, `/api/discover`, and `/api/locations/suggest`.

> **Note:** Exact URLs and payloads may vary slightly depending on environment and evolution of the code. Treat this as a high-level guide and always confirm against the actual handlers.

---

1. Authentication (auth)
------------------------

Logical base path: `/api/auth`  
Backed by: Supabase Edge Function `auth` (and/or Flask `auth` blueprint)

### 1.1. Request OTP

**Purpose:** Start phone-based login for a venue owner by sending a one-time password (OTP) to their phone.

- **Endpoint:** `POST /api/auth/request-otp`
- **Body:**

```json
{
  "phone": "+256XXXXXXXXX"
}
```

- **Response (typical):**

```json
{
  "success": true,
  "message": "OTP sent"
}
```

### 1.2. Verify OTP

**Purpose:** Verify the OTP and issue a session for the owner.

- **Endpoint:** `POST /api/auth/verify-otp`
- **Body:**

```json
{
  "phone": "+256XXXXXXXXX",
  "code": "12345"
}
```

- **Response (typical):**

```json
{
  "access_token": "jwt-or-session-token",
  "refresh_token": "refresh-token-if-applicable",
  "user": {
    "id": "user-id",
    "phone": "+256XXXXXXXXX"
  }
}
```

The mobile client stores these tokens securely and uses them for subsequent requests requiring owner authentication.

### 1.3. Anonymous login (Supabase client-side)

The mobile app may perform **anonymous sign-in** via the Supabase SDK directly (not through `/api/auth`) in order to:

- Track session state for discoverers (non-owners).
- Call Edge Functions that require a Supabase user context.

---

2. Venues (venues)
------------------

Logical base path: `/api/venues`  
Backed by: Supabase Edge Function `venues` (and/or Flask `venues` blueprint)

### 2.1. Get current owner’s venue

**Purpose:** Fetch the venue profile associated with the currently authenticated owner.

- **Endpoint:** `GET /api/venues/me`
- **Auth:** Required (owner token)

- **Response (example):**

```json
{
  "id": "venue-id",
  "name": "Club Hapa",
  "type": "Lounge",
  "city": "Kampala",
  "area": "Kololo",
  "cover_image_url": "https://...",
  "avatar_url": "https://...",
  "metrics": {
    "profile_views": 1234,
    "total_vibe_likes": 567
  }
}
```

### 2.2. Create a venue

**Purpose:** Onboard a new venue owner by creating their first venue.

- **Endpoint:** `POST /api/venues`
- **Auth:** Required (owner token)
- **Body (example):**

```json
{
  "name": "Club Hapa",
  "type": "Bar",
  "city": "Kampala",
  "area": "Kololo",
  "place_id": "google-place-id",
  "cover_image_url": "https://...",
  "avatar_url": "https://..."
}
```

- **Response (example):**

```json
{
  "id": "venue-id",
  "owner_id": "user-id",
  "name": "Club Hapa",
  "type": "Bar",
  "city": "Kampala",
  "area": "Kololo"
}
```

### 2.3. Update a venue

**Purpose:** Edit venue profile (name, imagery, etc.).

- **Endpoint:** `PUT /api/venues/:id`
- **Auth:** Required (owner token; must own the venue)
- **Body:** Partial or full venue fields.

### 2.4. Venue metrics

**Purpose:** Fetch summary metrics for a venue’s profile and posts.

- **Endpoint:** `GET /api/venues/:id/metrics`
- **Auth:** Typically owner only.

- **Response (example):**

```json
{
  "profile_views": 1234,
  "vibe_likes": 567,
  "recent_posts": [
    {
      "id": "post-id-1",
      "created_at": "2024-01-01T12:00:00Z",
      "likes": 100,
      "views": 500
    }
  ]
}
```

---

3. Posts / vibes (posts)
------------------------

Logical base path: `/api/posts`  
Backed by: Supabase Edge Function `posts` (and/or Flask `posts` blueprint)

### 3.1. Create a post

**Purpose:** Create a new “vibe” for a venue after media has been uploaded to storage.

- **Endpoint:** `POST /api/posts`
- **Auth:** Required (owner token)
- **Body (example):**

```json
{
  "venue_id": "venue-id",
  "media_url": "https://.../posts/venue-id/post-id.mp4",
  "media_type": "video",  // or "image"
  "caption": "Tonight we go till late!"
}
```

- **Response (example):**

```json
{
  "id": "post-id",
  "venue_id": "venue-id",
  "media_url": "https://...",
  "media_type": "video",
  "caption": "Tonight we go till late!",
  "created_at": "2024-01-01T18:00:00Z"
}
```

### 3.2. Delete a post

**Purpose:** Remove a vibe created by the owner.

- **Endpoint:** `DELETE /api/posts/:id`
- **Auth:** Required (owner token; must own the venue/post)

- **Response (typical):**

```json
{
  "success": true
}
```

### 3.3. Get posts for a venue

**Purpose:** Retrieve all posts for display in the venue profile grid or story viewer.

- **Endpoint:** `GET /api/posts/venue/:id`
- **Auth:** Public read (for discovery), or owner-only for more detailed data.

- **Response (example):**

```json
[
  {
    "id": "post-id-1",
    "venue_id": "venue-id",
    "media_url": "https://...",
    "media_type": "image",
    "caption": "Happy Hour 5–7PM",
    "created_at": "2024-01-01T16:00:00Z",
    "likes": 10,
    "views": 50
  }
]
```

### 3.4. Toggle like

**Purpose:** Like or unlike a post from the discoverer side.

- **Endpoint:** `POST /api/posts/:id/like`
- **Auth:** Supabase user (anonymous or logged in)
- **Body (optional):**

```json
{
  "liked": true
}
```

- **Response (example):**

```json
{
  "liked": true,
  "likes": 11
}
```

### 3.5. Record a view

**Purpose:** Increment the view count when a user watches a story.

- **Endpoint:** `POST /api/posts/:id/view`
- **Auth:** Supabase user (anonymous allowed)

- **Response (typical):**

```json
{
  "success": true
}
```

---

4. Discovery (discover)
-----------------------

Logical base path: `/api/discover`  
Backed by: Supabase Edge Function `discovery` (and/or Flask `discover` blueprint)

### 4.1. Discovery feed

**Purpose:** Get the main discovery payload for the discoverer home screen: “Top places today” and “Vibes today”.

- **Endpoint:** `GET /api/discover/feed`
- **Query params (examples):**
  - `city=Kampala`
  - `lat=-1.2921&lng=36.8219`

- **Response (example):**

```json
{
  "top_places_today": [
    {
      "venue": {
        "id": "venue-id",
        "name": "Club Hapa",
        "city": "Kampala",
        "area": "Kololo"
      },
      "latest_post": {
        "id": "post-id",
        "media_url": "https://...",
        "created_at": "2024-01-01T20:00:00Z"
      }
    }
  ],
  "vibes_today": [
    {
      "venue": { "id": "venue-id", "name": "Club Hapa" },
      "post": {
        "id": "post-id",
        "media_url": "https://..."
      },
      "distance_meters": 1234,
      "travel_time_minutes": 8
    }
  ]
}
```

### 4.2. Search venues

**Purpose:** Search venues by text and/or proximity.

- **Endpoint:** `GET /api/discover/search`
- **Query params (examples):**
  - `q=hapa`
  - `city=Kampala`
  - `lat=-1.2921&lng=36.8219`

- **Response (example):**

```json
[
  {
    "id": "venue-id",
    "name": "Club Hapa",
    "city": "Kampala",
    "area": "Kololo",
    "distance_meters": 500
  }
]
```

### 4.3. Nearby venues / vibes

Some implementations may have a dedicated nearby endpoint, or reuse the `feed` endpoint with lat/lng parameters to:

- Return venues sorted by distance.
- Include an estimated travel time.

---

5. Location suggestions (google-maps)
-------------------------------------

Logical base path: `/api/locations` or `/api/locations/suggest`  
Backed by: Supabase Edge Function `google-maps` (and/or Flask `locations` blueprint)

### 5.1. Suggest locations

**Purpose:** Provide Google Places-powered suggestions as the user types a location.

- **Endpoint:** `GET /api/locations/suggest`
- **Query params:**
  - `q=` – user input string.

- **Response (example):**

```json
[
  {
    "place_id": "ChIJN1t_tDeuEmsRUsoyG83frY4",
    "description": "Kololo, Kampala, Uganda"
  }
]
```

The mobile app uses this to power autocomplete and selection for venue onboarding or search.

### 5.2. Place details (optional)

Some flows may call a details endpoint to resolve a `place_id`:

- **Endpoint:** `GET /api/locations/details`
- **Query params:**
  - `place_id=ChIJN1t_tDeuEmsRUsoyG83frY4`

- **Response (example):**

```json
{
  "place_id": "ChIJN1t_tDeuEmsRUsoyG83frY4",
  "name": "Kololo",
  "formatted_address": "Kololo, Kampala, Uganda",
  "location": {
    "lat": 0.335,
    "lng": 32.593
  }
}
```

---

6. Error handling & auth notes
------------------------------

- **Auth failures**
  - Typically return `401` or `403` with a JSON body:

    ```json
    {
      "error": "Unauthorized",
      "message": "Invalid or missing token"
    }
    ```

  - The mobile client should:
    - Log the user out or refresh tokens when appropriate.
    - Show user-friendly messages for expired sessions.

- **Validation errors**
  - Usually `400` with a JSON body describing missing/invalid fields.

- **Rate limiting**
  - Implemented for some endpoints (especially OTP and Google Maps) either via:
    - Supabase function logic, or
    - Flask `Flask-Limiter`.

---

7. Using these APIs from the mobile client
-----------------------------------------

The Expo app centralizes calls via an `apiFetch` helper:

- Accepts a logical path (e.g. `/api/posts`, `/api/venues/me`) plus options.
- Attaches:
  - Supabase or backend JWT tokens when available.
  - JSON headers and base URL from environment.
- Parses and throws errors in a consistent way.

This means screens and components:

- **Do not need to know** whether the backend is a Supabase Edge Function or Flask route.
- Can simply:

```ts
const res = await apiFetch('/api/discover/feed', { method: 'GET' });
```

If you add or change endpoints, update the `apiFetch` mapping and then call the new logical path from the UI code.

