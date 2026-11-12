// Scores one attempt against the reference, count by count.
// For each count it finds how early or late the dancer was (timing), then
// measures how far each limb was from the target at that timing (shape).

import { TUNING } from '../config';
import { BeatGrid, beatDur, beatTime } from '../lesson/types';
import { boneDir, angleBetween } from '../pose/features';
import { BONES, GROUPS, GroupId, Pose, PoseFrame } from '../pose/types';

export interface GroupScore {
  /** Worst bone angle error in the group, in degrees. */
  err: number;
  /** Average tracking confidence, 0 to 1. */
  conf: number;
}

export interface CountResult {
  /** Beat index across the routine (0 is count 1). */
  beat: number;
  /** Positive means the dancer was late, in media milliseconds. */
  offsetMs: number;
  /** False when the count had too little movement to measure timing. */
  timingKnown: boolean;
  groups: Record<GroupId, GroupScore>;
  /** Number of camera frames that landed in this count. */
  frames: number;
}

export type RefAt = (t: number) => Pose;

function poseCost(live: Pose, target: Pose): number {
  let sum = 0;
  let weight = 0;
  for (const bone of BONES) {
    const a = boneDir(live, bone);
    const b = boneDir(target, bone);
    const w = Math.min(a.conf, b.conf);
    sum += angleBetween(a, b) * w;
    weight += w;
  }
  return weight > 0 ? sum / weight : 0;
}

/**
 * @param refAt   target pose at a media time, already in the dancer's frame
 * @param frames  the dancer's poses, stamped with media time
 * @param beats   beat indices to score
 */
export function evaluateAttempt(refAt: RefAt, frames: PoseFrame[], beats: number[], grid: BeatGrid): CountResult[] {
  const dur = beatDur(grid);
  const search = TUNING.timingSearchBeats * dur;
  const step = dur / 20;
  return beats.map((beat) => {
    const tb = beatTime(grid, beat);
    const inWindow = frames.filter((f) => f.t >= tb - dur / 2 && f.t < tb + dur / 2);
    const empty = Object.fromEntries(GROUPS.map((g) => [g, { err: 0, conf: 0 }])) as Record<GroupId, GroupScore>;
    if (inWindow.length === 0) {
      return { beat, offsetMs: 0, timingKnown: false, groups: empty, frames: 0 };
    }

    // Timing: slide the reference earlier and later and keep the best fit.
    const costAt = (offset: number) => {
      let sum = 0;
      for (const f of inWindow) sum += poseCost(f.p, refAt(f.t - offset));
      return sum / inWindow.length;
    };
    const zero = costAt(0);
    let best = 0;
    let bestCost = zero;
    for (let off = -search; off <= search + 1e-9; off += step) {
      // A small penalty keeps the answer at zero when the pose is not changing.
      const c = costAt(off) + Math.abs(off) * 6;
      if (c < bestCost) {
        bestCost = c;
        best = off;
      }
    }
    const timingKnown = zero - costAt(best) >= TUNING.timingMinGainDeg;
    const offset = timingKnown ? best : 0;

    // Shape: per-bone error at the chosen timing, grouped by limb.
    const sums = BONES.map(() => ({ err: 0, w: 0, conf: 0 }));
    for (const f of inWindow) {
      const target = refAt(f.t - offset);
      BONES.forEach((bone, i) => {
        const a = boneDir(f.p, bone);
        const b = boneDir(target, bone);
        const w = Math.min(a.conf, b.conf);
        sums[i].err += angleBetween(a, b) * w;
        sums[i].w += w;
        sums[i].conf += w;
      });
    }
    const groups = { ...empty };
    for (const g of GROUPS) {
      let err = 0;
      let conf = 1;
      BONES.forEach((bone, i) => {
        if (bone.group !== g) return;
        err = Math.max(err, sums[i].w > 0 ? sums[i].err / sums[i].w : 0);
        conf = Math.min(conf, sums[i].conf / inWindow.length);
      });
      groups[g] = { err, conf };
    }
    return { beat, offsetMs: offset * 1000, timingKnown, groups, frames: inWindow.length };
  });
}

/** The dancer's pose closest to a media time, or null if none is near. */
export function frameNear(frames: PoseFrame[], t: number, within = 0.15): Pose | null {
  let best: PoseFrame | null = null;
  for (const f of frames) {
    if (!best || Math.abs(f.t - t) < Math.abs(best.t - t)) best = f;
  }
  return best && Math.abs(best.t - t) <= within ? best.p : null;
}
