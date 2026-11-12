// The lesson clock. It plays a range of the routine at a chosen speed, keeps
// the reference video (if any) in step, and sounds the beat: a click for
// count-ins and counts-only practice, a simple drum pattern as music for
// lessons that have no soundtrack of their own.

import { BeatGrid, beatDur, beatTime } from '../lesson/types';

export interface PlayOptions {
  /** Media time range in seconds. */
  from: number;
  to: number;
  rate: number;
  music: boolean;
  /** Beats before this one are a count-in and always get a click. */
  firstDanceBeat: number;
  /** Called shortly before each beat sounds, with the milliseconds remaining. */
  onUpcomingBeat?: (beat: number, inMs: number) => void;
}

interface Playing extends PlayOptions {
  perfStart: number;
  nextBeat: number;
  timer: number;
  resolve: (r: 'ended' | 'stopped') => void;
}

const LOOKAHEAD_MS = 220;

export class Transport {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private playing: Playing | null = null;
  private restTime: number;
  /** Reference video to keep in step with the clock, if the lesson has one. */
  media: HTMLMediaElement | null = null;
  /** True when the media element carries the lesson's music. */
  mediaHasMusic = false;
  volume = 0.9;

  constructor(readonly grid: BeatGrid) {
    this.restTime = grid.firstBeatSec;
  }

  /** Must be called from a click or key press so the browser allows sound. */
  unlock() {
    try {
      this.ctx ??= new AudioContext();
      void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  get isPlaying() {
    return this.playing !== null;
  }

  get rate() {
    return this.playing?.rate ?? 1;
  }

  /** Media time at a given performance.now() timestamp. */
  mediaTimeAt(perfMs: number): number {
    const p = this.playing;
    if (!p) return this.restTime;
    return Math.min(p.to, p.from + ((perfMs - p.perfStart) / 1000) * p.rate);
  }

  get mediaTime(): number {
    return this.mediaTimeAt(performance.now());
  }

  /** Position in beats; beat 0.0 is exactly count 1. */
  get beatPos(): number {
    return (this.mediaTime - this.grid.firstBeatSec) / beatDur(this.grid);
  }

  /** Where the reference rests while nothing is playing. */
  rest(t: number) {
    this.restTime = t;
    if (!this.playing) this.syncMedia(true);
  }

  play(opts: PlayOptions): Promise<'ended' | 'stopped'> {
    this.stop();
    return new Promise((resolve) => {
      const firstBeat = Math.ceil((opts.from - this.grid.firstBeatSec) / beatDur(this.grid) - 1e-6);
      const p: Playing = { ...opts, perfStart: performance.now() + 60, nextBeat: firstBeat, resolve, timer: 0 };
      this.playing = p;
      p.timer = window.setInterval(() => this.tick(), 25);
      this.tick();
    });
  }

  stop() {
    const p = this.playing;
    if (!p) return;
    this.restTime = this.mediaTime;
    this.finish('stopped');
  }

  private finish(result: 'ended' | 'stopped') {
    const p = this.playing;
    if (!p) return;
    window.clearInterval(p.timer);
    this.playing = null;
    this.media?.pause();
    p.resolve(result);
  }

  private tick() {
    const p = this.playing;
    if (!p) return;
    const now = performance.now();
    const t = this.mediaTimeAt(now);
    if (now >= p.perfStart && t >= p.to) {
      this.restTime = p.to;
      this.finish('ended');
      return;
    }
    // Schedule the sound for every beat coming up in the next moment.
    for (;;) {
      const tb = beatTime(this.grid, p.nextBeat);
      if (tb >= p.to - 1e-6) break;
      const atPerf = p.perfStart + ((tb - p.from) / p.rate) * 1000;
      if (atPerf - now > LOOKAHEAD_MS) break;
      this.scheduleBeat(p, p.nextBeat, atPerf - now);
      p.onUpcomingBeat?.(p.nextBeat, Math.max(0, atPerf - now));
      p.nextBeat++;
    }
    this.syncMedia(false);
  }

  private syncMedia(force: boolean) {
    const el = this.media;
    if (!el) return;
    const p = this.playing;
    const t = Math.max(0, this.mediaTime);
    if (!p) {
      if (!el.paused) el.pause();
      if (force && Math.abs(el.currentTime - t) > 0.03) el.currentTime = t;
      return;
    }
    el.playbackRate = p.rate;
    el.muted = !(p.music && this.mediaHasMusic);
    el.volume = this.volume;
    if (this.mediaTime < 0) {
      if (!el.paused) el.pause();
      if (el.currentTime !== 0) el.currentTime = 0;
      return;
    }
    if (Math.abs(el.currentTime - t) > 0.12) el.currentTime = t;
    if (el.paused) void el.play().catch(() => {});
  }

  // --- sounds ---

  private scheduleBeat(p: Playing, beat: number, inMs: number) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const at = ctx.currentTime + Math.max(0, inMs) / 1000;
    const countIn = beat < p.firstDanceBeat;
    const playsOwnMusic = p.music && this.mediaHasMusic;
    if (countIn) {
      this.blip(at, 1480, 0.5);
    } else if (!p.music) {
      this.blip(at, beat % 4 === 0 ? 1175 : 880, 0.4);
    } else if (!playsOwnMusic) {
      this.kick(at);
      if (((beat % 2) + 2) % 2 === 1) this.snare(at);
      this.hat(at + (beatDur(this.grid) / p.rate) * 0.5);
    }
  }

  private out(ctx: AudioContext, gain: number) {
    const g = ctx.createGain();
    g.gain.value = gain * this.volume;
    g.connect(ctx.destination);
    return g;
  }

  private blip(at: number, freq: number, gain: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = this.out(ctx, 0);
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain * this.volume, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.07);
    osc.connect(g);
    osc.start(at);
    osc.stop(at + 0.08);
  }

  private kick(at: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = this.out(ctx, 0);
    osc.frequency.setValueAtTime(150, at);
    osc.frequency.exponentialRampToValueAtTime(45, at + 0.14);
    g.gain.setValueAtTime(0.9 * this.volume, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.22);
    osc.connect(g);
    osc.start(at);
    osc.stop(at + 0.24);
  }

  private noiseSource(ctx: AudioContext) {
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    return src;
  }

  private snare(at: number) {
    const ctx = this.ctx!;
    const src = this.noiseSource(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    const g = this.out(ctx, 0);
    g.gain.setValueAtTime(0.5 * this.volume, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.16);
    src.connect(filter).connect(g);
    src.start(at);
    src.stop(at + 0.18);
  }

  private hat(at: number) {
    const ctx = this.ctx!;
    const src = this.noiseSource(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    const g = this.out(ctx, 0);
    g.gain.setValueAtTime(0.18 * this.volume, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
    src.connect(filter).connect(g);
    src.start(at);
    src.stop(at + 0.06);
  }
}
