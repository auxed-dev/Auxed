# AUXED — power to the music lovers

AUXED lets the crowd shape the set. AUXees request songs (or go **On The Mic**) at live club, festival, restaurant and gym sets, upvote and react to each other's requests, chat in the set and in the **Wire Room**, and keep a request ticket for every set they shaped. Artists control how much of their set is open to requests and what a request costs. Venue owners see revenue, crowd and genre analytics across their venues.

It's a mobile-first **installable web app (PWA)**: open it from a QR code at the venue with no install, or add it to the home screen. The same codebase can be wrapped for the App Store / Play Store later (e.g. with Capacitor).

## Stack

- **Next.js 14** (pages router) + TypeScript + Tailwind CSS
- **Postgres** via **Drizzle ORM** (migrations in `./drizzle`). Local development uses an embedded Postgres (PGlite), so there's nothing to install.
- Email + password auth (scrypt, server-side sessions, CSRF header), optional Google / Apple sign-in, email verification and password reset
- **Token wallet** = in-app tokens (1 token = R1) topped up by card through **Paystack** or **Stripe** hosted checkout, with signed webhooks. No crypto.
- Song search: iTunes Search API (no key) or Spotify
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
- **Auto-queue** — artists, venues and hosts can send approved requests to their **Spotify** (queued on the active device) or to the **AUXED Player** (`/player/:id`) playing through **Apple Music** or **YouTube** on the speaker device. AUXED keeps the vote order and follows what's actually playing.
- **AUX IN** — venues stream their speaker feed to members' earphones (WebRTC). Members get in with a **Day Pass**, the monthly **AUX Pass** or the venue's **member code**; listening only works on site. The broadcaster runs at `/owner/aux-in`.
- **Treasure Box** — saved songs and sets, things friends sent you, favourites imported from Spotify / Apple Music, and your On The Mic moments.

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
