// Runs a lesson: watch, count in, dance, feedback, repeat. It owns the clock,
// records the dancer during each attempt, judges it, asks the planner what
// comes next and has the teacher say so.

import { Transport } from '../audio/transport';
import { Voice } from '../audio/voice';
import { evaluateAttempt } from '../coach/compare';
import { feedbackText, introText, countWord } from '../coach/phrasing';
import { Activity, Planner, Step, buildPlan } from '../coach/planner';
import { Issue, Level, countLevels, judge, noteFor, updateStreaks } from '../coach/select';
import { PACING, Pace, TUNING } from '../config';
import { Lesson, beatDur, beatTime } from '../lesson/types';
import { boneErrors, mirrorPose, samplePose } from '../pose/features';
import { DEFAULT_SCENARIO, SimulatedDancer } from '../pose/simulated';
import { BONES, GROUPS, GroupId, Pose, PoseFrame, mirrorGroup } from '../pose/types';
import { saveSession, StoredAttempt } from './history';

export type Phase = 'ready' | 'talking' | 'watch' | 'countin' | 'dancing' | 'paused' | 'finished';

export interface AttemptRecord extends StoredAttempt {
  n: number;
}

export interface SessionState {
  phase: Phase;
  caption: string;
  activity: Activity | null;
  steps: Step[];
  stepIndex: number;
  done: string[];
  shaky: string[];
  attempts: AttemptRecord[];
  /** Limb the teacher is pointing at on the reference, during a replay. */
  spotlight: GroupId | null;
  trackingLost: boolean;
}

export interface SessionOptions {
  lesson: Lesson;
  mirror: boolean;
  pace: Pace;
  simulated: boolean;
  voice: boolean;
}

export type LiveLevel = 'good' | 'warn' | 'bad' | 'idle';

export class Session {
  readonly transport: Transport;
  readonly voice = new Voice();
  readonly lesson: Lesson;
  readonly options: SessionOptions;
  private planner: Planner;
  private sim: SimulatedDancer | null;
  private streaks = new Map<string, number>();
  private listeners = new Set<() => void>();
  private state: SessionState;
  private disposed = false;
  private started = false;
  private paused = false;
  private wantWatch = false;
  private resumeWaiters: (() => void)[] = [];
  private watched = new Set<string>();
  private startedAt = Date.now();

  // Per-frame data read directly by the canvases.
  livePose: Pose | null = null;
  private livePoseAt = 0;
  liveLevels: Record<GroupId, LiveLevel> = { left_arm: 'idle', right_arm: 'idle', left_leg: 'idle', right_leg: 'idle', torso: 'idle' };
  private smoothed: number[] = BONES.map(() => 0);
  private recording: { from: number; to: number; frames: PoseFrame[]; missed: number } | null = null;
  private simTimer = 0;

  constructor(options: SessionOptions) {
    this.options = options;
    this.lesson = options.lesson;
    this.transport = new Transport(this.lesson);
    this.voice.enabled = options.voice;
    this.planner = new Planner(buildPlan(this.lesson.counts, this.lesson.segmentCounts, this.lesson.phraseCounts), options.pace);
    this.sim = options.simulated ? new SimulatedDancer(this.lesson, DEFAULT_SCENARIO, options.mirror) : null;
    this.state = {
      phase: 'ready',
      caption: '',
      activity: this.planner.current(),
      steps: this.planner.steps,
      stepIndex: 0,
      done: [],
      shaky: [],
      attempts: [],
      spotlight: null,
      trackingLost: false,
    };
    this.restAtActivity();
    if (this.sim) this.simTimer = window.setInterval(() => this.simFrame(), 1000 / 30);
  }

  // --- state plumbing ---

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getState = () => this.state;

  private set(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  private syncPlan() {
    this.set({
      activity: this.planner.current(),
      steps: this.planner.steps.slice(),
      stepIndex: this.planner.index,
      done: [...this.planner.done],
      shaky: [...this.planner.shaky],
    });
  }

  // --- poses ---

  /** Reference pose as the choreographer performed it. */
  refPose(t = this.transport.mediaTime): Pose {
    return samplePose(this.lesson.poses, t);
  }

  /** The pose the dancer should be making, in their own left and right. */
  targetAt = (t: number): Pose => {
    const p = samplePose(this.lesson.poses, t);
    return this.options.mirror ? mirrorPose(p, this.lesson.poses.aspect) : p;
  };

  /** How much each limb matters right now, for the dancer's limbs. */
  importanceNow(group: GroupId) {
    const beat = Math.round(this.transport.beatPos);
    return noteFor(this.lesson.notes, beat, group, this.options.mirror).importance;
  }

  /** Feed a tracked pose in. `perfMs` is when the frame was seen. */
  onPose = (pose: Pose | null, perfMs: number) => {
    if (this.disposed) return;
    const latency = this.sim ? 0 : TUNING.cameraLatencyMs;
    const t = this.transport.mediaTimeAt(perfMs - latency);
    const rec = this.recording;
    const inWindow = !!rec && this.transport.isPlaying && t >= rec.from && t < rec.to;
    if (!pose) {
      if (inWindow) rec!.missed++;
      if (performance.now() - this.livePoseAt > 600) this.livePose = null;
      return;
    }
    this.livePose = pose;
    this.livePoseAt = performance.now();
    if (inWindow) rec!.frames.push({ t, p: pose });
    this.updateLiveLevels(pose, t);
  };

  private updateLiveLevels(pose: Pose, t: number) {
    const active = this.state.phase === 'dancing';
    if (!active) {
      for (const g of GROUPS) this.liveLevels[g] = 'idle';
      this.smoothed.fill(0);
      return;
    }
    // Compare against the target a little either side of now, so small timing
    // slips do not flash red; timing is judged properly after the attempt.
    const dur = beatDur(this.lesson);
    let best: number[] | null = null;
    let bestCost = Infinity;
    for (const shift of [-0.2, -0.1, 0, 0.1, 0.2]) {
      const errs = boneErrors(pose, this.targetAt(t - shift * dur));
      const cost = errs.reduce((s, e) => s + e.err * e.conf, 0);
      if (cost < bestCost) {
        bestCost = cost;
        best = errs.map((e) => (e.conf >= TUNING.minConfidence ? e.err : 0));
      }
    }
    const focus = this.state.activity?.drill?.focus;
    this.smoothed = this.smoothed.map((s, i) => s + (best![i] - s) * 0.35);
    for (const g of GROUPS) {
      let worst = 0;
      BONES.forEach((b, i) => {
        if (b.group === g) worst = Math.max(worst, this.smoothed[i]);
      });
      const free = this.importanceNow(g) === 'free' || (focus && !focus.includes(g));
      this.liveLevels[g] = free ? 'idle' : worst >= TUNING.liveBadDeg ? 'bad' : worst >= TUNING.liveWarnDeg ? 'warn' : 'good';
    }
  }

  private simFrame() {
    if (!this.sim) return;
    const now = performance.now();
    const t = this.transport.mediaTimeAt(now);
    const dancing = this.transport.isPlaying && (this.state.phase === 'dancing' || this.state.phase === 'countin');
    // While watching or listening the simulated dancer stands in the starting pose.
    const a = this.state.activity;
    const restT = a ? beatTime(this.lesson, a.from) - beatDur(this.lesson) * 0.6 : 0;
    const pose = dancing ? this.sim.poseAt(t, this.transport.rate, this.targetAt) : this.targetAt(restT);
    this.onPose(pose, now);
  }

  // --- controls ---

  async start() {
    if (this.started) return;
    this.started = true;
    this.transport.unlock();
    await this.say(introText(this.lesson.title));
    void this.loop();
  }

  pause() {
    if (this.paused || this.state.phase === 'finished') return;
    this.paused = true;
    this.transport.stop();
    this.voice.cancel();
    this.set({ phase: 'paused' });
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.transport.unlock();
    this.resumeWaiters.splice(0).forEach((fn) => fn());
  }

  togglePause() {
    if (this.paused) this.resume();
    else this.pause();
  }

  /** Replay the reference for the current section before the next attempt. */
  watchAgain() {
    if (this.state.phase === 'finished') return;
    this.wantWatch = true;
    this.transport.stop();
    this.voice.cancel();
    if (this.paused) this.resume();
  }

  skipStep() {
    if (this.state.phase === 'finished') return;
    const report = this.planner.skip();
    this.syncPlan();
    this.transport.stop();
    this.voice.cancel();
    this.pendingLine = feedbackText(report, null, this.lesson.counts);
    if (this.paused) this.resume();
  }

  dispose() {
    this.disposed = true;
    window.clearInterval(this.simTimer);
    this.transport.stop();
    this.voice.cancel();
    this.resumeWaiters.splice(0).forEach((fn) => fn());
  }

  // --- the lesson loop ---

  private pendingLine: string | null = null;

  private waitWhilePaused(): Promise<void> {
    if (!this.paused) return Promise.resolve();
    return new Promise((resolve) => this.resumeWaiters.push(resolve));
  }

  private async say(text: string) {
    this.set({ phase: 'talking', caption: text });
    await this.voice.say(text);
  }

  private restAtActivity() {
    const a = this.planner.current();
    if (a) this.transport.rest(beatTime(this.lesson, a.from) - beatDur(this.lesson) * 0.6);
  }

  private async loop() {
    while (!this.disposed && !this.planner.finished) {
      await this.waitWhilePaused();
      if (this.disposed) return;
      if (this.pendingLine) {
        const line = this.pendingLine;
        this.pendingLine = null;
        await this.say(line);
        continue;
      }
      const act = this.planner.current();
      if (!act) break;
      this.set({ activity: act, spotlight: null });
      const needsWatch = act.fresh && (act.step.kind === 'learn' || act.step.kind === 'review') && !this.watched.has(act.step.id);
      if (needsWatch || this.wantWatch) {
        this.wantWatch = false;
        this.watched.add(act.step.id);
        await this.watch(act.from, act.to, act.speed);
        continue;
      }
      await this.attempt(act);
    }
    if (!this.disposed) {
      this.set({ phase: 'finished' });
    }
  }

  /** Play the reference for the dancer to watch, without judging. */
  private async watch(from: number, to: number, speed: number) {
    const dur = beatDur(this.lesson);
    this.set({ phase: 'watch', caption: 'Watch.' });
    await this.transport.play({
      from: beatTime(this.lesson, from) - 2 * dur,
      to: beatTime(this.lesson, to - 1) + dur * 0.5,
      rate: speed,
      music: false,
      firstDanceBeat: from,
    });
  }

  private async attempt(act: Activity) {
    const dur = beatDur(this.lesson);
    const firstBeat = beatTime(this.lesson, act.from);
    this.recording = { from: firstBeat - dur / 2, to: beatTime(this.lesson, act.to - 1) + dur / 2, frames: [], missed: 0 };
    this.set({ phase: 'countin', caption: act.drill ? 'Drill. Get ready.' : 'Get ready.', trackingLost: false });
    const danceAfterMs = ((PACING.countInBeats - 0.5) * dur * 1000) / act.speed;
    const toDancing = window.setTimeout(() => {
      if (this.state.phase === 'countin') this.set({ phase: 'dancing', caption: '' });
    }, danceAfterMs);
    const result = await this.transport.play({
      from: firstBeat - PACING.countInBeats * dur,
      to: this.recording.to,
      rate: act.speed,
      music: act.music,
      firstDanceBeat: act.from,
      onUpcomingBeat: (beat, inMs) => {
        // Speak the count-in: "five, six, seven, eight".
        if (beat < act.from && beat >= act.from - PACING.countInBeats) {
          window.setTimeout(() => this.voice.quick(countWord(beat)), Math.max(0, inMs - 140));
        }
      },
    });
    window.clearTimeout(toDancing);
    const rec = this.recording;
    this.recording = null;
    if (result === 'stopped' || this.disposed || !rec) return;

    const beats = Array.from({ length: act.to - act.from }, (_, i) => act.from + i);
    // Do not judge a guess: skip the attempt if the dancer was out of view for
    // much of it, or if tracking ran too slowly to see each count properly.
    const seen = rec.frames.length;
    console.debug(`attempt: ${seen} frames tracked, ${rec.missed} without a dancer`);
    if (seen === 0 || rec.missed > seen * 0.5) {
      this.set({ trackingLost: true });
      await this.say("I couldn't see you clearly. Step back so your whole body is in frame, and we'll go again.");
      return;
    }
    if (seen < beats.length * 3) {
      this.set({ trackingLost: true });
      await this.say('Body tracking is running too slowly on this device to judge that. Close other tabs or apps and we will go again.');
      return;
    }

    const results = evaluateAttempt(this.targetAt, rec.frames, beats, this.lesson);
    const ctx = { grid: this.lesson, notes: this.lesson.notes, mirror: this.options.mirror, refAt: this.targetAt, frames: rec.frames, focus: act.drill?.focus, streaks: this.streaks };
    const judgement = judge(results, ctx);
    updateStreaks(this.streaks, results, judgement.issues);
    const levels: Level[] = countLevels(results, ctx);
    const report = this.planner.report(judgement.passed, judgement.correction);
    const said = feedbackText(report, judgement.correction, this.lesson.counts);
    if (judgement.correction) this.sim?.hear(judgement.correction.key);

    const record: AttemptRecord = {
      n: this.state.attempts.length + 1,
      stepId: act.step.id,
      kind: act.step.kind,
      from: act.from,
      to: act.to,
      speed: act.speed,
      drill: !!act.drill,
      passed: judgement.passed,
      levels,
      said,
      correction: judgement.correction ? summarise(judgement.correction) : null,
      at: Date.now(),
    };
    this.set({ attempts: [...this.state.attempts, record] });
    saveSession(this.lesson.id, this.startedAt, this.state.attempts);
    this.syncPlan();
    // Keep showing the section just danced while the teacher talks about it.
    this.set({ activity: act });
    await this.say(said);
    if (this.disposed || this.paused) return;

    // The second time the same shape goes wrong, show that moment again slowly.
    const c = judgement.correction;
    if (c && c.kind === 'shape' && c.streak >= 2 && (report.outcome === 'repeat' || report.outcome === 'slow-down' || report.outcome === 'drill-start')) {
      this.set({ spotlight: this.options.mirror ? mirrorGroup(c.group) : c.group });
      await this.watch(Math.max(0, c.beat - 1), c.beat + 1, 0.5);
      this.set({ spotlight: null });
    }
    this.restAtActivity();
  }
}

function summarise(issue: Issue) {
  return issue.kind === 'shape'
    ? { key: issue.key, kind: issue.kind, beat: issue.beat, group: issue.group as GroupId | null, fix: issue.detail.fix as string }
    : { key: issue.key, kind: issue.kind, beat: issue.beat, group: null, fix: issue.offsetMs > 0 ? 'late' : 'early' };
}
