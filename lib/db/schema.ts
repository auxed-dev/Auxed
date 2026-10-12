/**
 * Postgres schema (Drizzle ORM). Mirrors the Auxed ERD:
 *   User, Manager/Owner, Performer (Artist/DJ), Establishment (venues), EstPerformers (bookings ->
 *   performances), Performance + PrfmCollection (performances/sets), Request + PrfmItem (requests),
 *   ItmVote (request_votes), WireRoom (posts), Session, Friend.
 * Money is always stored as integer cents (ZAR).
 */
import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { CreativeControls, HomeSettings, NowPlaying, PlaybackTarget, PostAttachmentRef, Track } from '../types';

const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType: () => 'bytea',
  fromDriver: (v) => (Buffer.isBuffer(v) ? v : Buffer.from(v)),
});

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const created = () => ts('created_at').notNull().defaultNow();

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    userName: text('user_name').notNull(),
    userNameKey: text('user_name_key').notNull(),
    email: text('email').notNull(),
    passwordHash: text('password_hash'),
    role: text('role', { enum: ['USER', 'PERFORMER', 'OWNER', 'ADMIN'] }).notNull(),
    avatarUrl: text('avatar_url'),
    ring: text('ring'),
    walletCents: integer('wallet_cents').notNull().default(0),
    emailVerifiedAt: ts('email_verified_at'),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    statusText: text('status_text'),
    shareLocation: boolean('share_location').notNull().default(false),
    locationUpdatedAt: ts('location_updated_at'),
    /** Night-out guardrail: most a person can spend on requests in 12 hours (null = no cap). */
    spendCapCents: integer('spend_cap_cents'),
    createdAt: created(),
  },
  (t) => [uniqueIndex('users_email_idx').on(t.email), uniqueIndex('users_user_name_key_idx').on(t.userNameKey)],
);

export const oauthAccounts = pgTable(
  'oauth_accounts',
  {
    provider: text('provider', { enum: ['google', 'apple'] }).notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable(
  'sessions',
  {
    /** sha256 of the session token; the raw token only ever lives in the cookie. */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: ts('expires_at').notNull(),
    userAgent: text('user_agent'),
    ip: text('ip'),
    createdAt: created(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const authTokens = pgTable('auth_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['VERIFY_EMAIL', 'RESET_PASSWORD'] }).notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
  createdAt: created(),
});

export const friendships = pgTable(
  'friendships',
  {
    requesterId: text('requester_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    addresseeId: text('addressee_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['PENDING', 'ACCEPTED'] }).notNull(),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.requesterId, t.addresseeId] }), index('friendships_addressee_idx').on(t.addresseeId)],
);

export const follows = pgTable(
  'follows',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetType: text('target_type', { enum: ['VENUE', 'PERFORMER', 'EVENT'] }).notNull(),
    targetId: text('target_id').notNull(),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.targetType, t.targetId] })],
);

export const performers = pgTable('performers', {
  id: text('id').primaryKey(),
  /** Null for venue-managed residents that don't have their own login yet. */
  userId: text('user_id')
    .unique()
    .references(() => users.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  type: text('type', { enum: ['DJ', 'ARTIST'] }).notNull(),
  genres: jsonb('genres').$type<string[]>().notNull().default([]),
  imageUrl: text('image_url'),
  bio: text('bio'),
  controls: jsonb('controls').$type<CreativeControls>().notNull(),
  createdAt: created(),
});

export const venues = pgTable(
  'venues',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').references(() => users.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    kind: text('kind', { enum: ['CLUB', 'RESTAURANT', 'GYM', 'LOUNGE', 'FESTIVAL'] }).notNull(),
    city: text('city').notNull(),
    address: text('address').notNull().default(''),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    imageUrl: text('image_url'),
    logoStyle: text('logo_style', { enum: ['wide', 'serif', 'cond'] }).notNull().default('wide'),
    description: text('description').notNull().default(''),
    chatLabel: text('chat_label').notNull().default('CLUB CHAT'),
    managementLabel: text('management_label').notNull().default('Management Team'),
    capacity: integer('capacity').notNull().default(0),
    liveCapacity: integer('live_capacity').notNull().default(0),
    avgWeek: integer('avg_week').notNull().default(0),
    avgMonth: integer('avg_month').notNull().default(0),
    waitMinutes: integer('wait_minutes'),
    /** Number the SOS button calls (venue security). Falls back to national emergency services. */
    safetyPhone: text('safety_phone'),
    /** Share of each approved request paid to the performer; the venue keeps the rest. */
    /** AUX IN: stream the venue's speaker feed to members' earphones. */
    auxInEnabled: boolean('aux_in_enabled').notNull().default(false),
    auxInDayPassCents: integer('aux_in_day_pass_cents').notNull().default(3000),
    /** Members listen free with this code (null = no member perk). */
    auxInMemberCode: text('aux_in_member_code'),
    artistSharePct: integer('artist_share_pct').notNull().default(50),
    /** House sound: genres the venue wants played (shapes request suggestions). */
    musicGenres: jsonb('music_genres').$type<string[]>().notNull().default([]),
    createdAt: created(),
  },
  (t) => [index('venues_owner_idx').on(t.ownerId)],
);

export const events = pgTable(
  'events',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').references(() => users.id, { onDelete: 'set null' }),
    venueId: text('venue_id').references(() => venues.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    category: text('category', { enum: ['FESTIE', 'CLUB'] }).notNull(),
    location: text('location').notNull(),
    subtitle: text('subtitle').notNull().default(''),
    imageUrl: text('image_url'),
    heroColor: text('hero_color').notNull().default('#0B1A6B'),
    description: text('description').notNull().default(''),
    startsAt: ts('starts_at').notNull(),
    endsAt: ts('ends_at').notNull(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    createdAt: created(),
  },
  (t) => [index('events_starts_idx').on(t.startsAt)],
);

export const stages = pgTable('stages', {
  id: text('id').primaryKey(),
  eventId: text('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  imageUrl: text('image_url'),
  genre: text('genre'),
  sort: integer('sort').notNull().default(0),
});

export const performances = pgTable(
  'performances',
  {
    id: text('id').primaryKey(),
    /** SET = an artist's set at a venue. HOME = a PASS THE AUX session (no artist or venue). */
    kind: text('kind', { enum: ['SET', 'HOME'] }).notNull().default('SET'),
    performerId: text('performer_id').references(() => performers.id, { onDelete: 'cascade' }),
    venueId: text('venue_id').references(() => venues.id, { onDelete: 'cascade' }),
    /** PASS THE AUX host. */
    hostUserId: text('host_user_id').references(() => users.id, { onDelete: 'cascade' }),
    visibility: text('visibility', { enum: ['PUBLIC', 'FRIENDS', 'PRIVATE'] }).notNull().default('PUBLIC'),
    joinCode: text('join_code'),
    homeSettings: jsonb('home_settings').$type<HomeSettings | null>(),
    /** Auto-queue: where approved requests are sent (Spotify account, or an AUXED Player screen). */
    playback: jsonb('playback').$type<PlaybackTarget | null>(),
    eventId: text('event_id').references(() => events.id, { onDelete: 'set null' }),
    stageId: text('stage_id').references(() => stages.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    startsAt: ts('starts_at').notNull(),
    endsAt: ts('ends_at').notNull(),
    /** A set is LIVE once the artist goes live and until they end it. */
    wentLiveAt: ts('went_live_at'),
    endedAt: ts('ended_at'),
    basis: text('basis', { enum: ['Recurring', 'Once off'] }).notNull().default('Once off'),
    crowdEstimate: integer('crowd_estimate').notNull().default(0),
    imageUrl: text('image_url'),
    caption: text('caption'),
    setlist: jsonb('setlist').$type<Track[]>().notNull().default([]),
    setCursor: integer('set_cursor').notNull().default(0),
    nowPlaying: jsonb('now_playing').$type<NowPlaying | null>(),
    reposts: integer('reposts').notNull().default(0),
    likesBase: integer('likes_base').notNull().default(0),
    createdById: text('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: created(),
  },
  (t) => [
    index('performances_performer_idx').on(t.performerId),
    index('performances_venue_idx').on(t.venueId),
    index('performances_event_idx').on(t.eventId),
    index('performances_host_idx').on(t.hostUserId),
    uniqueIndex('performances_join_code_idx').on(t.joinCode),
  ],
);

/** People in a PASS THE AUX session. */
export const sessionMembers = pgTable(
  'session_members',
  {
    performanceId: text('performance_id')
      .notNull()
      .references(() => performances.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['HOST', 'GUEST'] }).notNull().default('GUEST'),
    joinedAt: created(),
  },
  (t) => [primaryKey({ columns: [t.performanceId, t.userId] }), index('session_members_user_idx').on(t.userId)],
);

export const performanceLikes = pgTable(
  'performance_likes',
  {
    performanceId: text('performance_id')
      .notNull()
      .references(() => performances.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.performanceId, t.userId] })],
);

export const requests = pgTable(
  'requests',
  {
    id: text('id').primaryKey(),
    performanceId: text('performance_id')
      .notNull()
      .references(() => performances.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['SONG', 'MIC'] }).notNull(),
    track: jsonb('track').$type<Track | null>(),
    message: text('message'),
    priceCents: integer('price_cents').notNull(),
    status: text('status', { enum: ['PENDING', 'QUEUED', 'PLAYING', 'PLAYED', 'REJECTED'] }).notNull(),
    createdAt: created(),
    decidedAt: ts('decided_at'),
    playedAt: ts('played_at'),
    /** Counts carried over from imported history; live votes/reactions are rows in the tables below. */
    baseUp: integer('base_up').notNull().default(0),
    baseDown: integer('base_down').notNull().default(0),
    reactionBase: jsonb('reaction_base').$type<Record<string, number>>().notNull().default({}),
    /** When the song was handed to the connected music service / player. */
    externalQueuedAt: ts('external_queued_at'),
    externalRef: text('external_ref'),
  },
  (t) => [
    index('requests_performance_idx').on(t.performanceId),
    index('requests_user_idx').on(t.userId),
    index('requests_created_idx').on(t.createdAt),
  ],
);

export const requestVotes = pgTable(
  'request_votes',
  {
    requestId: text('request_id')
      .notNull()
      .references(() => requests.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    value: smallint('value').notNull(),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.requestId, t.userId] })],
);

export const requestReactions = pgTable(
  'request_reactions',
  {
    requestId: text('request_id')
      .notNull()
      .references(() => requests.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.requestId, t.userId, t.emoji] })],
);

export const posts = pgTable(
  'posts',
  {
    id: text('id').primaryKey(),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['CHAT', 'MIC', 'SNIPPET', 'MANAGEMENT', 'SYSTEM'] }).notNull(),
    /** Section chat of a performance; null = the global Wire Room. */
    performanceId: text('performance_id').references(() => performances.id, { onDelete: 'cascade' }),
    text: text('text').notNull().default(''),
    caption: text('caption'),
    imageUrl: text('image_url'),
    nowPlaying: text('now_playing'),
    toUserId: text('to_user_id').references(() => users.id, { onDelete: 'set null' }),
    label: text('label'),
    /** A shared set, request highlight or PASS THE AUX session shown as a card. */
    attachment: jsonb('attachment').$type<PostAttachmentRef | null>(),
    likesBase: integer('likes_base').notNull().default(0),
    createdAt: created(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [index('posts_performance_idx').on(t.performanceId), index('posts_created_idx').on(t.createdAt)],
);

/** 24-hour stories from DJs and venues, shown as circles at the top of the Wire Room. */
export const stories = pgTable(
  'stories',
  {
    id: text('id').primaryKey(),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Shown as the DJ / venue the story belongs to. */
    performerId: text('performer_id').references(() => performers.id, { onDelete: 'cascade' }),
    venueId: text('venue_id').references(() => venues.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['SET', 'REQUEST', 'PHOTO', 'TEXT'] }).notNull(),
    performanceId: text('performance_id').references(() => performances.id, { onDelete: 'cascade' }),
    requestId: text('request_id').references(() => requests.id, { onDelete: 'cascade' }),
    imageUrl: text('image_url'),
    text: text('text'),
    createdAt: created(),
    expiresAt: ts('expires_at').notNull(),
  },
  (t) => [index('stories_expires_idx').on(t.expiresAt), index('stories_author_idx').on(t.authorId)],
);

export const storyViews = pgTable(
  'story_views',
  {
    storyId: text('story_id')
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    viewedAt: created(),
  },
  (t) => [primaryKey({ columns: [t.storyId, t.userId] })],
);

export const postLikes = pgTable(
  'post_likes',
  {
    postId: text('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
);

export const payments = pgTable(
  'payments',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerRef: text('provider_ref'),
    amountCents: integer('amount_cents').notNull(),
    status: text('status', { enum: ['PENDING', 'PAID', 'FAILED'] }).notNull(),
    createdAt: created(),
    completedAt: ts('completed_at'),
  },
  (t) => [index('payments_user_idx').on(t.userId), index('payments_ref_idx').on(t.providerRef)],
);

export const ledger = pgTable(
  'ledger',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['TOPUP', 'REQUEST', 'REFUND', 'ADJUSTMENT', 'PASS'] }).notNull(),
    amountCents: integer('amount_cents').notNull(),
    note: text('note').notNull(),
    requestId: text('request_id'),
    paymentId: text('payment_id'),
    createdAt: created(),
  },
  (t) => [index('ledger_user_idx').on(t.userId)],
);

/** Revenue split per approved request. */
export const earnings = pgTable(
  'earnings',
  {
    id: text('id').primaryKey(),
    requestId: text('request_id')
      .notNull()
      .references(() => requests.id, { onDelete: 'cascade' }),
    beneficiaryType: text('beneficiary_type', { enum: ['PERFORMER', 'VENUE'] }).notNull(),
    beneficiaryId: text('beneficiary_id').notNull(),
    amountCents: integer('amount_cents').notNull(),
    createdAt: created(),
  },
  (t) => [index('earnings_beneficiary_idx').on(t.beneficiaryType, t.beneficiaryId)],
);

/** Uploaded images (avatars, snippets, posters). Small, client-compressed JPEG/WebP. */
/**
 * Treasure Box favourites: songs and sets you saved, things friends shared with you, and favourites
 * imported from a connected music app.
 */
export const favorites = pgTable(
  'favorites',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['TRACK', 'SET'] }).notNull(),
    track: jsonb('track').$type<Track | null>(),
    performanceId: text('performance_id').references(() => performances.id, { onDelete: 'cascade' }),
    /** AUXED = saved in the app, FRIEND = shared by a friend, SPOTIFY / APPLE_MUSIC = imported. */
    source: text('source', { enum: ['AUXED', 'FRIEND', 'SPOTIFY', 'APPLE_MUSIC'] }).notNull().default('AUXED'),
    fromUserId: text('from_user_id').references(() => users.id, { onDelete: 'set null' }),
    note: text('note'),
    createdAt: created(),
  },
  (t) => [index('favorites_user_idx').on(t.userId)],
);

/** A person's linked music service (tokens are encrypted at rest). */
export const musicConnections = pgTable(
  'music_connections',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider', { enum: ['SPOTIFY', 'APPLE_MUSIC'] }).notNull(),
    externalId: text('external_id'),
    displayName: text('display_name'),
    accessTokenEnc: text('access_token_enc'),
    refreshTokenEnc: text('refresh_token_enc'),
    expiresAt: ts('expires_at'),
    scope: text('scope'),
    lastImportAt: ts('last_import_at'),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.provider] })],
);

/** Cache: our track -> Spotify URI / YouTube video id, so searches aren't repeated. */
export const trackLinks = pgTable('track_links', {
  key: text('key').primaryKey(),
  spotifyUri: text('spotify_uri'),
  youtubeId: text('youtube_id'),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

/** Web push subscriptions (lock-screen "now playing" cards and request alerts). */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    endpoint: text('endpoint').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    /** The set this phone shows a live "now playing" card for. */
    livePerformanceId: text('live_performance_id').references(() => performances.id, { onDelete: 'set null' }),
    createdAt: created(),
  },
  (t) => [index('push_user_idx').on(t.userId), index('push_live_idx').on(t.livePerformanceId)],
);

/** Native app push tokens (iOS Live Activity push-to-start / update tokens, APNs and FCM device tokens). */
export const nativePushTokens = pgTable(
  'native_push_tokens',
  {
    token: text('token').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['IOS_LIVE_ACTIVITY_START', 'IOS_LIVE_ACTIVITY', 'IOS', 'ANDROID'] }).notNull(),
    performanceId: text('performance_id').references(() => performances.id, { onDelete: 'cascade' }),
    createdAt: created(),
  },
  (t) => [index('native_push_user_idx').on(t.userId), index('native_push_perf_idx').on(t.performanceId)],
);

/** "I'm here": scanning a venue's door QR (or being on site) checks you in for a few hours. */
export const venueCheckins = pgTable(
  'venue_checkins',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    venueId: text('venue_id')
      .notNull()
      .references(() => venues.id, { onDelete: 'cascade' }),
    at: ts('at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.venueId] })],
);

/** AUX IN: a venue's live speaker feed. */
export const auxStreams = pgTable(
  'aux_streams',
  {
    id: text('id').primaryKey(),
    venueId: text('venue_id')
      .notNull()
      .references(() => venues.id, { onDelete: 'cascade' }),
    zone: text('zone').notNull().default('Main floor'),
    startedById: text('started_by_id').references(() => users.id, { onDelete: 'set null' }),
    status: text('status', { enum: ['LIVE', 'ENDED'] }).notNull().default('LIVE'),
    startedAt: created(),
    heartbeatAt: ts('heartbeat_at').notNull().defaultNow(),
    endedAt: ts('ended_at'),
  },
  (t) => [index('aux_streams_venue_idx').on(t.venueId)],
);

/** WebRTC signalling between a listener and the venue broadcaster. */
export const auxPeers = pgTable(
  'aux_peers',
  {
    id: text('id').primaryKey(),
    streamId: text('stream_id')
      .notNull()
      .references(() => auxStreams.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    offer: text('offer').notNull(),
    answer: text('answer'),
    status: text('status', { enum: ['WAITING', 'CONNECTED', 'CLOSED'] }).notNull().default('WAITING'),
    createdAt: created(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index('aux_peers_stream_idx').on(t.streamId)],
);

/** AUX IN access: a day pass, a monthly pass (all venues) or a member perk. */
export const auxPasses = pgTable(
  'aux_passes',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    venueId: text('venue_id').references(() => venues.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['DAY', 'MONTH', 'MEMBER'] }).notNull(),
    priceCents: integer('price_cents').notNull().default(0),
    validUntil: ts('valid_until').notNull(),
    createdAt: created(),
  },
  (t) => [index('aux_passes_user_idx').on(t.userId), index('aux_passes_venue_idx').on(t.venueId)],
);

export const media = pgTable('media', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').references(() => users.id, { onDelete: 'set null' }),
  mime: text('mime').notNull(),
  data: bytea('data').notNull(),
  bytes: integer('bytes').notNull(),
  createdAt: created(),
});
