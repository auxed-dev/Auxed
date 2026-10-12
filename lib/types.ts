/**
 * Shared types: value objects stored in JSON columns plus the DTOs returned by the API.
 * Storage lives in lib/db/schema.ts.
 */

/** USER = "AUXee" (music lover), PERFORMER = artist/DJ, OWNER = venue owner / management. */
export type Role = 'USER' | 'PERFORMER' | 'OWNER' | 'ADMIN';

export type ThemeName = 'blue' | 'green' | 'purple' | 'olive';

export type MicMode = 'NO' | 'YES' | 'YES_PLUS';
export type LeadTime = 'LIVE' | '24' | '48' | '36';

export interface GenreWeight {
  name: string;
  weight: number; // 0..100
}

/** "My Creative Controls": how much of the set the crowd can shape, and what it costs. */
export interface CreativeControls {
  requestIntake: number;
  genres: GenreWeight[];
  maxSongLength: number; // minutes
  ratePerMinShort: number; // R per minute for songs up to 5 minutes
  ratePerMinLong: number; // R per minute for songs longer than 5 minutes
  micPrice: number; // R
  mic: MicMode;
  micFilters: string[];
  leadTime: LeadTime;
  integrations: string[];
}

export interface Track {
  title: string;
  artist: string;
  album?: string;
  artwork?: string;
  durationSec: number;
  genre?: string;
  previewUrl?: string;
  source: 'itunes' | 'spotify' | 'deezer' | 'youtube' | 'catalog';
  externalId?: string;
  /** International Standard Recording Code: the same recording on every service. */
  isrc?: string;
}

export interface NowPlaying {
  track: Track;
  startedAt: string;
  requestId?: string;
}

/** PASS THE AUX: a private listening session (e.g. at home) friends join to build the queue together. */
export type SessionVisibility = 'PUBLIC' | 'FRIENDS' | 'PRIVATE';
export interface HomeSettings {
  /** AUTO = guests' songs go straight into the queue; HOST = the host approves each one. */
  approval: 'AUTO' | 'HOST';
  /** Songs a guest can have waiting in the queue at once. */
  perGuestLimit: number;
  /** What the host is playing from (shown to guests), e.g. "Spotify on the JBL". */
  source: string | null;
}

/** A Wire Room post can carry a shared set, request highlight or PASS THE AUX session. */
export interface PostAttachmentRef {
  type: 'set' | 'request' | 'session';
  performanceId: string;
  requestId?: string;
}

export type StoryKind = 'SET' | 'REQUEST' | 'PHOTO' | 'TEXT';

/** Where a set's approved requests are auto-queued. */
export interface PlaybackTarget {
  /** SPOTIFY = the owner's Spotify account (queues on their active device, or the AUXED Player
   *  becomes the Spotify speaker); APPLE_MUSIC / YOUTUBE = an AUXED Player screen on the speaker device. */
  provider: 'SPOTIFY' | 'APPLE_MUSIC' | 'YOUTUBE';
  ownerUserId: string;
  /** AUXED Player heartbeat. */
  playerSeenAt?: string | null;
  /** SPOTIFY: the AUXED Player's own Spotify Connect device, when the player is the speaker. */
  deviceId?: string | null;
  lastError?: string | null;
}

export interface Suggestion {
  track: Track;
  reason: string;
  /** Already waiting in the queue: offer an upvote instead. */
  requestId?: string;
  priceCents: number;
}

export type VenueKind = 'CLUB' | 'RESTAURANT' | 'GYM' | 'LOUNGE' | 'FESTIVAL';
export type PerformanceStatus = 'UPCOMING' | 'LIVE' | 'ENDED';
export type RequestStatus = 'PENDING' | 'QUEUED' | 'PLAYING' | 'PLAYED' | 'REJECTED';
export type PostKind = 'CHAT' | 'MIC' | 'SNIPPET' | 'MANAGEMENT' | 'SYSTEM';

/* ----------------------------------------------------------------- DTOs */

export interface SessionUser {
  id: string;
  userName: string;
  email: string;
  role: Role;
  avatarUrl: string | null;
  ring: string | null;
  walletCents: number;
  emailVerified: boolean;
  performerId: string | null;
  shareLocation: boolean;
  spendCapCents: number | null;
}

export interface UserBrief {
  id: string;
  userName: string;
  avatarUrl: string | null;
  ring: string | null;
  role: Role;
}

export interface VenueDTO {
  id: string;
  ownerId: string | null;
  name: string;
  kind: VenueKind;
  city: string;
  address: string;
  lat: number;
  lng: number;
  imageUrl: string | null;
  logoStyle: 'wide' | 'serif' | 'cond';
  description: string;
  chatLabel: string;
  managementLabel: string;
  capacity: number;
  liveCapacity: number;
  avgWeek: number;
  avgMonth: number;
  waitMinutes: number | null;
  artistSharePct: number;
  safetyPhone: string | null;
  /** House sound: genres the venue wants played. */
  musicGenres: string[];
}

export interface PerformerDTO {
  id: string;
  userId: string | null;
  name: string;
  type: 'DJ' | 'ARTIST';
  genres: string[];
  imageUrl: string | null;
  bio: string | null;
}

/** What AUXees can see of an artist's controls before requesting. */
export interface PublicControls {
  requestIntake: number;
  maxSongLength: number;
  ratePerMinShort: number;
  ratePerMinLong: number;
  mic: MicMode;
  micPrice: number;
  leadTime: LeadTime;
  genres: GenreWeight[];
}

export interface PerformanceBrief {
  id: string;
  /** SET = an artist's set at a venue; HOME = a PASS THE AUX session. */
  kind: 'SET' | 'HOME';
  title: string;
  status: PerformanceStatus;
  startsAt: string;
  endsAt: string;
  basis: 'Recurring' | 'Once off';
  crowdEstimate: number;
  imageUrl: string | null;
  caption: string | null;
  eventId: string | null;
  stageId: string | null;
  performer: Pick<PerformerDTO, 'id' | 'name' | 'imageUrl' | 'type' | 'userId'>;
  venue: Pick<VenueDTO, 'id' | 'name' | 'city' | 'imageUrl' | 'logoStyle' | 'kind'>;
  nowPlaying: NowPlaying | null;
  likes: number;
  liked: boolean;
  reposts: number;
  requestCount: number;
}

export interface ReactionCount {
  emoji: string;
  count: number;
  mine: boolean;
}

export interface RequestDTO {
  id: string;
  performanceId: string;
  kind: 'SONG' | 'MIC';
  track: Track | null;
  message: string | null;
  priceCents: number;
  status: RequestStatus;
  createdAt: string;
  decidedAt: string | null;
  playedAt: string | null;
  user: UserBrief;
  up: number;
  down: number;
  myVote: 1 | -1 | 0;
  reactions: ReactionCount[];
}

export interface PostDTO {
  id: string;
  kind: PostKind;
  performanceId: string | null;
  text: string;
  caption: string | null;
  imageUrl: string | null;
  nowPlaying: string | null;
  label: string | null;
  createdAt: string;
  author: UserBrief;
  to: UserBrief | null;
  likes: number;
  liked: boolean;
  attachment: PostAttachment | null;
}

export interface PostAttachment {
  type: 'set' | 'request' | 'session';
  performanceId: string;
  title: string;
  subtitle: string;
  imageUrl: string | null;
  status: PerformanceStatus;
  /** Whether the viewer can open/join it (private sessions need an invite). */
  canJoin: boolean;
  memberCount?: number;
  track?: Track | null;
  up?: number;
}

export interface CanRequest {
  ok: boolean;
  reason?: string;
}

export interface RoomDTO {
  performance: PerformanceBrief;
  venue: VenueDTO;
  controls: PublicControls;
  queue: RequestDTO[];
  posts: PostDTO[];
  openSlots: number;
  canRequest: CanRequest;
  isPerformer: boolean;
  isOwner: boolean;
  /** Present for PASS THE AUX sessions. */
  session: HomeSessionDTO | null;
  /** Auto-queue status (only shown to the artist, venue or host). */
  playback: PlaybackTarget | null;
}

export interface HomeSessionDTO {
  host: UserBrief;
  visibility: SessionVisibility;
  settings: HomeSettings;
  /** Only shown to people in the session. */
  joinCode: string | null;
  members: UserBrief[];
  memberCount: number;
  isHost: boolean;
  isMember: boolean;
}

export interface SessionSummary {
  id: string;
  title: string;
  status: PerformanceStatus;
  host: UserBrief;
  visibility: SessionVisibility;
  memberCount: number;
  queued: number;
  nowPlaying: NowPlaying | null;
  isHost: boolean;
  startsAt: string;
}

export interface StoryDTO {
  id: string;
  kind: StoryKind;
  createdAt: string;
  expiresAt: string;
  text: string | null;
  imageUrl: string | null;
  /** Shared set (SET / REQUEST stories). */
  set: { id: string; title: string; status: PerformanceStatus; venueName: string; performerName: string; imageUrl: string | null; nowPlaying: NowPlaying | null } | null;
  /** Shared request highlight. */
  request: { id: string; title: string; artist: string; artwork: string | null; up: number; requestedBy: string; kind: 'SONG' | 'MIC'; message: string | null } | null;
  viewed: boolean;
  /** Only for the author. */
  views?: number;
  mine: boolean;
}

export interface StoryGroupDTO {
  key: string;
  name: string;
  imageUrl: string | null;
  ring: string | null;
  kind: 'performer' | 'venue' | 'user';
  seen: boolean;
  mine: boolean;
  latestAt: string;
  stories: StoryDTO[];
}

export interface StageDTO {
  id: string;
  name: string;
  imageUrl: string | null;
  genre: string | null;
  performance: PerformanceBrief | null;
}

export interface EventDTO {
  id: string;
  ownerId: string | null;
  title: string;
  category: 'FESTIE' | 'CLUB';
  venueId: string | null;
  location: string;
  subtitle: string;
  imageUrl: string | null;
  heroColor: string;
  description: string;
  startsAt: string;
  endsAt: string;
  lat: number;
  lng: number;
  live: boolean;
  stages: StageDTO[];
}

export interface TicketDTO {
  performanceId: string;
  performerName: string;
  venueName: string;
  imageUrl: string | null;
  from: string;
  to: string;
  songs: string[];
  requests: number;
  upvotes: number;
  status: 'LIVE' | 'PLAYED' | 'UPCOMING';
}

export interface LedgerDTO {
  id: string;
  type: 'TOPUP' | 'REQUEST' | 'REFUND' | 'ADJUSTMENT' | 'PASS';
  amountCents: number;
  note: string;
  createdAt: string;
}

export interface FriendDTO extends UserBrief {
  status: 'ACCEPTED' | 'INCOMING' | 'OUTGOING';
  lat: number | null;
  lng: number | null;
  statusText: string | null;
}
