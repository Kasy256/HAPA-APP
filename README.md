HAPA – Nightlife Discovery & Promotion App
=========================================

HAPA is a **mobile‑first citylife discovery and promotion app**. It helps people quickly see what the “vibe” is at nearby venues right now, and gives venue owners simple tools to promote their spot with story‑style “vibes” (short‑lived photo/video posts).

- **Discoverers (regular users)** use HAPA to:
  - Browse a location‑aware feed of nearby venues and their current “vibes”.
  - View full‑screen, story‑style posts from venues.
  - Search for places, see distance/ETA, and open directions in maps.

- **Venue owners** use HAPA to:
  - Log in with phone‑number OTP (no passwords).
  - Create and manage a venue profile.
  - Capture and upload “vibes” (photos/videos) from their phone.
  - Track lightweight engagement metrics (views, likes, profile views).

This repository contains:

- **HAPA‑FRONTEND** – Expo/React Native app.
- **HAPA‑BACKEND** – Flask API service (Render‑friendly).
- **Supabase project** – SQL migrations and Edge Functions used as the primary API for the mobile app.

---

Contents
--------

- [Features](#features)
- [Architecture](#architecture)
  - [Mobile app (HAPA‑FRONTEND)](#mobile-app-hapa-frontend)
  - [Supabase backend](#supabase-backend)
  - [Flask backend (HAPA‑BACKEND)](#flask-backend-hapa-backend)
- [Tech stack](#tech-stack)
- [Local development](#local-development)
  - [Prerequisites](#prerequisites)
  - [Environment variables](#environment-variables)
  - [Running the mobile app](#running-the-mobile-app)
  - [Running Supabase locally](#running-supabase-locally)
  - [Running the Flask API](#running-the-flask-api)
- [Key user flows](#key-user-flows)
- [Project structure](#project-structure)
- [Deployment overview](#deployment-overview)

---

Features
--------

**For discoverers**

- **Onboarding choice** between discovering venues or promoting as an owner, with the choice remembered on the device.
- **Anonymous auth** via Supabase so users can browse without creating an account.
- **Location‑based discovery feed**:
  - “Top places today” carousel showing venues with recent vibes.
  - “Vibes Today” feed summarizing the most recent post per venue.
  - Distance and travel‑time estimates with a “Get Directions” action that opens maps.
- **Search & “Near you”**:
  - Text search for venues.
  - Location suggestions via Google Places Autocomplete.
  - “Near you” venues based on GPS position.
- **Story viewer**:
  - Full‑screen story‑style viewer (tap to advance, auto‑progress).
  - Like/unlike posts with optimistic UI updates.
  - View tracking for story impressions.

**For venue owners**

- **OTP‑based login**:
  - Submit phone number to request a one‑time code.
  - Enter OTP to log in and create/restore a venue owner session.
- **Venue onboarding and profile**:
  - Create venue with name, type, city/area and images.
  - Edit profile details and media later.
- **Create and manage “vibes”**:
  - Capture photo or video using the device camera.
  - Background upload to Supabase Storage with global progress indicator.
  - Persist posts via Supabase Edge Function calls.
  - Delete posts from the venue dashboard.
- **Metrics dashboard**:
  - See profile views, total likes on vibes, and recent posts with engagement.

---

Architecture
------------

At a high level, the system looks like this:

```text
Expo/React Native app
      |
      |  apiFetch() (HTTPS)
      v
Supabase Edge Functions (auth, venues, posts, discovery, google-maps)
      |
      +--> Supabase Postgres (tables, RLS policies, RPCs)
      +--> Supabase Storage (media assets)
      +--> External APIs (Google Maps)

Flask API (HAPA-BACKEND)  <-- optional/parallel REST layer
      |
      +--> Supabase Postgres
      +--> Twilio SMS
      +--> Google Maps
```

### Mobile app (HAPA‑FRONTEND)

- **Framework**: Expo + React Native + Expo Router.
- **Navigation**:
  - `app/_layout.tsx` – root layout, bootstrap anonymous auth and routing.
  - `app/index.tsx` – landing page with “Discover” vs “Promote” choice.
  - `app/discover.tsx` – main discovery feed and search.
  - `app/story/[id].tsx` – story viewer for a post or venue.
  - `app/venue-login.tsx` and `app/verify-otp.tsx` – OTP auth flow.
  - `app/(venue)/*` – venue owner area (dashboard, create post, profile, etc.).
- **Networking**:
  - Central `apiFetch()` helper that calls Supabase Edge Functions instead of a traditional REST server.
  - Logical paths like `/api/auth`, `/api/posts`, `/api/venues`, `/api/discover`, `/api/locations/suggest` are mapped to named functions.
- **Capabilities**:
  - Camera and media capture via `expo-camera`, `expo-video`.
  - Location and maps via `expo-location`, `react-native-maps`.
  - Secure token storage via `expo-secure-store`.
  - Global upload state via a shared React context.

### Supabase backend

- **Database & storage**:
  - Postgres schema for `users`, `venues`, `posts`, likes/views, OTP codes, and analytics views/RPCs.
  - Row‑Level Security (RLS) policies to enforce per‑user/owner access rules.
  - Storage buckets for media assets (vibe photos/videos).
- **Edge Functions** (Deno):
  - `auth` – phone‑number OTP lifecycle and Supabase Auth integration.
  - `venues` – venue CRUD, owner checks, stats/metrics aggregation.
  - `posts` – CRUD for posts, like/view toggles, and per‑venue feeds.
  - `discovery` – location‑ and city‑based discovery feed, “nearby vibes” queries.
  - `google-maps` – proxy to Google Places Autocomplete/Details, with rate limiting.
- **Config**:
  - Supabase project is configured via `supabase/config.toml` and SQL migrations in `supabase/migrations/`.

### Flask backend (HAPA‑BACKEND)

The Flask backend provides a more traditional REST API surface that mirrors many of the Supabase Edge capabilities and is deployed as a web service (for example on Render).

- **Entry points**:
  - `app.py` – application factory that registers blueprints for auth, venues, posts, discovery, and locations.
  - `wsgi.py` – WSGI entry used by Gunicorn.
- **Key components**:
  - JWT authentication with `Flask-JWT-Extended`.
  - Supabase integration via `supabase-py`.
  - CORS handling and API rate limiting.
  - SMS delivery (e.g. Twilio) for OTP codes.
- **Typical use**:
  - Deployed as a separate REST service (e.g. for web apps, admin tooling, or as a legacy layer) alongside the Supabase project.

---

Tech stack
----------

- **Mobile**
  - Expo / React Native / Expo Router
  - TypeScript
  - `expo-camera`, `expo-video`, `expo-location`, `react-native-maps`
  - `expo-secure-store`, `expo-blur`, `expo-linear-gradient`

- **Backend & data**
  - Supabase (Postgres, Auth, Storage, Edge Functions)
  - Flask 3, Gunicorn
  - `supabase-py`, `Flask-JWT-Extended`, `Flask-Cors`, `Flask-Limiter`

- **Integrations**
  - Google Maps Platform (Places Autocomplete + Details, geocoding)
  - Twilio SMS (for OTP delivery)
  - Render.com or similar for Flask service hosting

---

Local development
-----------------

> **Note:** Exact commands and env values may vary depending on how you have your environment set up. The steps below describe the typical development flow for this repo.

### Prerequisites

- Node.js (LTS) and `npm` or `yarn`.
- Expo CLI (`npm install -g expo`).
- Python 3.10+ and `pip`.
- Supabase CLI (`https://supabase.com/docs/guides/cli`).
- A Supabase project (or local Supabase stack) with:
  - Database and storage.
  - Edge Functions deployed.
- API keys for:
  - Google Maps Platform.
  - Twilio (if you want SMS in development).

### Environment variables

You will typically need:

- **Frontend (Expo)** – in `app.config.js` / Expo config:
  - `EXPO_SUPABASE_URL`
  - `EXPO_SUPABASE_ANON_KEY`

- **Supabase / Edge Functions** – `.env` or Supabase project settings:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `GOOGLE_MAPS_API_KEY`

- **Flask backend** – `.env` in `HAPA-BACKEND`:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_KEY`
  - `JWT_SECRET_KEY`
  - `GOOGLE_MAPS_API_KEY`
  - `SMS_PROVIDER` and Twilio keys (if sending real SMS)

Check the existing config and `.env.example` files (if present) in the repo for the authoritative list.

### Running the mobile app

1. Change into the frontend directory:

   ```bash
   cd HAPA-FRONTEND
   ```

2. Install dependencies:

   ```bash
   npm install
   # or
   yarn
   ```

3. Start the Expo dev server:

   ```bash
   npx expo start
   ```

4. Use the Expo Dev Tools QR code or emulator to run the app on your device.

### Running Supabase locally

If you want to develop against a local Supabase stack:

1. Install and login with the Supabase CLI.
2. From the Supabase project directory:

   ```bash
   cd supabase
   supabase start
   ```

3. Apply migrations (if necessary):

   ```bash
   supabase db reset
   ```

4. Deploy Edge Functions locally or to your remote project, depending on your workflow:

   ```bash
   supabase functions deploy auth
   supabase functions deploy venues
   supabase functions deploy posts
   supabase functions deploy discovery
   supabase functions deploy google-maps
   ```

Update the Expo config so that the mobile app points at your running Supabase instance.

### Running the Flask API

1. Change into the backend directory:

   ```bash
   cd HAPA-BACKEND
   ```

2. Create and activate a virtual environment, then install dependencies:

   ```bash
   python -m venv .venv
   source .venv/bin/activate  # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. Create a `.env` file with the required variables (see [Environment variables](#environment-variables)).

4. Run the development server:

   ```bash
   flask run
   # or with gunicorn in dev:
   gunicorn wsgi:app --reload
   ```

Point any clients that should use this API at the host/port shown in the logs.

---

Key user flows
--------------

### Discoverer flow

1. User opens the app and chooses **“Discover”** on the landing screen.
2. App signs in anonymously with Supabase and fetches the discovery feed.
3. App requests location permission and loads nearby venues and vibes.
4. User scrolls the feed, taps a venue vibe to open the story viewer.
5. User can like a post, swipe through multiple posts, and open directions to the venue.

### Venue owner flow

1. User chooses **“Promote”** and is guided to the phone number login screen.
2. User enters phone number and receives an OTP (via SMS / dev log).
3. User enters OTP; backend verifies and returns a session for the venue owner.
4. If no venue exists yet, the app opens venue onboarding to create one.
5. Owner can then:
   - Capture and upload new vibes.
   - Review past vibes and delete if needed.
   - See profile and post metrics on the dashboard.

---

Project structure
-----------------

At a high level, the repo is organized as:

```text
HAPA APP/
  HAPA-FRONTEND/      # Expo/React Native mobile app
    app/              # Expo Router screens
    components/       # Shared UI components
    lib/              # API client, helpers
    contexts/         # React contexts (e.g., upload)
    ...

  HAPA-BACKEND/       # Flask API service
    app.py, wsgi.py
    blueprints/       # auth, venues, posts, discover, locations
    services/         # SMS, maps, etc.
    config.py
    ...

  supabase/           # Supabase project
    migrations/       # SQL migrations
    functions/        # Edge Functions (auth, venues, posts, discovery, google-maps, _shared)
    config.toml
    ...
```

---

Deployment overview
-------------------

- **Mobile app**
  - Built and distributed via Expo (EAS) or classic builds.
  - Configured to talk to the production Supabase project and/or Flask API.

- **Supabase**
  - Hosted Supabase project (or self‑hosted) with:
    - Database schema & RLS from this repo’s migrations.
    - Edge Functions deployed for `auth`, `venues`, `posts`, `discovery`, and `google-maps`.

- **Flask API**
  - Deployed as a web service, e.g. using Render as described in `render.yaml`.
  - Uses Gunicorn + `wsgi.py` and environment variables for all secrets and endpoints.

Use this README as a high‑level guide; for deeper implementation details, see comments and docs within the `HAPA-FRONTEND`, `HAPA-BACKEND`, and `supabase` subdirectories.

