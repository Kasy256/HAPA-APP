# HAPA Frontend — Codebase Documentation

HAPA is a venue discovery and social vibes app. Users browse a vertical TikTok-style feed of photo/video posts from venues. Venue owners manage their presence, post content, and pay for visibility boosts.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native via Expo SDK 54 |
| Navigation | Expo Router v6 (file-based, typed routes) |
| Backend | Supabase (Auth, Storage, Edge Functions) |
| Language | TypeScript (strict) |
| List rendering | @shopify/flash-list |
| Video playback | expo-video (useVideoPlayer + VideoView) |
| Animations | react-native-reanimated v4 |
| State | React Context + useRef + DeviceEventEmitter |
| Secure storage | expo-secure-store |

---

## Project Structure

```
app/                        Expo Router screens (file = route)
  _layout.tsx               Root layout — auth init, font loading, global upload bar
  index.tsx                 Start screen — choose Discover or Promote mode
  post.tsx                  Camera screen (photo + video capture)
  post-preview.tsx          Preview + tagging before upload
  verify-otp.tsx            OTP entry for venue login
  venue-login.tsx           Venue owner phone login
  venue-onboarding.tsx      New venue creation flow
  story/[id].tsx            Full-screen post viewer
  venue/[id].tsx            Public venue profile + post grid
  (tabs)/                   User-facing tab group
    _layout.tsx             Tab bar (Discover, Post, Search)
    discover.tsx            Main vertical feed
    search.tsx              Category browser + venue search
    post-redirect.tsx       Redirect stub → /post
  (venue)/                  Venue owner tab group (auth-gated)
    _layout.tsx             Venue tab bar
    index.tsx               Dashboard — metrics + proximity check-in
    create.tsx              Create a post
    promote.tsx             Boost posts / event spotlight
    profile.tsx             Account settings + subscription
    edit-profile.tsx        Edit venue details
    subscription.tsx        Tier management + payment

components/                 Reusable UI
  LiveWall.tsx              Comments modal (posts, venues, hashtags)
  GlobalUploadProgress.tsx  Top-of-screen upload bar (context-driven)
  MediaPreview.tsx          Image/video renderer with auto-play
  ScreenWrapper.tsx         Gradient background + safe area wrapper
  PaywallModal.tsx          Subscription paywall overlay
  PhoneInput.tsx            Country code + phone number input
  SkeletonLoader.tsx        Feed and search loading placeholders
  Skeleton.tsx              SkeletonBox / SkeletonCircle pulse components
  GradientText.tsx          Gradient-colored text
  VerifiedBadge.tsx         Pro / Elite tier badge

contexts/
  UploadContext.tsx         Global upload state — compress → upload → optimistic UI

hooks/
  useSubscription.ts        Fetch and expose subscription tier + post limits

lib/
  api.ts                    apiFetch wrapper + auth token management
  supabaseClient.ts         Supabase client, anonymous auth, media upload
  location.ts               Geolocation, distance (Haversine + 1.35× road), proximity
  venue.ts                  isVenueOpen / getVenueStatusText (working hours)
  time.ts                   getTimeAgo (relative timestamps)
  directions.ts             openDirections — Apple Maps (iOS) / Google Maps (Android)
  subscription.ts           PRICING and BOOST_PRICING constants
  logger.ts                 Structured logger (DEBUG/INFO/WARN/ERROR/CRITICAL)
  openSubscription.ts       Open subscription management link

constants/
  Colors.ts                 Brand palette, gradients, input/card/status colors
```

---

## Navigation Architecture

### Route Hierarchy

```
Root Stack (_layout.tsx)
├── index                 Start screen
├── (tabs)                User tab group
│   ├── discover          Main feed
│   ├── search            Explore / search
│   └── post-redirect     → /post
├── (venue)               Venue owner tab group
│   ├── index             Dashboard
│   ├── create            Create post
│   ├── promote           Promotions
│   └── profile           Settings
├── post                  Camera
├── post-preview          Preview before upload
├── story/[id]            Story viewer
├── venue/[id]            Public venue profile
├── venue-login           Phone login
├── venue-onboarding      Venue creation
└── verify-otp            OTP entry
```

### Navigation Rules

- **Within the same navigator**: use `router.push`
- **Across navigator boundaries** (Stack → Tab or Tab → Stack): use `router.navigate` — it's hierarchy-aware and won't corrupt the stack
- **External URLs**: use `Linking.openURL` — never pass `http://` or `https://` to `router.push`

---

## Authentication Flow

```
App boot
  ↓
Check Supabase session (getSession)
  ├─ Active session → verify with getUser → use
  ├─ Stored token → restore session via setSession
  └─ Nothing → signInAnonymously (Supabase) → exchange for Flask token
  ↓
Tokens saved to expo-secure-store
  ↓
User chooses "Promote" → venue-login → verify-otp
  ↓
OTP verified → VENUE_OWNER flag set → access (venue) tabs
  ↓
401 on any request → auto-refresh token → retry once
```

Anonymous users can browse and interact with the feed. Venue owners get the `(venue)` tab after OTP verification.

---

## API Layer (`lib/api.ts`)

All API calls go through `apiFetch(path, options?)`. It:
1. Reads the JWT from SecureStore (cached in memory)
2. Routes the path to the matching Supabase Edge Function
3. Attaches `Authorization: Bearer <token>`
4. On 401 → refreshes token → retries once

### Path → Edge Function Map

| Path prefix | Edge Function |
|---|---|
| `/api/auth` | `auth` |
| `/api/discover` | `discovery` |
| `/api/posts` | `posts` |
| `/api/venues` | `venues` |
| `/api/comments` | `comments` |
| `/api/payments` | `payments` |
| `/api/reports` | `reports` |
| `/api/locations` | `google-maps` |

### Key API Endpoints

```
GET  /api/discover/feed?category=&hashtag=   Main feed
GET  /api/discover/search?q=                 Venue search

POST /api/posts                              Create post
POST /api/posts/:id/like                     Like/unlike
GET  /api/posts/venue/:venueId               All posts for a venue

GET  /api/venues/me                          Current venue (auth)
GET  /api/venues/:id                         Public venue profile
POST /api/venues/:id/view                    Track profile view
PATCH /api/venues/me                         Update venue

GET  /api/comments/post/:id                  Comments on a post
GET  /api/comments/venue/:id                 Comments on a venue
POST /api/comments                           Post a comment

GET  /api/payments/subscription              Subscription status
POST /api/payments/checkout                  Start payment flow

POST /api/analytics/walkin                   Track walk-in / directions tap
```

---

## Discover Feed (`app/(tabs)/discover.tsx`)

The main screen. A full-screen vertical pager built on FlashList.

### Video Preload Strategy (Mux/TikTok pattern)

```
PRELOAD_AHEAD  = 2   (items ahead of active get a source URL, buffer silently)
PRELOAD_BEHIND = 1   (item behind stays buffered for quick back-scroll)
Outside window       source = null  (native player released, memory freed)
```

### Active Index Tracking

FlashList's `onViewableItemsChanged` fires when 60% of an item is visible. It updates `activeIndexRef.current` (a ref, not state — no re-render) and emits `DeviceEventEmitter.emit('feedActiveIndex')`. Each `PostItem` listens to this event and updates its own `visibilityState`.

### Post Types

| Type | Renderer |
|---|---|
| Single video | `VideoItem` (expo-video player) |
| Single image | `<Image>` |
| Multiple media | `SlideshowItem` (horizontal FlatList of VideoItem / Image) |
| Event post | Any of the above + event banner overlay |
| Anonymous user post | Same renderers — posted by a discover user (no account), appears with hashtag/HAPA Global attribution instead of a venue badge |

### Actions Available per Post

- **Like** — optimistic toggle, syncs with server metrics
- **Comment** — opens `LiveWall` modal
- **Share** — React Native `Share` sheet + increments server counter
- **Directions** — `openDirections()` → Apple/Google Maps + logs walk-in
- **Venue badge** — navigates to `/venue/:id`
- **Event CTA** — external URLs open via `Linking.openURL`, internal routes via `router.push`

---

## Upload Flow (`contexts/UploadContext.tsx`)

```
startUpload(postData)
  ↓
Compress media
  Images: expo-image-manipulator (1440px max, 82% quality)
  Videos: react-native-compressor (native codec)
  ↓
Upload each item to Supabase Storage
  Images → base64-arraybuffer (avoids FormData overhead)
  Videos → FormData stream (avoids OOM)
  ↓
POST /api/posts with { media_url, caption, venue_id, hashtag }
  ↓
Emit progress events (0 → 1) consumed by GlobalUploadProgress
  ↓
Navigate to discover + show pending post (optimistic)
  ↓
Auto-reset uploadState after 2s
```

Upload state: `'idle' | 'uploading' | 'success' | 'error'`

---

## Subscription & Monetization

### Tiers

| Tier | Price | Post limit | Key perks |
|---|---|---|---|
| Free | $0/mo | 3/day | Basic feed presence |
| Pro | $25/mo | Unlimited | Top 5 guarantee, verified badge, full analytics |
| Elite | $75/mo | Unlimited | 3 free daily boosts, event spotlight, multi-venue |

### Boost Pricing

Minimum boost duration is **48 hours**, flat price. No 24hr option exists.

| Duration | Standard | Pro | Elite |
|---|---|---|---|
| 48h | $4 | $2.99 | Free |

### Paywall Flow

1. Venue tries to post → `checkLimit()` fails
2. `PaywallModal` shows with `reason` prop for context-specific copy
3. User taps Upgrade → `/subscription` → external payment link
4. On return: `useSubscription.refresh()` re-fetches tier

---

## Location & Proximity

- **Haversine + 1.35× road penalty** for distance estimation
- **Proximity check-in threshold**: 175 metres
- **Walk-in tracking**: fires on `directions_tap` and `checkin` events
- **Venue status**: `isVenueOpen(working_hours)` supports midnight closing and multi-day schedules

---

## Key Colors (`constants/Colors.ts`)

| Token | Value | Usage |
|---|---|---|
| `Colors.cta.primary` | `#BD3115` | Buttons, active tab, badges |
| `Colors.background.gradient` | `['#BD3115', '#6A1F16', '#141414']` | Screen backgrounds |
| `Colors.text.primary` | `#FFFFFF` | Body text |
| `Colors.text.secondary` | `rgba(255,255,255,0.75)` | Subtitles |
| Brand font | Notable_400Regular | HAPA wordmark |

---

## Deep Linking

- **Scheme**: `hapapp://`
- `hapapp://post/:id` → story viewer
- `hapapp://venue/:id` → venue profile
- `hapapp://payment=success` → triggers subscription refresh

---

## Permissions

Android permissions declared in `app.config.js`:
- `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`
- `CAMERA`, `RECORD_AUDIO`
- `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, `READ_MEDIA_VISUAL_USER_SELECTED`

---

## Logging

All logging goes through `lib/logger.ts`:

```ts
logger.debug(context, message, data?)
logger.info(context, message, data?)
logger.warn(context, message, data?)
logger.error(context, message, error?)
logger.critical(context, message, error?)
```

Debug logs are suppressed in production (`__DEV__` guard). Logger is wired for Sentry integration.

---

## Performance Notes

- **FlashList** over FlatList — O(1) renders, no layout recalculations
- **activeIndexRef** (ref not state) — tracks active feed index without triggering re-renders; PostItems subscribe via DeviceEventEmitter
- **Video source = null** outside preload window — releases native media player memory
- **In-memory token cache** in `lib/api.ts` — avoids SecureStore reads on every request
- **Optimistic updates** on likes, comments, shares — UI responds instantly, reverts on error
- **Image transforms via Supabase** — images resized server-side to target display width before delivery
