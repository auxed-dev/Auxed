/**
 * AUX IN rewind, private to one listener: the phone records the live feed it receives (from the
 * moment it tuned in) so that person can go back to the start of a song, to earlier songs, and
 * then catch up to live. Nothing leaves the phone and the recording is dropped when they stop.
 */

/** About 2.5 hours of the feed at 96 kbps; after that the recording starts over. */
const MAX_BYTES = 110 * 1024 * 1024;

function pickMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

function once(el: HTMLAudioElement, event: string, ms: number) {
  return new Promise<void>((resolve) => {
    const done = () => {
      el.removeEventListener(event, done);
      resolve();
    };
    el.addEventListener(event, done);
    setTimeout(done, ms);
  });
}

export class TimeShift {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private bytes = 0;
  private url: string | null = null;
  private readonly mime = pickMime();
  /** Wall-clock time the recording starts at (the earliest moment that can be replayed). */
  startedAt = 0;

  constructor(private readonly live: MediaStream) {}

  get supported() {
    return !!this.mime;
  }

  /** Something to rewind into yet? */
  get ready() {
    return this.chunks.length > 1;
  }

  start() {
    if (!this.mime) return;
    try {
      this.rec = new MediaRecorder(this.live, { mimeType: this.mime, audioBitsPerSecond: 96_000 });
    } catch {
      this.rec = null;
      return;
    }
    this.chunks = [];
    this.bytes = 0;
    this.rec.ondataavailable = (e) => {
      if (!e.data.size) return;
      this.chunks.push(e.data);
      this.bytes += e.data.size;
      if (this.bytes > MAX_BYTES) {
        this.stopRecording();
        this.start();
      }
    };
    this.rec.start(1000);
    this.startedAt = Date.now();
  }

  /** Play the recording on `el` from wall-clock time `at`. */
  async playFrom(el: HTMLAudioElement, at: number) {
    if (!this.mime || !this.ready) throw new Error('Nothing to rewind to yet.');
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = URL.createObjectURL(new Blob(this.chunks, { type: this.mime }));
    el.srcObject = null;
    el.src = this.url;
    await once(el, 'loadedmetadata', 4000);
    // Recordings made in the browser don't state their length; asking for the far end makes the
    // browser work it out, after which seeking anywhere works.
    if (!Number.isFinite(el.duration)) {
      const known = once(el, 'durationchange', 2000);
      el.currentTime = 1e101;
      await known;
    }
    el.currentTime = Math.max(0, (at - this.startedAt) / 1000);
    await el.play();
  }

  /** Wall-clock moment `el` is playing while replaying. */
  position(el: HTMLAudioElement) {
    return this.startedAt + el.currentTime * 1000;
  }

  private stopRecording() {
    try {
      if (this.rec && this.rec.state !== 'inactive') this.rec.stop();
    } catch {
      /* already stopped */
    }
    this.rec = null;
  }

  dispose() {
    this.stopRecording();
    this.chunks = [];
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
  }
}
