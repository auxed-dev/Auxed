/**
 * Sample content for local development (never runs in production unless AUXED_SAMPLE_DATA=true).
 * Recreates the venues, events, live sets and Wire Room chatter from the Auxed designs, plus
 * ~9 months of request history so the artist and owner dashboards have real numbers to compute.
 */
import { count } from 'drizzle-orm';
import type { DB } from './index';
import * as s from './schema';
import { T } from './catalog';
import { IMG } from './media';
import { hashPassword, newId } from '../server/crypto';
import { seeded } from '../util';
import type { CreativeControls, Track } from '../types';

export const SAMPLE_PASSWORD = 'Auxed!2026';
export const SAMPLE_ACCOUNTS = [
  { email: 'auxee@auxed.app', role: 'USER', label: 'AUXee' },
  { email: 'artist@auxed.app', role: 'PERFORMER', label: 'Artist' },
  { email: 'owner@auxed.app', role: 'OWNER', label: 'Owner' },
] as const;

const H = 3600_000;
const D = 24 * H;

function controls(over: Partial<CreativeControls> = {}): CreativeControls {
  return {
    requestIntake: 10,
    genres: [
      { name: 'Amapiano', weight: 50 },
      { name: 'House', weight: 75 },
      { name: 'UK Rap', weight: 30 },
    ],
    maxSongLength: 7,
    ratePerMinShort: 3,
    ratePerMinLong: 2.5,
    micPrice: 15,
    mic: 'YES',
    micFilters: [],
    leadTime: 'LIVE',
    integrations: ['apple-music', 'spotify'],
    ...over,
  };
}

async function insertChunks<Tbl extends Parameters<DB['insert']>[0]>(db: DB, table: Tbl, rows: any[]) {
  for (let i = 0; i < rows.length; i += 400) {
    await db.insert(table).values(rows.slice(i, i + 400));
  }
}

export async function seedIfEmpty(db: DB) {
  const [{ n }] = await db.select({ n: count() }).from(s.users);
  if (Number(n) > 0) return;
  console.log('[seed] Loading Auxed sample content...');
  await seed(db);
  console.log('[seed] Done.');
}

export async function seed(db: DB) {
  const now = Date.now();
  const at = (ms: number) => new Date(now + ms);
  const rnd = seeded(2026);
  const pick = <V,>(arr: V[]) => arr[Math.floor(rnd() * arr.length)];
  const pw = await hashPassword(SAMPLE_PASSWORD);
  const verified = new Date(now - 30 * D);

  /* ------------------------------------------------------------------ users */
  const user = (id: string, userName: string, role: 'USER' | 'PERFORMER' | 'OWNER', extra: Partial<typeof s.users.$inferInsert> = {}) => ({
    id,
    userName,
    userNameKey: userName.toLowerCase(),
    email: `${userName.toLowerCase().replace(/[^a-z0-9]/g, '')}@sample.auxed.app`,
    passwordHash: null as string | null,
    role,
    emailVerifiedAt: verified,
    createdAt: new Date(now - 200 * D),
    ...extra,
  });
  const people = [
    user('u_auxee', 'MrAuxed', 'USER', { email: 'auxee@auxed.app', passwordHash: pw, ring: '#FFFFFF', avatarUrl: IMG.djCrowd, lat: -26.2405, lng: 27.9705, shareLocation: true }),
    user('u_artist', 'DJAUX26', 'PERFORMER', { email: 'artist@auxed.app', passwordHash: pw, ring: '#6B4A3A', avatarUrl: IMG.djHeadphones }),
    user('u_owner', 'Management Team', 'OWNER', { email: 'owner@auxed.app', passwordHash: pw, ring: '#E5006E', avatarUrl: IMG.drama }),
    user('u_wire', 'Wire Room', 'USER', { email: 'wire-room@sample.auxed.app', ring: '#111111', avatarUrl: '/brand/auxed-a-256.png' }),
    user('u_chord', 'ChordMaster23', 'USER', { ring: '#3B6CFF' }),
    user('u_dorthy', 'DumbellDorthy43', 'USER', { ring: '#FF8A00' }),
    user('u_tempo', 'TempoThemba99', 'USER', { ring: '#FF1A1A', avatarUrl: IMG.djLights }),
    user('u_jackie', 'JackieBrown43', 'USER', { ring: '#4B3A2F', avatarUrl: IMG.djNight, lat: -26.2372, lng: 27.9781, shareLocation: true }),
    user('u_dave', 'DaveRecords47', 'USER', { ring: '#FFFFFF', avatarUrl: IMG.djMixer, lat: -26.2229, lng: 27.9595, shareLocation: true, statusText: 'On route to you' }),
    user('u_vicky', 'VickyChord21', 'USER', { ring: '#2C6FB7', avatarUrl: IMG.djPink, lat: -26.2385, lng: 27.9793, shareLocation: true }),
    user('u_rodny', 'RodnyVinyl', 'USER', { ring: '#8A5CFF' }),
    user('u_jazzy', 'JazzyRemy', 'USER'),
    user('u_classy', 'Classy3322', 'USER'),
    user('u_major', 'MajourLeagueDJs', 'USER'),
  ];
  const crowdNames = [
    'Lerato_Vibes', 'Sipho808', 'NaledisNights', 'KaraboKeys', 'ThaboBeats', 'ZaneleSoul', 'BonganiBass', 'MpumiMoves', 'AyandaAux', 'RefiloeRave',
    'KagisoKicks', 'LindiweLoops', 'TumiTempo', 'NomsaNotes', 'JabuJams', 'PalesaPlays', 'XolaniX', 'DinekoDrops', 'AmaraAfro', 'KeneilweK',
    'TheoTracks', 'MilaMix', 'JordanJukes', 'ChloeChords', 'EthanEcho', 'AvaAmp', 'LiamLive', 'ZaraZone', 'NoahNights', 'IslaIntro',
  ];
  const crowd = crowdNames.map((nm, i) => user(`u_c${i}`, nm, 'USER'));
  await insertChunks(db, s.users, [...people, ...crowd]);
  const crowdIds = crowd.map((c) => c.id);

  await db.insert(s.friendships).values([
    { requesterId: 'u_auxee', addresseeId: 'u_dave', status: 'ACCEPTED' },
    { requesterId: 'u_auxee', addresseeId: 'u_jackie', status: 'ACCEPTED' },
    { requesterId: 'u_vicky', addresseeId: 'u_auxee', status: 'ACCEPTED' },
    { requesterId: 'u_tempo', addresseeId: 'u_auxee', status: 'PENDING' },
  ]);

  /* ------------------------------------------------------------- performers */
  const performer = (id: string, name: string, genres: string[], image: string, extra: Partial<typeof s.performers.$inferInsert> = {}) => ({
    id,
    name,
    type: 'DJ' as const,
    genres,
    imageUrl: image,
    controls: controls(),
    ...extra,
  });
  await db.insert(s.performers).values([
    performer('p_djaux', 'DJAUX26', ['Amapiano', 'Hip-Hop', 'UK Rap'], IMG.djHeadphones, {
      userId: 'u_artist',
      bio: 'Amapiano, hip-hop and UK rap selector. Request the vibe.',
      controls: controls({
        genres: [
          { name: 'Amapiano', weight: 50 },
          { name: 'House', weight: 75 },
          { name: 'UK Rap', weight: 30 },
        ],
        mic: 'YES',
        micFilters: ['hate', 'idiot'],
        integrations: ['apple-music', 'spotify', 'soundcloud', 'virtual-dj'],
      }),
    }),
    performer('p_virgin', 'Virgin Active Selector', ['House'], IMG.djLights, { controls: controls({ ratePerMinShort: 1.4, ratePerMinLong: 1.2 }) }),
    performer('p_nobu', 'Nobu Lounge', ['Classical', 'R&B'], IMG.djBooth, { controls: controls({ ratePerMinShort: 1.4, ratePerMinLong: 1.2, mic: 'NO' }) }),
    performer('p_blackcoffee', 'The Real Black Coffee', ['House'], IMG.djSet, { controls: controls({ ratePerMinShort: 5, ratePerMinLong: 4, mic: 'YES_PLUS', micPrice: 30 }) }),
    performer('p_centralcee', 'Central Cee', ['UK Rap'], IMG.djCrowd, { type: 'ARTIST' }),
    performer('p_gunna', 'Gunna', ['Hip-Hop'], IMG.djNight, { type: 'ARTIST' }),
    performer('p_waffles', 'Uncle Waffles', ['Amapiano'], IMG.djPink),
    performer('p_maphorisa', 'Maphorisa', ['Amapiano'], IMG.djMixer),
    performer('p_mellow', 'Mellow & Sleazy', ['Amapiano'], IMG.djGreen),
    performer('p_finesse', 'Finesse', ['Afrobeats'], IMG.djDecks),
    performer('p_tresor', 'Tresor Residents', ['Techno', 'House'], IMG.djBooth),
    performer('p_drama', 'Drama PTA Residents', ['Amapiano'], IMG.djPink),
    performer('p_vip', 'VIP Lounge Selector', ['House'], IMG.djLights),
    performer('p_xtreme', 'Xtreme Stage Crew', ['House'], IMG.djCrowd),
  ]);

  /* ----------------------------------------------------------------- venues */
  const venue = (v: Partial<typeof s.venues.$inferInsert> & Pick<typeof s.venues.$inferInsert, 'id' | 'name' | 'kind' | 'city' | 'lat' | 'lng'>) => ({
    address: '',
    logoStyle: 'wide' as const,
    description: '',
    chatLabel: 'CLUB CHAT',
    managementLabel: 'Management Team',
    ...v,
  });
  await db.insert(s.venues).values([
    venue({ id: 'v_virgin', name: 'Virgin Active', kind: 'GYM', city: 'Johannesburg', address: 'Sandton', lat: -26.1066, lng: 28.0526, imageUrl: IMG.virginActive, description: 'Training club playlist — request the tracks that carry you through your session.', capacity: 600, liveCapacity: 214, avgWeek: 3100, avgMonth: 12400, safetyPhone: '+27100000000' }),
    venue({ id: 'v_nobu', name: 'Nobu', kind: 'RESTAURANT', city: 'Cape Town', address: 'V&A Waterfront', lat: -33.9089, lng: 18.4175, imageUrl: IMG.nobu, logoStyle: 'serif', chatLabel: 'PRIVATE TABLE CHAT', description: 'Set the mood at your table.', capacity: 180, liveCapacity: 96, avgWeek: 1200, avgMonth: 4800 }),
    venue({ id: 'v_xoyo', ownerId: 'u_owner', musicGenres: ['UK Rap', 'Hip-Hop', 'House'], name: 'XOYO London', kind: 'CLUB', city: 'London', address: '32-37 Cowper St', lat: 51.5257, lng: -0.0856, imageUrl: IMG.xoyo, capacity: 8000, liveCapacity: 6200, avgWeek: 9344, avgMonth: 17458, waitMinutes: 25 }),
    venue({ id: 'v_carpet', ownerId: 'u_owner', musicGenres: ['Amapiano', 'Afro House', 'Hip-Hop'], name: 'The Carpet Shop', kind: 'CLUB', city: 'Johannesburg', address: 'Braamfontein', lat: -26.1929, lng: 28.0346, imageUrl: IMG.carpetShop, capacity: 5000, liveCapacity: 4002, avgWeek: 8000, avgMonth: 14000, waitMinutes: 10 }),
    venue({ id: 'v_drama', ownerId: 'u_owner', musicGenres: ['Amapiano', 'House', 'Afrobeats'], name: 'Drama PTA', kind: 'CLUB', city: 'Pretoria', address: 'Hatfield', lat: -25.7487, lng: 28.238, imageUrl: IMG.drama, logoStyle: 'cond', capacity: 6000, liveCapacity: 4800, avgWeek: 8000, avgMonth: 14000, waitMinutes: 72 }),
    venue({ id: 'v_anomalie', name: 'Anomalie Art Club', kind: 'CLUB', city: 'Berlin', lat: 52.5048, lng: 13.4513, imageUrl: IMG.anomalie, capacity: 1500, liveCapacity: 1210, avgWeek: 4000, avgMonth: 16000, chatLabel: 'SECTION CHAT' }),
    venue({ id: 'v_carwash', name: 'Carwash Club', kind: 'CLUB', city: 'Johannesburg', address: 'Maboneng', lat: -26.2044, lng: 28.059, imageUrl: IMG.carwash, capacity: 900, liveCapacity: 520, avgWeek: 2500, avgMonth: 9800 }),
    venue({ id: 'v_tresor', name: 'Tresor', kind: 'CLUB', city: 'Berlin', lat: 52.5104, lng: 13.4196, imageUrl: IMG.tresor, capacity: 1200, liveCapacity: 980, avgWeek: 3800, avgMonth: 15000 }),
    venue({ id: 'v_nasrec', name: 'Johannesburg Expo Centre', kind: 'FESTIVAL', city: 'Johannesburg', address: 'Nasrec', lat: -26.2357, lng: 27.9733, imageUrl: IMG.milkCookies, capacity: 40000, liveCapacity: 31000, avgWeek: 0, avgMonth: 0, waitMinutes: 72 }),
    venue({ id: 'v_legends', name: 'Legends Adventure Farm', kind: 'FESTIVAL', city: 'Pretoria', lat: -25.6512, lng: 28.4106, imageUrl: IMG.heyNeighbour, capacity: 30000, liveCapacity: 24000 }),
    venue({ id: 'v_cloof', name: 'Cloof Wine Estate', kind: 'FESTIVAL', city: 'Darling', lat: -33.4417, lng: 18.4697, imageUrl: IMG.daisies, capacity: 25000 }),
    venue({ id: 'v_luxor', name: 'Hatshepsut Temple', kind: 'FESTIVAL', city: 'Luxor', lat: 25.738, lng: 32.6065, imageUrl: IMG.cercle, capacity: 6000 }),
  ]);

  /* ----------------------------------------------------------------- events */
  const nextDow = (dow: number, hour: number) => {
    const d = new Date(now);
    d.setHours(hour, 0, 0, 0);
    let add = (dow - d.getDay() + 7) % 7;
    if (add === 0 && d.getTime() < now) add = 7;
    return new Date(d.getTime() + add * D);
  };
  await db.insert(s.events).values([
    { id: 'e_heyneighbour', title: 'Hey Neighbour', category: 'FESTIE', venueId: 'v_legends', location: 'Legends Adventure Farm, Pretoria', subtitle: 'Legends Adventure Farm, Pretoria', imageUrl: IMG.heyNeighbour, heroColor: '#0E9F5A', description: 'Two days of hip-hop, amapiano and good neighbours. Pick a stage and shape the set.', startsAt: at(-6 * H), endsAt: at(18 * H), lat: -25.6512, lng: 28.4106 },
    { id: 'e_milkcookies', title: 'Milk & Cookies', category: 'FESTIE', venueId: 'v_nasrec', location: 'Johannesburg Expo Centre, Nasrec', subtitle: 'Johannesburg Expo Centre, Nasrec', imageUrl: IMG.milkCookies, heroColor: '#E2A21F', description: 'A celebration of hip-hop culture and community. Milk & Cookies returns to South Africa.', startsAt: at(-5 * H), endsAt: at(19 * H), lat: -26.2357, lng: 27.9733 },
    { id: 'e_daisies', title: 'Rocking The Daisies', category: 'FESTIE', venueId: 'v_cloof', location: 'Cloof Wine Estate, Darling', subtitle: 'Cloof Wine Estate', imageUrl: IMG.daisies, heroColor: '#1B1B1B', description: "The Cape's favourite music and lifestyle festival.", startsAt: at(20 * D), endsAt: at(22 * D), lat: -33.4417, lng: 18.4697 },
    { id: 'e_cercle', title: 'Cercle - Adriatique', category: 'FESTIE', venueId: 'v_luxor', location: 'Hatshepsut Temple, Luxor', subtitle: 'hatshepsut temple', imageUrl: IMG.cercle, heroColor: '#8A5A2B', description: 'Adriatique live at the Temple of Hatshepsut.', startsAt: at(27 * D), endsAt: at(27 * D + 5 * H), lat: 25.738, lng: 32.6065 },
    { id: 'e_dstv', ownerId: 'u_owner', title: 'DStv Delicious', category: 'FESTIE', venueId: 'v_carpet', location: 'Johannesburg', subtitle: 'Food & music festival', imageUrl: IMG.dstv, heroColor: '#A4A23A', description: 'Food, wine and music.', startsAt: new Date('2026-09-20T12:00:00+02:00'), endsAt: new Date('2026-09-21T23:00:00+02:00'), lat: -26.1929, lng: 28.0346 },
    { id: 'e_boiler', ownerId: 'u_owner', title: 'Boiler Room: Auxed in Berlin', category: 'CLUB', venueId: 'v_tresor', location: 'Tresor, Berlin', subtitle: 'Boiler Room', imageUrl: IMG.boilerRoom, heroColor: '#111111', description: 'Boiler Room x Auxed.', startsAt: new Date('2026-08-05T20:00:00+02:00'), endsAt: new Date('2026-08-06T04:00:00+02:00'), lat: 52.5104, lng: 13.4196 },
    { id: 'e_wireless', ownerId: 'u_owner', title: 'Wireless Festival', category: 'FESTIE', venueId: 'v_xoyo', location: 'Finsbury Park, London', subtitle: 'Finsbury Park', imageUrl: IMG.wireless, heroColor: '#2A2A2A', description: 'Wireless Festival.', startsAt: new Date('2026-07-10T12:00:00+01:00'), endsAt: new Date('2026-07-12T23:00:00+01:00'), lat: 51.5705, lng: -0.1023 },
  ]);
  await db.insert(s.stages).values([
    { id: 'st_hn_main', eventId: 'e_heyneighbour', name: 'MAIN STAGE', imageUrl: IMG.heyNeighbour, genre: 'UK Rap', sort: 0 },
    { id: 'st_hn_vip', eventId: 'e_heyneighbour', name: 'VIP LOUNGE EXCLUSIVE', imageUrl: IMG.vipLounge, genre: 'House', sort: 1 },
    { id: 'st_hn_dome', eventId: 'e_heyneighbour', name: 'THE DOME', imageUrl: IMG.mainStage, genre: 'Amapiano', sort: 2 },
    { id: 'st_hn_hood', eventId: 'e_heyneighbour', name: 'NEIGHBOURHOOD STAGE', imageUrl: IMG.daisies, genre: 'Hip-Hop', sort: 3 },
    { id: 'st_mc_main', eventId: 'e_milkcookies', name: 'MAIN STAGE', imageUrl: IMG.milkCookies, genre: 'Hip-Hop', sort: 0 },
    { id: 'st_mc_vip', eventId: 'e_milkcookies', name: 'VIP LOUNGE EXCLUSIVE', imageUrl: IMG.vipLounge, genre: 'House', sort: 1 },
    { id: 'st_mc_run', eventId: 'e_milkcookies', name: 'WUNNARUN©', imageUrl: IMG.runClub, genre: 'Hip-Hop', sort: 2 },
    { id: 'st_mc_xtreme', eventId: 'e_milkcookies', name: 'XTREME STAGE', imageUrl: IMG.xtreme, genre: 'House', sort: 3 },
    { id: 'st_daisies_main', eventId: 'e_daisies', name: 'MAIN STAGE', imageUrl: IMG.daisies, genre: 'House', sort: 0 },
    { id: 'st_cercle_main', eventId: 'e_cercle', name: 'TEMPLE STAGE', imageUrl: IMG.cercle, genre: 'House', sort: 0 },
  ]);

  /* ----------------------------------------------------------- performances */
  type PerfInsert = typeof s.performances.$inferInsert;
  const live = (p: Omit<PerfInsert, 'startsAt' | 'endsAt' | 'wentLiveAt'> & { startedAgoMin?: number }): PerfInsert => {
    const startedAgo = (p.startedAgoMin ?? 75) * 60_000;
    const { startedAgoMin: _, ...rest } = p;
    return { ...rest, startsAt: at(-startedAgo), endsAt: at(4 * H), wentLiveAt: at(-startedAgo) };
  };
  const np = (t: Track, agoSec: number) => ({ track: t, startedAt: new Date(now - agoSec * 1000).toISOString() });
  await db.insert(s.performances).values([
    live({ id: 'pf_virgin', title: 'Training Club Playlist', performerId: 'p_virgin', venueId: 'v_virgin', crowdEstimate: 214, setlist: [T.places, T.pumpitup, T.housebliss, T.fetch], nowPlaying: np(T.places, 40) }),
    live({ id: 'pf_nobu', title: 'Dinner Service', performerId: 'p_nobu', venueId: 'v_nobu', crowdEstimate: 96, setlist: [T.sunset, T.tadow, T.waltz, T.cello], nowPlaying: np(T.sunset, 60) }),
    live({ id: 'pf_bc', title: 'Anomalie Art Club', performerId: 'p_blackcoffee', venueId: 'v_anomalie', crowdEstimate: 1210, imageUrl: IMG.djSet, caption: 'Thank you Berlin! What an unreal experience it was to curate this set with you. Your taste is impeccable, I enjoyed every last second of playing with you all!', reposts: 15, likesBase: 10_000, setlist: [T.comewithme, T.drive, T.lady, T.places], nowPlaying: np(T.comewithme, 90) }),
    live({ id: 'pf_djaux_xoyo', title: 'Set 1: XOYO London', performerId: 'p_djaux', venueId: 'v_xoyo', crowdEstimate: 6200, imageUrl: IMG.xoyo, caption: 'XOYO London — you lot are something else. Keep the requests coming!', reposts: 9, likesBase: 4_300, setlist: [T.gimmick, T.sirens, T.nonstop, T.carnival, T.noface], nowPlaying: np(T.nonstop, 70), createdById: 'u_artist' }),
    live({ id: 'pf_drama', title: 'Drama PTA Fridays', performerId: 'p_waffles', venueId: 'v_drama', crowdEstimate: 4800, imageUrl: IMG.drama, setlist: [T.mnike, T.mnike2, T.imithandazo, T.epop], nowPlaying: np(T.mnike, 120) }),
    live({ id: 'pf_tresor', title: 'Tresor Nacht', performerId: 'p_tresor', venueId: 'v_tresor', crowdEstimate: 980, setlist: [T.places, T.walking, T.lady], nowPlaying: np(T.walking, 200) }),
    live({ id: 'pf_maphorisa', title: 'Maphorisa Live', performerId: 'p_maphorisa', venueId: 'v_carpet', crowdEstimate: 3900, setlist: [T.mnike, T.imithandazo, T.bogogo], nowPlaying: np(T.imithandazo, 30) }),
    live({ id: 'pf_finesse', title: 'Finesse at Carwash', performerId: 'p_finesse', venueId: 'v_carwash', crowdEstimate: 520, setlist: [T.calmdown, T.unavailable, T.asake, T.laho], nowPlaying: np(T.calmdown, 50) }),
    live({ id: 'pf_hn_main', title: 'Central Cee — Main Stage', performerId: 'p_centralcee', venueId: 'v_legends', eventId: 'e_heyneighbour', stageId: 'st_hn_main', crowdEstimate: 18000, startedAgoMin: 160, setlist: [T.gbp, T.sprinter, T.juniorslaw], nowPlaying: np(T.juniorslaw, 25) }),
    live({ id: 'pf_hn_vip', title: 'VIP Lounge Exclusive', performerId: 'p_vip', venueId: 'v_legends', eventId: 'e_heyneighbour', stageId: 'st_hn_vip', crowdEstimate: 600, setlist: [T.mylove, T.fetch, T.places], nowPlaying: np(T.mylove, 10) }),
    { id: 'pf_hn_dome', title: 'The Dome', performerId: 'p_mellow', venueId: 'v_legends', eventId: 'e_heyneighbour', stageId: 'st_hn_dome', startsAt: at(3 * H), endsAt: at(5 * H), crowdEstimate: 5000, setlist: [T.mnike2, T.bogogo] },
    { id: 'pf_hn_hood', title: 'Neighbourhood Stage', performerId: 'p_finesse', venueId: 'v_legends', eventId: 'e_heyneighbour', stageId: 'st_hn_hood', startsAt: at(6 * H), endsAt: at(8 * H), crowdEstimate: 3000, setlist: [T.water] },
    live({ id: 'pf_mc_main', title: 'Gunna — Main Stage', performerId: 'p_gunna', venueId: 'v_nasrec', eventId: 'e_milkcookies', stageId: 'st_mc_main', crowdEstimate: 25000, startedAgoMin: 150, setlist: [T.southtowest, T.wgft, T.gimmick, T.helluva], nowPlaying: np(T.gimmick, 45) }),
    live({ id: 'pf_mc_vip', title: 'VIP Lounge Exclusive', performerId: 'p_vip', venueId: 'v_nasrec', eventId: 'e_milkcookies', stageId: 'st_mc_vip', crowdEstimate: 800, setlist: [T.fetch, T.comewithme], nowPlaying: np(T.fetch, 100) }),
    { id: 'pf_mc_run', title: 'WUNNARUN© 5K with Gunna', performerId: 'p_gunna', venueId: 'v_nasrec', eventId: 'e_milkcookies', stageId: 'st_mc_run', startsAt: nextDow(0, 7), endsAt: new Date(nextDow(0, 7).getTime() + 2 * H), crowdEstimate: 2000, setlist: [T.gimmick] },
    live({ id: 'pf_mc_xtreme', title: 'Xtreme Stage', performerId: 'p_xtreme', venueId: 'v_nasrec', eventId: 'e_milkcookies', stageId: 'st_mc_xtreme', crowdEstimate: 4000, setlist: [T.pumpitup, T.housebliss], nowPlaying: np(T.pumpitup, 20) }),
    { id: 'pf_daisies', title: 'Rocking The Daisies — Main Stage', performerId: 'p_mellow', venueId: 'v_cloof', eventId: 'e_daisies', stageId: 'st_daisies_main', startsAt: at(20 * D), endsAt: at(20 * D + 3 * H), crowdEstimate: 15000, setlist: [] },
    { id: 'pf_cercle', title: 'Adriatique at the Temple', performerId: 'p_tresor', venueId: 'v_luxor', eventId: 'e_cercle', stageId: 'st_cercle_main', startsAt: at(27 * D), endsAt: at(27 * D + 3 * H), crowdEstimate: 6000, setlist: [] },
    // Upcoming bookings
    { id: 'pf_carpet_fri', title: 'The Carpet Shop', performerId: 'p_djaux', venueId: 'v_carpet', startsAt: nextDow(5, 14), endsAt: new Date(nextDow(5, 14).getTime() + 2 * H), crowdEstimate: 20000, imageUrl: IMG.carpetShop, setlist: [T.gimmick, T.wgft, T.bogogo], createdById: 'u_owner' },
    { id: 'pf_boiler_next', title: 'Boiler Room', performerId: 'p_djaux', venueId: 'v_tresor', startsAt: nextDow(6, 21), endsAt: new Date(nextDow(6, 21).getTime() + 2 * H), crowdEstimate: 1200, imageUrl: IMG.boilerRoom, setlist: [] },
    { id: 'pf_mellow_drama', title: 'Mellow & Sleazy', performerId: 'p_mellow', venueId: 'v_drama', basis: 'Recurring', startsAt: nextDow(5, 22), endsAt: new Date(nextDow(5, 22).getTime() + 2 * H), crowdEstimate: 20000, imageUrl: IMG.drama, setlist: [], createdById: 'u_owner' },
    { id: 'pf_maphorisa_sat', title: 'Maphorisa', performerId: 'p_maphorisa', venueId: 'v_carpet', startsAt: nextDow(6, 0), endsAt: new Date(nextDow(6, 0).getTime() + 2 * H), crowdEstimate: 15000, setlist: [], createdById: 'u_owner' },
    { id: 'pf_waffles_xoyo', title: 'Uncle Waffles', performerId: 'p_waffles', venueId: 'v_xoyo', startsAt: nextDow(6, 23), endsAt: new Date(nextDow(6, 23).getTime() + 2 * H), crowdEstimate: 8000, setlist: [], createdById: 'u_owner' },
    // Past sets
    { id: 'pf_carwash_recent', title: 'Carwash Club', performerId: 'p_finesse', venueId: 'v_carwash', startsAt: at(-26 * H), endsAt: at(-22 * H), endedAt: at(-22 * H), crowdEstimate: 700, imageUrl: IMG.carwash, reposts: 15, likesBase: 20_000, setlist: [] },
    { id: 'pf_drama_recent', title: 'Drama PTA', performerId: 'p_drama', venueId: 'v_drama', startsAt: at(-50 * H), endsAt: at(-46 * H), endedAt: at(-46 * H), crowdEstimate: 4000, imageUrl: IMG.drama, reposts: 8, likesBase: 12_000, setlist: [] },
    { id: 'pf_boiler_berlin', title: 'Boiler Room: Auxed in Berlin', performerId: 'p_djaux', venueId: 'v_tresor', eventId: 'e_boiler', startsAt: new Date('2026-08-05T22:00:00+02:00'), endsAt: new Date('2026-08-06T01:00:00+02:00'), endedAt: new Date('2026-08-06T01:00:00+02:00'), crowdEstimate: 1200, setlist: [T.epop, T.mnike, T.sirens] },
    { id: 'pf_dstv', title: 'DStv Delicious', performerId: 'p_djaux', venueId: 'v_carpet', eventId: 'e_dstv', startsAt: new Date('2026-09-20T16:00:00+02:00'), endsAt: new Date('2026-09-20T19:00:00+02:00'), endedAt: new Date('2026-09-20T19:00:00+02:00'), crowdEstimate: 9000, setlist: [T.bogogo, T.fetch, T.comewithme, T.mylove] },
  ]);

  /* ------------------------------------------------------- live requests */
  type ReqInsert = typeof s.requests.$inferInsert;
  const reqs: ReqInsert[] = [];
  const earn: (typeof s.earnings.$inferInsert)[] = [];
  const add = (r: Omit<ReqInsert, 'id'> & { id?: string }) => {
    const id = r.id ?? newId();
    reqs.push({ ...r, id });
    return id;
  };
  const approved = (id: string, performerId: string, venueId: string, cents: number, when: Date) => {
    const perfCut = Math.round(cents * 0.5);
    earn.push({ id: newId(), requestId: id, beneficiaryType: 'PERFORMER', beneficiaryId: performerId, amountCents: perfCut, createdAt: when });
    earn.push({ id: newId(), requestId: id, beneficiaryType: 'VENUE', beneficiaryId: venueId, amountCents: cents - perfCut, createdAt: when });
  };
  const r5 = (t: Track) => ({ ...t, durationSec: 300 });
  const live1 = (perf: string, performerId: string, venueId: string, user: string, t: Track | null, cents: number, status: ReqInsert['status'], up: number, down: number, reactionBase: Record<string, number>, agoMin: number, extra: Partial<ReqInsert> = {}) => {
    const when = at(-agoMin * 60_000);
    const id = add({ performanceId: perf, userId: user, kind: t ? 'SONG' : 'MIC', track: t, priceCents: cents, status, baseUp: up, baseDown: down, reactionBase, createdAt: when, decidedAt: status === 'PENDING' ? null : when, ...extra });
    if (status !== 'PENDING' && status !== 'REJECTED') approved(id, performerId, venueId, cents, when);
    return id;
  };
  // Virgin Active
  live1('pf_virgin', 'p_virgin', 'v_virgin', 'u_dorthy', r5(T.gold), 700, 'QUEUED', 27_000, 20, { '💪': 15, '🔥': 10 }, 30);
  live1('pf_virgin', 'p_virgin', 'v_virgin', 'u_chord', r5(T.pumpitup), 700, 'QUEUED', 27_000, 20, { '⚡': 5, '🙌': 10, '🔥': 20 }, 25);
  live1('pf_virgin', 'p_virgin', 'v_virgin', 'u_c3', r5(T.lesgout), 700, 'QUEUED', 27_000, 20, { '‼️': 20, '🙌': 10, '🔥': 5000 }, 20);
  // Nobu
  live1('pf_nobu', 'p_nobu', 'v_nobu', 'u_c4', r5(T.tadow), 700, 'QUEUED', 30, 2, { '🙌': 5, '👌': 1 }, 40);
  live1('pf_nobu', 'p_nobu', 'v_nobu', 'u_c5', r5(T.waltz), 700, 'QUEUED', 27, 20, { '🙌': 2, '🙏': 12 }, 35);
  live1('pf_nobu', 'p_nobu', 'v_nobu', 'u_c6', r5(T.cello), 700, 'QUEUED', 27_000, 20, { '🌍': 1700, '‼️': 2300, '🙌': 1000, '🔥': 5000 }, 30);
  // Black Coffee @ Anomalie
  live1('pf_bc', 'p_blackcoffee', 'v_anomalie', 'u_jazzy', { ...T.lady, durationSec: 180 }, 1500, 'QUEUED', 10_000, 400, { '😱': 800, '🙌': 1000, '🔥': 5000 }, 50);
  live1('pf_bc', 'p_blackcoffee', 'v_anomalie', 'u_classy', T.sirens, 7000, 'QUEUED', 27_000, 20, { '🌍': 1700, '‼️': 2300, '🙌': 1000, '🔥': 5000 }, 45);
  live1('pf_bc', 'p_blackcoffee', 'v_anomalie', 'u_major', null, 3000, 'QUEUED', 0, 0, { '❤️': 20 }, 40, { message: 'Happy Birthday! James, We Love Youu.' });
  live1('pf_bc', 'p_blackcoffee', 'v_anomalie', 'u_c7', r5(T.drive), 7500, 'QUEUED', 30_000, 134, { '😱': 800, '🙌': 1000, '🔥': 5000 }, 35);
  // DJAUX26 live at XOYO — the artist's own request inbox
  live1('pf_djaux_xoyo', 'p_djaux', 'v_xoyo', 'u_c8', T.laho, 580, 'PENDING', 12, 1, {}, 9);
  live1('pf_djaux_xoyo', 'p_djaux', 'v_xoyo', 'u_c9', T.sirens, 1500, 'PENDING', 34, 2, { '🔥': 6 }, 8);
  live1('pf_djaux_xoyo', 'p_djaux', 'v_xoyo', 'u_c10', null, 1500, 'PENDING', 0, 0, { '❤️': 4 }, 6, { message: 'Happy Birthday! James, we love youu.' });
  live1('pf_djaux_xoyo', 'p_djaux', 'v_xoyo', 'u_c11', T.yesgod, 1750, 'PENDING', 212, 5, { '🙌': 18 }, 5);
  live1('pf_djaux_xoyo', 'p_djaux', 'v_xoyo', 'u_c12', T.water, 1000, 'QUEUED', 48, 3, { '🔥': 9 }, 12);
  // Drama PTA live
  live1('pf_drama', 'p_waffles', 'v_drama', 'u_c13', T.mnike2, 1800, 'QUEUED', 900, 10, { '🔥': 120 }, 20);
  live1('pf_drama', 'p_waffles', 'v_drama', 'u_c14', T.bogogo, 1650, 'PENDING', 410, 4, { '🙌': 40 }, 10);
  // MrAuxed's tickets: requested and played earlier tonight
  const played = (perf: string, performerId: string, venueId: string, t: Track, cents: number, agoMin: number) =>
    live1(perf, performerId, venueId, 'u_auxee', t, cents, 'PLAYED', 140, 3, { '🔥': 22 }, agoMin + 20, { playedAt: at(-agoMin * 60_000) });
  played('pf_hn_main', 'p_centralcee', 'v_legends', T.gbp, 780, 125);
  played('pf_hn_main', 'p_centralcee', 'v_legends', T.sprinter, 1150, 120);
  played('pf_mc_main', 'p_gunna', 'v_nasrec', T.wgft, 920, 95);
  played('pf_mc_main', 'p_gunna', 'v_nasrec', T.southtowest, 620, 85);
  // Boiler Room Berlin (past) — the most upvoted set track
  live1('pf_boiler_berlin', 'p_djaux', 'v_tresor', 'u_c15', T.epop, 1600, 'PLAYED', 30_000, 40, { '🔥': 2000 }, (now - new Date('2026-08-05T23:00:00+02:00').getTime()) / 60_000, { playedAt: new Date('2026-08-05T23:10:00+02:00') });
  // DStv Delicious — "The People's Trinkets"
  [T.bogogo, T.fetch, T.comewithme, T.mylove, T.walking, T.helluva, T.places].forEach((t, i) => {
    const when = new Date(new Date('2026-09-20T16:20:00+02:00').getTime() + i * 18 * 60_000);
    const id = add({ performanceId: 'pf_dstv', userId: crowdIds[i], kind: 'SONG', track: t, priceCents: 900 + i * 50, status: 'PLAYED', createdAt: when, decidedAt: when, playedAt: when, baseUp: 40 - i * 3 });
    approved(id, 'p_djaux', 'v_carpet', 900 + i * 50, when);
  });

  /* ------------------------------------------------- historical request volume */
  const mixes: Record<string, [string, number][]> = {
    venue: [['Amapiano', 0.45], ['House', 0.25], ['UK Rap', 0.15], ['SA Rap', 0.08], ['Afrobeats', 0.07]],
    djaux: [['Amapiano', 0.5], ['Hip-Hop', 0.25], ['UK Rap', 0.25]],
  };
  const pool: Record<string, [Track, number][]> = {
    Amapiano: [[T.bogogo, 1], [T.mnike, 1], [T.epop, 1], [T.mnike2, 1], [T.imithandazo, 1]],
    House: [[T.fetch, 1], [T.comewithme, 1], [T.mylove, 1], [T.walking, 1], [T.places, 1], [T.housebliss, 1]],
    'UK Rap': [[T.juniorslaw, 6], [T.sirens, 2], [T.gbp, 1], [T.skeptaoneshot, 1]],
    'SA Rap': [[{ ...T.thula, genre: 'SA Rap' }, 1]],
    Afrobeats: [[T.laho, 1], [T.calmdown, 1], [T.unavailable, 1], [T.asake, 1]],
    'Hip-Hop': [[T.gimmick, 1], [T.nonstop, 1], [T.carnival, 1], [T.noface, 1], [T.southtowest, 1], [T.wgft, 1]],
  };
  const weighted = <V,>(list: [V, number][]) => {
    const total = list.reduce((a, [, w]) => a + w, 0);
    let x = rnd() * total;
    for (const [v, w] of list) {
      x -= w;
      if (x <= 0) return v;
    }
    return list[list.length - 1][0];
  };
  const histPerfs: PerfInsert[] = [];
  const yearStart = new Date('2026-01-02T22:00:00+02:00').getTime();
  const rosters: Record<string, string[]> = {
    v_xoyo: ['p_djaux', 'p_waffles', 'p_maphorisa', 'p_djaux'],
    v_carpet: ['p_maphorisa', 'p_djaux', 'p_mellow'],
    v_drama: ['p_mellow', 'p_waffles', 'p_drama'],
  };
  for (let w = 0; ; w++) {
    const start = yearStart + w * 7 * D;
    if (start > now - 2 * D) break;
    const progress = (start - yearStart) / (now - yearStart);
    // Gentle growth with a dip around April, and a sharp lift into Q4 as in the Request Volume chart.
    const dip = Math.exp(-Math.pow((progress - 0.3) / 0.06, 2)) * 0.35;
    const lift = Math.pow(progress, 3) * 1.2;
    for (const vid of Object.keys(rosters)) {
      const performerId = rosters[vid][w % rosters[vid].length];
      const pid = `pf_hist_${vid}_${w}`;
      const s0 = new Date(start + (vid === 'v_xoyo' ? 1 : vid === 'v_carpet' ? 0 : 2) * H);
      histPerfs.push({ id: pid, title: `${pick(['Friday Night', 'Late Session', 'Weekly Residency'])}`, performerId, venueId: vid, basis: 'Recurring', startsAt: s0, endsAt: new Date(s0.getTime() + 4 * H), endedAt: new Date(s0.getTime() + 4 * H), crowdEstimate: 3000 + Math.round(rnd() * 3000), setlist: [] });
      const nReq = Math.round((18 + 22 * progress) * (1 - dip + lift) * (0.85 + rnd() * 0.3));
      const mix = performerId === 'p_djaux' ? mixes.djaux : mixes.venue;
      for (let k = 0; k < nReq; k++) {
        const genre = weighted(mix);
        const t = weighted(pool[genre]);
        const mic = rnd() < 0.05;
        // Requests cluster in the evening: 16:00-19:00 is the busiest slot.
        const hourOffset = weighted<number>([[-6, 3], [-5, 3], [-4, 3], [-3, 2], [-2, 1], [-1, 1], [0, 1], [1, 1]]);
        const when = new Date(s0.getTime() + hourOffset * H + rnd() * H);
        if (when.getTime() > now) continue;
        const cents = mic ? 1500 : Math.max(100, Math.round((t.durationSec / 60) * (t.durationSec <= 300 ? 3 : 2.5) * 100));
        const id = add({ performanceId: pid, userId: crowdIds[Math.floor(Math.pow(rnd(), 1.6) * crowdIds.length)], kind: mic ? 'MIC' : 'SONG', track: mic ? null : t, message: mic ? 'Shout out to the birthday crew!' : null, priceCents: cents, status: 'PLAYED', createdAt: when, decidedAt: when, playedAt: when, baseUp: Math.round(rnd() * 40) });
        approved(id, performerId, vid, cents, when);
      }
    }
  }
  await insertChunks(db, s.performances, histPerfs);
  await insertChunks(db, s.requests, reqs);
  await insertChunks(db, s.earnings, earn);

  // A few live votes so the Wire Room counters respond to real rows too.
  await db.insert(s.requestVotes).values([{ requestId: reqs[0].id as string, userId: 'u_auxee', value: 1 }]);

  /* ----------------------------------------------------------------- wallet */
  const spent = reqs.filter((r) => r.userId === 'u_auxee').reduce((a, r) => a + r.priceCents, 0);
  await db.insert(s.ledger).values([
    { id: newId(), userId: 'u_auxee', type: 'TOPUP', amountCents: spent, note: 'Token wallet top-up', createdAt: at(-4 * H) },
    ...reqs
      .filter((r) => r.userId === 'u_auxee')
      .map((r) => ({ id: newId(), userId: 'u_auxee', type: 'REQUEST' as const, amountCents: -r.priceCents, note: `Request: ${r.track?.title ?? 'On The Mic'}`, requestId: r.id, createdAt: r.createdAt as Date })),
  ]);

  /* ------------------------------------------------------------------ posts */
  type PostInsert = typeof s.posts.$inferInsert;
  const post = (p: Omit<PostInsert, 'id'>, agoMin: number): PostInsert => ({ id: newId(), ...p, createdAt: at(-agoMin * 60_000) });
  await db.insert(s.posts).values([
    // Global Wire Room
    post({ authorId: 'u_auxee', kind: 'MIC', label: 'Special On The Mic', text: 'You are my favorite Daniel!', caption: 'We watch the sun set on our honeymoon, while this played in the background!', imageUrl: IMG.selfie, nowPlaying: 'Photograph by Ed Sheeran', likesBase: 1 }, 30),
    post({ authorId: 'u_wire', kind: 'SYSTEM', label: 'RodnyVinyl On The Mic', text: 'Jackie has a crush on Jill!' }, 24),
    post({ authorId: 'u_tempo', kind: 'CHAT', text: 'DJJJJJJ!', nowPlaying: 'Thula Mabota (feat. Shakes & Les)' }, 20),
    post({ authorId: 'u_jackie', kind: 'CHAT', text: 'Funny guys, wow.', toUserId: 'u_rodny', label: 'To RodnyVinyl On The Mic' }, 17),
    post({ authorId: 'u_dave', kind: 'CHAT', text: 'This is a throwback and a half!', nowPlaying: 'Drive (feat. Delilah Montagu)' }, 12),
    post({ authorId: 'u_vicky', kind: 'CHAT', text: "We've been telling this guy to drop, wow.", nowPlaying: 'Sirens' }, 8),
    post({ authorId: 'u_owner', kind: 'MANAGEMENT', label: 'Section 7 On The Mic', text: 'Shout out my boy David!' }, 4),
    // Section chats
    post({ authorId: 'u_chord', kind: 'CHAT', performanceId: 'pf_virgin', text: 'THIS WAS THE BEST EXPERIENCE I HAVE EVER HAD IN MY LIFE!' }, 14),
    post({ authorId: 'u_dorthy', kind: 'CHAT', performanceId: 'pf_virgin', text: '@Places - Elderbrook carried me through that hyrox!!' }, 9),
    post({ authorId: 'u_chord', kind: 'CHAT', performanceId: 'pf_nobu', text: 'THIS WAS THE BEST EXPERIENCE I HAVE EVER HAD IN MY LIFE!' }, 15),
    post({ authorId: 'u_dorthy', kind: 'CHAT', performanceId: 'pf_nobu', text: '@Places - Elderbrook carried me through that hyrox!!' }, 11),
    post({ authorId: 'u_chord', kind: 'CHAT', performanceId: 'pf_bc', text: 'THIS WAS THE BEST EXPERIENCE I HAVE EVER HAD IN MY LIFE!' }, 16),
    post({ authorId: 'u_major', kind: 'CHAT', performanceId: 'pf_bc', text: 'Represent! 🇿🇦🇿🇦🇿🇦' }, 7),
    post({ authorId: 'u_jazzy', kind: 'CHAT', performanceId: 'pf_carwash_recent', text: 'That set was cold!!' }, 23 * 60),
    post({ authorId: 'u_classy', kind: 'CHAT', performanceId: 'pf_carwash_recent', text: 'Got married to that song!' }, 22.5 * 60),
    post({ authorId: 'u_c1', kind: 'CHAT', performanceId: 'pf_drama_recent', text: 'Music was elite all night' }, 47 * 60),
    post({ authorId: 'u_c2', kind: 'CHAT', performanceId: 'pf_drama_recent', text: 'Vibes on vibes 🔥' }, 46.5 * 60),
    post({ authorId: 'u_c3', kind: 'CHAT', performanceId: 'pf_djaux_xoyo', text: 'Run it back!!' }, 6),
    post({ authorId: 'u_owner', kind: 'MANAGEMENT', performanceId: 'pf_djaux_xoyo', label: 'Management', text: 'Bar 2 is open — shout out the birthday tables 🎉' }, 3),
  ]);
}
