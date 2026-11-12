// A stand-in dancer for development, tests and backup demos: it copies the
// reference with configurable mistakes that go away as the teacher corrects them.

import { beatDur, beatTime, BeatGrid } from '../lesson/types';
import { GroupId, J, Pose, mirrorGroup } from './types';

export interface Fault {
  /** Beat index the mistake happens on. */
  beat: number;
  /** The limb, named by the choreographer's side (as in lesson notes). */
  group: GroupId;
  /** How far the limb is rotated away from the target, in degrees. Positive drops an arm. */
  deltaDeg: number;
  /** Corrections of this limb needed before the dancer fixes it. */
  fixAfter: number;
}

export interface SimScenario {
  faults: Fault[];
  /** Lateness in beats when dancing at full tempo, until corrected once. */
  lateBeatsAtTempo: number;
  /** Random wobble in degrees, to resemble tracking noise. */
  noiseDeg: number;
}

export const DEFAULT_SCENARIO: SimScenario = {
  faults: [
    // Count 4: the arm that should be straight up is low.
    { beat: 3, group: 'right_arm', deltaDeg: 48, fixAfter: 2 },
    // Count 7: the high diagonal arm is low.
    { beat: 6, group: 'left_arm', deltaDeg: 38, fixAfter: 1 },
    // Count 11: the knee lift is not high enough.
    { beat: 10, group: 'right_leg', deltaDeg: 34, fixAfter: 1 },
  ],
  lateBeatsAtTempo: 0.38,
  noiseDeg: 2,
};

const CHAIN: Record<Exclude<GroupId, 'torso'>, [number, number, number]> = {
  left_arm: [J.L_SHOULDER, J.L_ELBOW, J.L_WRIST],
  right_arm: [J.R_SHOULDER, J.R_ELBOW, J.R_WRIST],
  left_leg: [J.L_HIP, J.L_KNEE, J.L_ANKLE],
  right_leg: [J.R_HIP, J.R_KNEE, J.R_ANKLE],
};

/** Rotate a limb about its root joint. Positive degrees swing it down toward the body. */
export function rotateLimb(p: Pose, group: GroupId, deg: number): Pose {
  if (group === 'torso' || deg === 0) return p;
  const [root, mid, end] = CHAIN[group];
  const out = p.slice();
  // Left limbs are on the +x side of the image, so "down" is clockwise for them.
  const sign = group.startsWith('left') ? 1 : -1;
  const a = (deg * sign * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const rx = p[root * 3];
  const ry = p[root * 3 + 1];
  for (const j of [mid, end]) {
    const dx = p[j * 3] - rx;
    const dy = p[j * 3 + 1] - ry;
    out[j * 3] = rx + dx * cos - dy * sin;
    out[j * 3 + 1] = ry + dx * sin + dy * cos;
  }
  return out;
}

export class SimulatedDancer {
  private corrections = new Map<string, number>();
  private timingCorrected = false;
  private seed = 1;

  private faults: Fault[];

  /** @param mirror true when the dancer copies the reference like a mirror image */
  constructor(
    private grid: BeatGrid,
    private scenario: SimScenario = DEFAULT_SCENARIO,
    mirror = true,
  ) {
    // Faults are written for the choreographer's limbs; map them onto the dancer's.
    this.faults = scenario.faults.map((f) => ({ ...f, group: mirror ? mirrorGroup(f.group) : f.group }));
  }

  /** Tell the dancer what the teacher just corrected, so they improve next time. */
  hear(key: string) {
    if (key.startsWith('timing')) this.timingCorrected = true;
    else this.corrections.set(key, (this.corrections.get(key) ?? 0) + 1);
  }

  private rand() {
    // Small deterministic generator so tests are repeatable.
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296 - 0.5;
  }

  /** The dancer's pose at media time t, given the target in their own frame. */
  poseAt(t: number, speed: number, refAt: (t: number) => Pose): Pose {
    const dur = beatDur(this.grid);
    const late = speed >= 1 && !this.timingCorrected ? this.scenario.lateBeatsAtTempo * dur : 0;
    const tt = t - late;
    let p = refAt(tt);
    for (const f of this.faults) {
      const heard = this.corrections.get(`${f.beat}:${f.group}`) ?? 0;
      if (heard >= f.fixAfter) continue;
      // Each correction heard takes away part of the mistake.
      const remaining = f.deltaDeg * (1 - (heard / f.fixAfter) * 0.35);
      const dist = Math.abs(tt - beatTime(this.grid, f.beat)) / dur;
      const envelope = Math.max(0, 1 - dist / 0.75);
      if (envelope > 0) p = rotateLimb(p, f.group, remaining * Math.min(1, envelope * 1.6));
    }
    if (this.scenario.noiseDeg > 0) {
      for (const g of Object.keys(CHAIN) as GroupId[]) p = rotateLimb(p, g, this.rand() * 2 * this.scenario.noiseDeg);
    }
    return p;
  }
}
