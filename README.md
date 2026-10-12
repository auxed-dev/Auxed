# AUXED — power to the music lovers

AUXED lets the crowd shape the set. AUXees request songs (or go **On The Mic**) at live club, festival, restaurant and gym sets, upvote and react to each other's requests, chat in the set and in the **Wire Room**, and keep a request ticket for every set they shaped. Artists control how much of their set is open to requests and what a request costs. Venue owners see revenue, crowd and genre analytics across their venues.

It's a mobile-first **installable web app (PWA)**: open it from a QR code at the venue with no install, or add it to the home screen. The same codebase can be wrapped for the App Store / Play Store later (e.g. with Capacitor).

## Stack

- **Next.js 14** (pages router) + TypeScript + Tailwind CSS
- **Postgres** via **Drizzle ORM** (migrations in `./drizzle`). Local development uses an embedded Postgres (PGlite), so there's nothing to install.
- Email + password auth (scrypt, server-side sessions, CSRF header), optional Google / Apple sign-in, email verification and password reset
- **Token wallet** = in-app tokens (1 token = R1) topped up by card through **Paystack** or **Stripe** hosted checkout, with signed webhooks. No crypto.
- Song search across iTunes / Apple Music (local + US store), Deezer, Spotify (with keys) and YouTube Music (with a key, as a fallback) — merged, originals first
- Maps: Leaflet

## Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. On first start the embedded database is created, migrated and filled with sample venues, events, live sets, requests and chat.

Sample accounts (password `Auxed!2026`):

| Role | Email |
| --- | --- |
| AUXee (music lover) | auxee@auxed.app |
| Artist / DJ | artist@auxed.app |
| Owner / management | owner@auxed.app |

In development, wallet top-ups credit instantly (no real payment) and emails (verification, password reset) are printed in the server log.

To try a night out end to end in development: `POST /api/dev/test-night` puts the DJ account **JackBoy** live at **The Carpet Shop** with AUX IN on (member code `CARPET-VIP`). Open `/owner/aux-in` as `owner@auxed.app`, choose **This computer's sound** and play music on that computer; listen in from another browser as an AUXee.

Useful scripts:

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / server |
| `npm run typecheck` | TypeScript check |
| `npm run db:reset` | Delete the local embedded database (stop the dev server first); it re-seeds on next start |
| `npm run db:generate` | Generate a migration after editing `lib/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` (production deploys) |

## Features beyond the core request flow

- **Wire Room** — out and about it's a social feed: DJ and venue **stories** (24h, like Instagram: live sets, request highlights, photos, text), shared sets and PASS THE AUX sessions, shout-outs. When your phone is at a venue with a live set it switches to that venue's live chat.
- **PASS THE AUX** — private listening sessions (home, car, braai). Start one under the **+** menu, friends join with a code / QR / link, everyone adds songs (free), votes and chats. Hosts choose who can join, approve songs or not, and a per-guest limit, and can share the session to the Wire Room.
- **Night-out guardrails** — press-and-hold to request, 30-second undo (full refund), a spending limit per 12 hours, and quick picks tailored to what's playing, what this crowd requests and your favourites.
- **Lock-screen card** — "now playing" with 🔥 / 🙌 / Request: web push on Android and iPhone home-screen apps; iOS Live Activity / Android ongoing notification in the native build (`native/`).
- **Auto-queue** — artists, venues and hosts can send approved requests to their **Spotify** (queued on the active device) or to the **AUXED Player** (`/player/:id`) on the speaker device, which plays through **Spotify** (it becomes a Spotify Connect speaker — Premium, desktop browser), **Apple Music** or **YouTube**. AUXED keeps the vote order, shows who requested each song, and follows what's actually playing.
- **AUX IN** — venues stream exactly what's on their speakers to members' earphones (WebRTC, about half a second behind): the mixer's line-out through a USB audio interface, or **This computer's sound** on the DJ's laptop. Members get in with a **Day Pass**, the monthly **AUX Pass** or the venue's **member code**; listening only works on site. Tap the AUX IN bar for the full player (album art, back / play / forward, **Skip to live**, what's played tonight and the requests up next). Each listener moves through the set's playlist on their own phone without affecting anyone else: songs since they tuned in replay exactly as the DJ played them (their phone records the feed), songs from before play as 30-second previews, and **Live** jumps back. The broadcaster runs at `/owner/aux-in`.
- **The set's playlist** — every song that actually plays (requests and the DJ's own) is logged in order. "Now playing" only changes when something really plays: the DJ plays a request or skips on, or the AUXED Player / connected Spotify moves on. When a set ends its playlist stays on the set page (**Set playlist → Play**).
- **Song previews** — tap a song's cover while choosing a request to hear 30 seconds (AUX IN dips meanwhile).
- **Quick picks that fit the night** — suggestions are ranked by the DJ's genre mix (Creative Controls), the venue's **house sound** (venue settings), what's playing, the queue, the person's favourites, and what's big in those genres on AUXED.
- **Request by link** — paste a song link from Spotify, Apple Music, YouTube / YouTube Music, SoundCloud or Deezer into the request search.
- **Song matching** — every lookup (Spotify, Apple Music, YouTube, previews, duplicates) matches the same recording: ISRC first, then title/artist/length, never a live/remix/cover stand-in. Ported from [SongMirror](https://github.com/ahnafnafee/songmirror) (MIT).
- **Treasure Box** — saved songs and sets, things friends sent you, favourites imported from Spotify / Apple Music, and your On The Mic moments.

Song search uses Deezer's free public API by default (set `DEEZER_SEARCH=off` to disable). Deezer asks businesses to contact it for a partnership before commercial use — arrange that before launch.

Licensing: personal music accounts are for personal use. Venues need business music licences (SAMRO, SAMPRA, CAPASSO) before using auto-queue or AUX IN commercially.

## How pricing works

Artists set their rates in **My Creative Controls**:

- **Song request** = song length (minutes) × the artist's per-minute rate, using one rate for songs up to 5 minutes and another for longer songs. The minimum is 1 token.
- **On The Mic** = the artist's mic price. With "Yes +", a song can ride along (mic price + song).
- Tokens are taken from the wallet when the request is made. If the artist declines it (or the set ends before it plays) the tokens go back to the wallet. A set nobody ends closes itself 3 hours after its slot (with the same refunds), and artists can go live from 2 hours before their start time.
- When a request plays, the earning is split between artist and venue by the venue's **artist share %** (default 50%, set per venue).

## Production

Set these in your host (see `.env.example` for everything):

1. **Database**: `DATABASE_URL` for any Postgres 14+. Run `npm run db:migrate` during deploy, or set `AUXED_AUTO_MIGRATE=true`. Sample data is off in production unless `AUXED_SAMPLE_DATA=true`.
2. **App URL**: `APP_URL=https://your-domain`.
3. **Payments**: `PAYMENT_PROVIDER=paystack` + `PAYSTACK_SECRET_KEY`, or `stripe` + `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`. Point the provider's webhook at `/api/webhooks/paystack` or `/api/webhooks/stripe`. Top-ups are disabled in production until a provider is configured.
4. **Email**: `RESEND_API_KEY` + `MAIL_FROM`.
5. **Optional sign-in**: Google (`GOOGLE_CLIENT_ID/SECRET`) and Apple (`APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`).
6. **Map tiles**: `NEXT_PUBLIC_MAP_TILE_URL` with a dark style from your tile provider. The fallback (darkened OpenStreetMap tiles) is for development only.

Deploys anywhere that runs Node 18+ (Vercel, Render, Fly, a VPS). Uploaded images are stored in Postgres (`media` table). Rate limiting is in-memory per instance; put a shared store (e.g. Redis) behind `lib/server/http.ts#rateLimit` if you run several instances.

## Project layout

```
pages/                 screens (one file per route) and pages/api/* (JSON API)
components/            UI building blocks (nav, cards, sheets, charts, forms)
lib/db/                Drizzle schema, connection, sample-data seed
lib/server/            auth, sessions, payments, mail, music search, guards
lib/server/services/   domain logic: rooms & requests, wallet, discovery, dashboards
lib/client/            browser API client, session context, data hook, image upload
lib/pricing.ts         request pricing (shared by client and server)
drizzle/               SQL migrations
public/art, brand      design assets exported from the AUXED designs
styles/fonts           self-hosted fonts (OFL, see LICENSES.md)
```

Sample photos are royalty-free Unsplash placeholders (one place to swap them: `lib/db/media.ts`). Album art comes from the music search API. In production, venues, artists and AUXees upload their own images.
