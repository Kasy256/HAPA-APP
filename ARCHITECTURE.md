Architecture – HAPA Nightlife App
=================================

This document gives a deeper look at the technical architecture of the HAPA app: how the mobile client, Supabase, and Flask backend fit together, and how core flows (auth, posting vibes, discovery) move through the system.

---

1. High-level system overview
-----------------------------

HAPA is composed of three main parts:

- **Mobile client** – Expo/React Native app (`HAPA-FRONTEND`).
- **Supabase project** – primary backend (Postgres, Auth, Storage, Edge Functions, RPCs).
- **Flask API** – parallel/legacy REST layer (`HAPA-BACKEND`), deployed separately (e.g., Render).

### Diagram

```text
             ┌─────────────────────────────┐
             │        Mobile client        │
             │  (Expo / React Native)      │
             │                             │
             │  - Screens & navigation     │
             │  - apiFetch() HTTP client   │
             └─────────────┬───────────────┘
                           │ HTTPS
                           v
             ┌─────────────────────────────┐
             │     Supabase Edge Fns      │
             │  (auth, venues, posts,     │
             │   discovery, google-maps)  │
             └──┬───────────┬───────────┬─┘
                │           │           │
         SQL/RPC│    Storage│    HTTP   │
                v           v           v
        ┌────────────┐ ┌───────────┐ ┌─────────────┐
        │ Postgres   │ │ Media     │ │ Google Maps │
        │ (tables,   │ │ (images,  │ │ APIs        │
        │  RLS, RPC) │ │  videos)  │ └─────────────┘
        └────────────┘ └───────────┘


   ┌──────────────────────────────────────────────────┐
   │                Flask API service                 │
   │      (optional / parallel REST layer)           │
   │  - JWT auth, Twilio SMS, Google Maps            │
   │  - Talks to same Supabase Postgres + external   │
   └──────────────────────────────────────────────────┘
```

The **mobile client talks primarily to Supabase Edge Functions**. The Flask API is an additional layer that can be used by other clients (web, admin) or as a legacy path; it shares the same underlying Supabase data.

---

2. Mobile client (HAPA-FRONTEND)
--------------------------------

### 2.1. Routing & navigation

The app uses **Expo Router** and the filesystem-based routing under `HAPA-FRONTEND/app/`.

Key routes:

- `app/_layout.tsx`
  - Root layout for navigation and session bootstrap.
  - Handles anonymous sign-in with Supabase and backend login with the received tokens.
  - Determines whether the user is in **discoverer** or **venue owner** mode.

- `app/index.tsx`
  - Landing screen with the “Discover” vs “Promote” choice.
  - Stores user preference in `AsyncStorage` so subsequent launches resume the preferred mode.

- `app/discover.tsx`
  - Main discovery screen:
    - Top 5 venues today (stories strip).
    - “Vibes Today” card feed.
    - Search tab with text search and “near you” section.
  - Requests location permission and fetches data from the `discovery` and `google-maps` Edge Functions.

- `app/story/[id].tsx`
  - Story viewer for a single post or series of posts for a venue.
  - Provides story-like UX (auto-advance, tap left/right, progress bars).

- `app/venue-login.tsx` & `app/verify-otp.tsx`
  - Venue owner login flow using phone-based OTP.
  - Integrates with the `auth` Edge Function.

- `app/(venue)/*`
  - Venue owner area:
    - Dashboard (`index.tsx`): metrics and recent vibes.
    - `create-post.tsx`: capture and submit new vibes.
    - `profile.tsx`, `edit-profile.tsx`: manage venue metadata.

### 2.2. API client abstraction

All network calls from the mobile app go through a central helper (e.g. `lib/api.ts`):

- Maps logical paths (e.g. `/api/auth`, `/api/posts`, `/api/venues`, `/api/discover`, `/api/locations/suggest`) to specific **Supabase Edge Functions**.
- Handles:
  - Injecting auth tokens (if present).
  - Consistent error handling and retry policies.
  - Environment-specific base URLs from Expo config.

**Why this design?**

- Swapping between Supabase Edge Functions and a traditional REST API is isolated to one place.
- Reduces coupling between UI components and backend details.

### 2.3. Global state & contexts

The app uses React Context to model global concerns:

- **Upload context**:
  - Manages the lifecycle of media uploads (queued, in-progress, completed, failed).
  - Exposes functions like `startUpload()` for screens to trigger background uploads.
  - Feeds a `GlobalUploadProgress` UI component so users see upload state across screens.

- **Auth / session state**:
  - Tokens from Supabase and/or backend are stored securely (e.g. `expo-secure-store`).
  - The root layout uses these tokens to:
    - Restore sessions on app relaunch.
    - Configure the Supabase client instance.

### 2.4. Permissions & native capabilities

The mobile client uses Expo APIs for:

- **Camera & media**:
  - `expo-camera` and `expo-video` for capturing and rendering vibes.
  - Local capture preview before media is submitted.

- **Location & maps**:
  - `expo-location` to request permission and get current coordinates.
  - `react-native-maps` to show venue positions on maps and support “Get Directions”.

- **Secure storage**:
  - `expo-secure-store` for auth/session tokens and other sensitive data.

---

3. Supabase backend
-------------------

Supabase is the **primary backend** for the mobile app, providing:

- **Database (Postgres)** with row-level security (RLS) and RPCs.
- **Auth** for users and owners.
- **Storage** for media.
- **Edge Functions** for business logic and HTTP endpoints.

### 3.1. Database schema

The schema is defined via SQL migrations under `supabase/migrations/` and typically includes:

- `users`
  - Represents end-users and venue owners.
  - Linked to Supabase Auth users.

- `venues`
  - Represents a physical venue (bar, club, lounge, etc.).
  - Fields: name, type, address/city/area, geolocation, images, owner_id, etc.

- `posts`
  - Represents a “vibe”, a story-like media post.
  - Fields: venue_id, media URL, caption, created_at, visibility flags, etc.

- `post_likes`, `post_views`
  - Track engagement metrics on posts.

- `otp_codes` or similar
  - Track phone-based OTPs for verification/login.

- Views / RPCs
  - `get_nearby_vibes` – for discovery around a point.
  - `track_post_view`, `toggle_post_like` – for recording and toggling engagement.

> Exact table/column names may differ; the goal is to have normalized tables for venues, posts, users, and metrics, with helper RPCs for complex queries.

### 3.2. Row-Level Security (RLS)

RLS policies enforce that:

- A venue owner can **only modify their own venue** and its posts.
- Anonymous or regular users can **read public venues and posts**, but not modify them.
- Internal functions (Edge Functions with service role) can perform elevated operations where appropriate.

Policies are defined in migration SQL files; Edge Functions rely on them to avoid duplicating authorization logic.

### 3.3. Edge Functions

Key Edge Functions and responsibilities:

- `auth`
  - Handles phone-based OTP flow.
  - Creates or updates Supabase Auth users.
  - Issues JWTs or session tokens used by the mobile client.

- `venues`
  - CRUD for venue profiles.
  - Ensures only the owner can create/update/delete their venue.
  - Provides aggregated metrics over a venue’s posts (views, likes).

- `posts`
  - CRUD for posts (“vibes”).
  - Validates owner permissions (must own the venue).
  - Handles like/view toggling and analytics RPC calls.

- `discovery`
  - Responsible for location- or city-based discovery.
  - Uses `get_nearby_vibes` or equivalent SQL to return “Top places” and “Vibes Today”.

- `google-maps`
  - Thin proxy for Google Places Autocomplete and Details, with rate limiting and API key protection.

All functions are deployed under `supabase/functions/` and configured in `supabase/config.toml`.

### 3.4. Storage

Supabase Storage is used to store media assets:

- Buckets for posts (e.g., `/posts/{venueId}/{postId}.mp4` or `.jpg`).
- Access rules:
  - Public or signed-URL-based access for consumption in the mobile app.
  - Owner-limited write/delete for uploads and post removal.

---

4. Flask backend (HAPA-BACKEND)
-------------------------------

The Flask backend is a **parallel REST API** that can be used by other clients or as a legacy path. It talks to the same Supabase project.

### 4.1. Application structure

- `app.py`
  - Application factory that initializes extensions and registers blueprints.

- `wsgi.py`
  - Entrypoint for Gunicorn and deployment platforms.

- `blueprints/*`
  - `auth` – phone-based OTP auth, login, token issuance.
  - `venues` – venue CRUD, metrics, and views.
  - `posts` – post CRUD and interaction endpoints.
  - `discover` – discovery feed endpoints.
  - `locations` – Google Maps / places autocomplete endpoints.

- `services/*`
  - `sms.py` – Twilio or alternative SMS provider integration for OTPs.
  - `maps.py` – Google Maps client logic for places/geocoding.

- `extensions.py`
  - Configures Supabase client, JWT, CORS, rate limiter, etc.

### 4.2. Auth model

- Uses `Flask-JWT-Extended` for JWT-based auth.
- Tokens embed user identity and are validated for protected endpoints.
- Works alongside Supabase Auth:
  - May use Supabase as the user source and issue its own JWTs.
  - Or may consume Supabase-issued tokens and validate them.

### 4.3. When to use Flask vs Supabase functions

- **Supabase Edge Functions**
  - Primary path for **mobile**.
  - Best for latency, proximity to DB, and leveraging RLS.

- **Flask**
  - Good for:
    - Admin dashboards or web clients.
    - Synchronous workflows involving third-party APIs (e.g., Twilio).
    - More traditional REST server style with Python ecosystem libraries.

Both surfaces can co-exist; they share the Supabase database and are coordinated via environment configuration.

---

5. Core flows (sequence-level)
------------------------------

### 5.1. Discoverer browsing flow

1. **App launch**
   - `app/_layout.tsx` bootstraps anonymous Supabase session if needed.
   - User’s “Discover vs Promote” preference is loaded from storage.

2. **Location & feed**
   - `app/discover.tsx` requests location permission.
   - The app calls Supabase `discovery` function to load:
     - “Top places today” (venues + most recent vibe).
     - “Vibes Today” feed.

3. **Interactions**
   - Tapping a vibe navigates to `app/story/[id].tsx`.
   - The story viewer:
     - Fetches post(s) and venue metadata.
     - Calls `posts` function endpoints to record views and likes.

4. **Directions**
   - If the user taps “Get Directions”, the app opens the native maps app with the venue location.

### 5.2. Venue owner login & onboarding

1. **Phone number entry**
   - Owner enters phone number in `app/venue-login.tsx`.
   - App calls Supabase `auth` function to request an OTP and sends SMS via Twilio or dev log.

2. **OTP verification**
   - Owner enters received OTP in `app/verify-otp.tsx`.
   - App calls `auth` function again to verify.
   - On success:
     - A session is created/updated in Supabase Auth.
     - Mobile app stores tokens securely and marks user as an owner.

3. **Venue detection**
   - App calls `venues` function (`/venues/me`) to check if the owner already has a venue.
   - If not:
     - Navigate to venue onboarding (create screen).
   - If yes:
     - Navigate to `/(venue)/index.tsx` dashboard.

### 5.3. Posting a vibe

1. **Capture**
   - Owner taps “Create vibe” (e.g., `/(venue)/create-post.tsx`).
   - App opens camera (photo or video).
   - After recording, a local preview is shown.

2. **Upload initiation**
   - On submit, the app:
     - Adds an upload job to the upload context (`startUpload()`).
     - Starts streaming the file to Supabase Storage.
     - Optimistically navigates back to the owner dashboard.

3. **Finalize post**
   - After successful upload:
     - Edge Function `posts` is called to create the DB record pointing at the media URL.
     - Owner dashboard reloads posts from `posts`/`venues` functions.

4. **Failure handling**
   - If upload fails:
     - Upload context marks the job as failed.
     - UI can show a retry option or error message.

---

6. Configuration & environments
-------------------------------

### 6.1. Environments

Typical environments:

- **Local development**
  - Expo app connected to:
    - Local Supabase stack (via Supabase CLI), or
    - Remote dev Supabase project.
  - Optional local Flask API.

- **Staging**
  - Separate Supabase project.
  - Flask API deployed to a staging service.
  - Used for pre-release testing.

- **Production**
  - Production Supabase project (database, storage, Edge Functions).
  - Production Flask API deployment (e.g., Render).
  - Expo app builds configured with production URLs and keys.

### 6.2. Key configuration points

- **Expo config**
  - Base URLs for Supabase and any REST endpoints.
  - Feature flags (if any) for environment-specific behavior.

- **Supabase**
  - `config.toml` for Edge Function settings.
  - Project settings for JWT, auth, and storage.

- **Flask**
  - `config.py` for environment-specific config classes.
  - `.env` used in development, platform env variables in production.

---

7. Extensibility notes
----------------------

A few patterns in this architecture make it easy to extend:

- **API abstraction in the mobile client**
  - Adding new endpoints or refactoring existing ones is centralized in the API client.

- **Supabase Edge Functions**
  - New business logic can be added as new functions or extended within existing ones.
  - Reuse RPCs and RLS policies instead of duplicating security rules.

- **Flask blueprints**
  - New REST resources can be added via new blueprints.
  - Shared services (`sms`, `maps`, Supabase client) keep integration code DRY.

When adding features, favor:

- Reusing **Supabase DB and Edge Functions** for data-heavy operations.
- Using the **Flask layer** where Python’s ecosystem (e.g., external APIs, ML models) provides additional value.

