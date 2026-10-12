import { useEffect, useRef, useState } from 'react';
import type { AuxedPage } from '../_app';
import { Screen, TitleBar } from '@/components/Screen';
import { Toggle } from '@/components/ui';
import { Skeleton } from '@/components/Loader';
import { useToast } from '@/components/Toast';
import { useSession } from '@/lib/client/session';
import { useApi } from '@/lib/client/useApi';
import { api, patch, post, del, errorMessage } from '@/lib/client/api';
import { waitForIce } from '@/lib/client/auxin';
import { rand } from '@/lib/format';
import { cx } from '@/lib/util';

/** Audio input value for "this computer's sound" (the DJ software on the broadcasting laptop). */
const SYSTEM_AUDIO = '__system_audio__';

interface VenueAux {
  venueId: string;
  name: string;
  /** Owners change settings; the DJ playing there only broadcasts. */
  canEdit: boolean;
  enabled: boolean;
  dayPassCents: number;
  memberCode: string | null;
  stream: { id: string; zone: string; startedAt: string } | null;
  passes30d: number;
  revenue30dCents: number;
}

/**
 * AUX IN broadcaster. Run this on a laptop/tablet at the venue with the mixer's line-out going into
 * a USB audio interface — or on the DJ's own laptop with "This computer's sound", which sends
 * exactly what the DJ software plays. It streams the live feed to members who are listening in.
 */
const AuxInBroadcaster: AuxedPage = () => {
  const toast = useToast();
  const { user } = useSession();
  const dj = user?.role === 'PERFORMER';
  const { data, reload } = useApi<{ venues: VenueAux[]; monthPassCents: number }>('/api/owner/auxin');
  const [venueId, setVenueId] = useState('');
  const [zone, setZone] = useState('Main floor');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [live, setLive] = useState<{ streamId: string } | null>(null);
  const [listeners, setListeners] = useState(0);
  const [level, setLevel] = useState(0);
  const stream = useRef<MediaStream | null>(null);
  const peers = useRef(new Map<string, RTCPeerConnection>());
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const meter = useRef<number | null>(null);
  const ice = useRef<RTCIceServer[]>([]);
  const wake = useRef<WakeLockSentinel | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  const venue = data?.venues.find((v) => v.venueId === venueId) ?? data?.venues[0];
  useEffect(() => {
    if (!venueId && data?.venues[0]) setVenueId(data.venues[0].venueId);
  }, [data, venueId]);

  async function loadDevices() {
    try {
      // Permission first, so device names are visible.
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      const all = await navigator.mediaDevices.enumerateDevices();
      const inputs = all.filter((d) => d.kind === 'audioinput');
      setDevices(inputs);
      if (!deviceId && inputs[0]) setDeviceId(inputs[0].deviceId);
    } catch {
      toast('Allow microphone/line-in access so AUXED can capture the speaker feed.', 'error');
    }
  }

  /**
   * The sound this computer is playing (DJ software, a music app), via the browser's share dialog.
   * Browsers only share sound together with a screen/tab, so the picture is dropped straight away.
   */
  async function systemAudioStream() {
    const media = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      // Chrome: offer the whole system's sound, not just one tab.
      ...({ systemAudio: 'include', selfBrowserSurface: 'exclude' } as object),
    } as DisplayMediaStreamOptions);
    media.getVideoTracks().forEach((t) => {
      t.stop();
      media.removeTrack(t);
    });
    if (!media.getAudioTracks().length) throw new Error('No sound was shared. Choose "Entire screen" and tick "Share system audio", then try again.');
    // If the person stops sharing from the browser bar, end the broadcast too.
    media.getAudioTracks()[0].addEventListener('ended', () => stopRef.current?.());
    return media;
  }

  async function start() {
    if (!venue) return;
    try {
      const media =
        deviceId === SYSTEM_AUDIO
          ? await systemAudioStream()
          : await navigator.mediaDevices.getUserMedia({
              audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2, sampleRate: 48000 },
            });
      stream.current = media;
      startMeter(media);
      ice.current = (await api<{ iceServers: RTCIceServer[] }>('/api/auxin/ice')).iceServers;
      const { id } = await post<{ id: string }>('/api/auxin/streams', { venueId: venue.venueId, zone });
      setLive({ streamId: id });
      poll.current = setInterval(() => tick(id), 1500);
      // Keep the venue tablet/laptop awake while it broadcasts.
      wake.current = (await navigator.wakeLock?.request('screen').catch(() => null)) ?? null;
      toast('AUX IN is live. Members at the venue can listen in now.', 'success');
      reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  async function tick(streamId: string) {
    try {
      const r = await api<{ status: string; waiting: { id: string; offer: string; userName: string }[]; listeners: number }>(`/api/auxin/streams/${streamId}`);
      setListeners(r.listeners);
      for (const w of r.waiting) {
        if (peers.current.has(w.id) || !stream.current) continue;
        const pc = new RTCPeerConnection({ iceServers: ice.current });
        peers.current.set(w.id, pc);
        try {
          stream.current.getAudioTracks().forEach((t) => pc.addTrack(t, stream.current!));
          pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
              peers.current.delete(w.id);
              del(`/api/auxin/peers/${w.id}`).catch(() => undefined);
            }
          };
          await pc.setRemoteDescription({ type: 'offer', sdp: w.offer });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await waitForIce(pc);
          await api(`/api/auxin/peers/${w.id}`, { method: 'PUT', body: { answer: pc.localDescription!.sdp } });
        } catch (err) {
          // Close this listener's request so their phone stops waiting and can retry.
          console.warn('AUX IN: could not answer listener', w.userName, err);
          pc.close();
          del(`/api/auxin/peers/${w.id}`).catch(() => undefined);
        }
      }
    } catch {
      /* next tick */
    }
  }

  function startMeter(media: MediaStream) {
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(media);
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    const buf = new Uint8Array(an.fftSize);
    const loop = () => {
      an.getByteTimeDomainData(buf);
      let peak = 0;
      for (const b of buf) peak = Math.max(peak, Math.abs(b - 128));
      setLevel(peak / 128);
      meter.current = requestAnimationFrame(loop);
    };
    loop();
  }

  async function stop() {
    if (poll.current) clearInterval(poll.current);
    if (meter.current) cancelAnimationFrame(meter.current);
    peers.current.forEach((pc) => pc.close());
    peers.current.clear();
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    wake.current?.release().catch(() => undefined);
    wake.current = null;
    if (live) await api(`/api/auxin/streams/${live.streamId}`, { method: 'PATCH', body: { action: 'end' } }).catch(() => undefined);
    setLive(null);
    setListeners(0);
    setLevel(0);
    reload();
  }

  stopRef.current = stop;

  useEffect(
    () => () => {
      if (poll.current) clearInterval(poll.current);
      wake.current?.release().catch(() => undefined);
    },
    [],
  );

  async function save(p: Record<string, unknown>) {
    if (!venue) return;
    try {
      await patch('/api/owner/auxin', { venueId: venue.venueId, ...p });
      reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  return (
    <Screen nav theme={dj ? 'green' : 'purple'} title="AUX IN">
      <TitleBar title="AUX IN" back={dj ? '/artist' : '/owner'} />
      <p className="-mt-3 mb-4 px-7 font-ui text-[13px] leading-relaxed text-white/65">
        {dj
          ? "Stream your set to the crowd's earphones. Choose \"This computer's sound\" to send exactly what your DJ software plays, or plug your mixer's line-out in, and go live."
          : "Stream your speakers to members' earphones. Plug the mixer's line-out into this device (a USB audio interface works best), choose it below and go live."}
      </p>
      {!data ? (
        <Skeleton className="mx-4 h-[300px]" />
      ) : data.venues.length === 0 ? (
        <p className="panel mx-4 px-5 py-6 text-center font-ui text-[14px] text-white/70">{dj ? 'Go live at a venue that offers AUX IN, then come back here to stream your set.' : 'Register a venue first.'}</p>
      ) : (
        <section className="glow-card mx-[10px] flex flex-col gap-4 px-5 pb-7 pt-6">
          <div>
            <label className="label">Venue</label>
            <select className="field appearance-none" value={venue?.venueId} onChange={(e) => setVenueId(e.target.value)} disabled={!!live}>
              {data.venues.map((v) => (
                <option key={v.venueId} value={v.venueId} className="bg-black">
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          {venue && (
            <>
              {venue.canEdit && (
              <>
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-black/30 px-4 py-3">
                <span>
                  <span className="block font-ui text-[14px] font-semibold text-white">Offer AUX IN at {venue.name}</span>
                  <span className="block font-ui text-[12px] text-white/60">
                    {venue.passes30d} passes · {rand(venue.revenue30dCents / 100)} in the last 30 days
                  </span>
                </span>
                <Toggle checked={venue.enabled} onChange={(on) => save({ enabled: on })} label="Offer AUX IN" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Day pass (R)</label>
                  <input className="field" inputMode="decimal" defaultValue={(venue.dayPassCents / 100).toFixed(0)} onBlur={(e) => save({ dayPass: e.target.value || 0 })} key={`dp-${venue.venueId}`} />
                </div>
                <div>
                  <label className="label">Member code</label>
                  <input className="field" defaultValue={venue.memberCode ?? ''} placeholder="Members listen free" onBlur={(e) => save({ memberCode: e.target.value })} key={`mc-${venue.venueId}`} />
                </div>
              </div>
              <p className="-mt-2 px-1 font-ui text-[11px] text-white/50">
                Members with the code listen free. Everyone else can buy a Day Pass here, or use the AUX Pass ({rand(data.monthPassCents / 100)} / 30 days, all AUX IN venues).
              </p>
              </>
              )}

              <div className="rounded-2xl bg-black/35 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-din text-[12px] font-bold uppercase tracking-[0.14em] text-white/80">Broadcaster</span>
                  <span className={cx('flex items-center gap-1.5 font-din text-[11px] font-bold uppercase', live ? 'text-red-300' : 'text-white/50')}>
                    {live && <span className="h-2 w-2 animate-pulseGlow rounded-full bg-red-500" />} {live ? `Live · ${listeners} listening` : venue.stream ? 'Live on another device' : 'Off'}
                  </span>
                </div>
                {!live && (
                  <>
                    <div className="mt-3 flex gap-2">
                      <select className="field appearance-none text-[13px]" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} onFocus={() => !devices.length && loadDevices()}>
                        {!devices.length && <option className="bg-black">Tap to choose the audio input…</option>}
                        <option value={SYSTEM_AUDIO} className="bg-black">
                          This computer&apos;s sound (DJ software)
                        </option>
                        {devices.map((d) => (
                          <option key={d.deviceId} value={d.deviceId} className="bg-black">
                            {d.label || 'Audio input'}
                          </option>
                        ))}
                      </select>
                    </div>
                    <input className="field mt-2" value={zone} onChange={(e) => setZone(e.target.value)} maxLength={30} placeholder="Zone (e.g. Spin studio)" aria-label="Zone" />
                  </>
                )}
                {live && (
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10" aria-label="Input level">
                    <div className="h-full rounded-full bg-lime transition-[width] duration-75" style={{ width: `${Math.min(100, level * 140)}%` }} />
                  </div>
                )}
                <button type="button" onClick={live ? stop : start} className={cx('mt-4 h-[54px] w-full rounded-full font-din text-[14px] font-bold uppercase tracking-wider', live ? 'bg-red-600 text-white' : 'bg-lime text-lime-ink')}>
                  {live ? 'Stop broadcast' : 'Go live'}
                </button>
                <p className="mt-2 text-center font-ui text-[11px] text-white/45">Keep this screen open while you broadcast. Listeners hear about half a second behind the speakers.</p>
              </div>
            </>
          )}
        </section>
      )}
      <p className="mx-6 mt-5 font-ui text-[11px] leading-relaxed text-white/40">
        Rebroadcasting music to phones needs the right licences (SAMRO / SAMPRA / CAPASSO) and must be allowed by your music provider. AUX IN only streams live, on site.
      </p>
    </Screen>
  );
};

AuxInBroadcaster.auth = ['OWNER', 'PERFORMER'];
export default AuxInBroadcaster;
