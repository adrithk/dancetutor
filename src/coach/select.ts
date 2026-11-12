// Decides whether an attempt passed and, if not, which single thing to correct.

import { TUNING } from '../config';
import { BeatGrid, Importance, Note, beatDur, beatTime } from '../lesson/types';
import { GROUPS, GroupId, PoseFrame, mirrorGroup } from '../pose/types';
import { CountResult, RefAt, frameNear } from './compare';
import { ShapeDetail, describeFix } from './describe';

export interface ShapeIssue {
  kind: 'shape';
  key: string;
  beat: number;
  group: GroupId;
  errDeg: number;
  /** Error divided by the allowed tolerance; 1 or more fails the count. */
  severity: number;
  importance: Importance;
  detail: ShapeDetail;
  /** Choreographer's reminder for this limb on this count, if any. */
  cue?: string;
  /** How many attempts in a row this same issue has now appeared. */
  streak: number;
  score: number;
}

export interface TimingIssue {
  kind: 'timing';
  key: string;
  /** A single beat, or null when the dancer was off-time across the whole section. */
  beat: number | null;
  /** Positive is late. */
  offsetMs: number;
  severity: number;
  streak: number;
  score: number;
}

export type Issue = ShapeIssue | TimingIssue;

export interface Judgement {
  passed: boolean;
  /** Everything that failed, most important first. */
  issues: Issue[];
  /** The one to talk about, or null on a clean attempt. */
  correction: Issue | null;
  /** Limbs that could not be judged because tracking was unsure. */
  unsure: { beat: number; group: GroupId }[];
}

export interface JudgeContext {
  grid: BeatGrid;
  notes: Note[];
  /** True when the dancer copies the reference like a mirror image. */
  mirror: boolean;
  refAt: RefAt;
  frames: PoseFrame[];
  /** Limbs to judge; others are ignored (used in drills). */
  focus?: GroupId[];
  /** Streak count per issue key from earlier attempts. */
  streaks: Map<string, number>;
}

/** Look up the choreographer's note for the dancer's limb on a count. */
export function noteFor(notes: Note[], beat: number, dancerGroup: GroupId, mirror: boolean) {
  const group = mirror ? mirrorGroup(dancerGroup) : dancerGroup;
  const exact = notes.find((n) => n.count === beat + 1 && n.group === group);
  const general = notes.find((n) => n.count === 'all' && n.group === group);
  const importance: Importance = exact?.importance ?? general?.importance ?? 'normal';
  let cue = exact?.cue;
  if (cue) {
    // {left} and {right} are the choreographer's sides; flip them for a mirrored dancer.
    const left = mirror ? 'right' : 'left';
    const right = mirror ? 'left' : 'right';
    cue = cue.replaceAll('{left}', left).replaceAll('{right}', right);
  }
  return { importance, cue };
}

const WEIGHT: Record<Importance, number> = { essential: 1.5, normal: 1, free: 0 };

export function judge(results: CountResult[], ctx: JudgeContext): Judgement {
  const issues: Issue[] = [];
  const unsure: { beat: number; group: GroupId }[] = [];
  const dur = beatDur(ctx.grid);
  const streak = (key: string) => (ctx.streaks.get(key) ?? 0) + 1;

  for (const r of results) {
    if (r.frames === 0) continue;
    for (const group of GROUPS) {
      if (ctx.focus && !ctx.focus.includes(group)) continue;
      const { importance, cue } = noteFor(ctx.notes, r.beat, group, ctx.mirror);
      const tolerance = TUNING.toleranceDeg[importance];
      if (!isFinite(tolerance)) continue;
      const g = r.groups[group];
      if (g.conf < TUNING.minConfidence) {
        unsure.push({ beat: r.beat, group });
        continue;
      }
      const severity = g.err / tolerance;
      if (severity < 1) continue;
      const tb = beatTime(ctx.grid, r.beat);
      const live = frameNear(ctx.frames, tb + r.offsetMs / 1000);
      const detail: ShapeDetail = live ? describeFix(group, live, ctx.refAt(tb)) : { fix: 'match', size: severity };
      const key = `${r.beat}:${group}`;
      const s = streak(key);
      issues.push({
        kind: 'shape',
        key,
        beat: r.beat,
        group,
        errDeg: g.err,
        severity,
        importance,
        detail,
        cue,
        streak: s,
        score: severity * WEIGHT[importance] * (1 + 0.5 * (s - 1)) * g.conf,
      });
    }
  }

  // Timing: one note for the whole section if the dancer drifts the same way
  // throughout, otherwise a note per count that is clearly off.
  const limit = TUNING.timingToleranceBeats * dur * 1000;
  const timed = results.filter((r) => r.timingKnown);
  const late = timed.filter((r) => r.offsetMs > limit * 0.66);
  const early = timed.filter((r) => r.offsetMs < -limit * 0.66);
  const drift = late.length >= early.length ? late : early;
  if (timed.length >= 2 && drift.length >= Math.ceil(timed.length * 0.6)) {
    const sorted = drift.map((r) => r.offsetMs).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const severity = Math.abs(median) / limit;
    if (severity >= 0.8) {
      const key = 'timing:all';
      const s = streak(key);
      issues.push({ kind: 'timing', key, beat: null, offsetMs: median, severity: Math.max(1, severity), streak: s, score: Math.max(1, severity) * 0.8 * (1 + 0.5 * (s - 1)) });
    }
  }
  if (!issues.some((i) => i.key === 'timing:all')) {
    for (const r of timed) {
      const severity = Math.abs(r.offsetMs) / limit;
      if (severity < 1) continue;
      const key = `timing:${r.beat}`;
      const s = streak(key);
      issues.push({ kind: 'timing', key, beat: r.beat, offsetMs: r.offsetMs, severity, streak: s, score: severity * 0.8 * (1 + 0.5 * (s - 1)) });
    }
  }

  issues.sort((a, b) => b.score - a.score);
  return { passed: issues.length === 0, issues, correction: issues[0] ?? null, unsure };
}

/** Update streaks after an attempt: issues seen again grow, issues that were fixed reset. */
export function updateStreaks(streaks: Map<string, number>, results: CountResult[], issues: Issue[]) {
  const seen = new Set(issues.map((i) => i.key));
  for (const r of results) {
    for (const group of GROUPS) {
      const key = `${r.beat}:${group}`;
      if (!seen.has(key)) streaks.delete(key);
    }
    if (!seen.has(`timing:${r.beat}`)) streaks.delete(`timing:${r.beat}`);
  }
  if (!seen.has('timing:all')) streaks.delete('timing:all');
  for (const key of seen) streaks.set(key, (streaks.get(key) ?? 0) + 1);
}

export type Level = 'good' | 'warn' | 'bad' | 'unknown';

/** One colour per count for the progress strip. */
export function countLevels(results: CountResult[], ctx: Pick<JudgeContext, 'grid' | 'notes' | 'mirror' | 'focus'>): Level[] {
  const limit = TUNING.timingToleranceBeats * beatDur(ctx.grid) * 1000;
  return results.map((r) => {
    if (r.frames === 0) return 'unknown';
    let worst = 0;
    let judged = 0;
    for (const group of GROUPS) {
      if (ctx.focus && !ctx.focus.includes(group)) continue;
      const tolerance = TUNING.toleranceDeg[noteFor(ctx.notes, r.beat, group, ctx.mirror).importance];
      if (!isFinite(tolerance) || r.groups[group].conf < TUNING.minConfidence) continue;
      judged++;
      worst = Math.max(worst, r.groups[group].err / tolerance);
    }
    if (judged === 0) return 'unknown';
    if (r.timingKnown) worst = Math.max(worst, Math.abs(r.offsetMs) / limit);
    return worst >= 1 ? 'bad' : worst >= 0.7 ? 'warn' : 'good';
  });
}
