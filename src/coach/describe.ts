// Turns "this limb is off" into "this is how it is off", by comparing where
// the hand or foot ended up relative to the body.

import { interiorAngle, jx, jy, midHip, midShoulder, torsoLength } from '../pose/features';
import { GroupId, J, Pose } from '../pose/types';

export type Fix =
  | 'higher'
  | 'lower'
  | 'wider'
  | 'closer'
  | 'bend'
  | 'straighten'
  | 'lean_left'
  | 'lean_right'
  | 'upright'
  | 'match';

export interface ShapeDetail {
  fix: Fix;
  /** How far past the threshold the difference is; 1 is just noticeable. */
  size: number;
}

const LIMBS: Record<Exclude<GroupId, 'torso'>, { root: number; mid: number; end: number; out: 1 | -1 }> = {
  // A dancer facing the camera has their left side on the right of the image.
  left_arm: { root: J.L_SHOULDER, mid: J.L_ELBOW, end: J.L_WRIST, out: 1 },
  right_arm: { root: J.R_SHOULDER, mid: J.R_ELBOW, end: J.R_WRIST, out: -1 },
  left_leg: { root: J.L_HIP, mid: J.L_KNEE, end: J.L_ANKLE, out: 1 },
  right_leg: { root: J.R_HIP, mid: J.R_KNEE, end: J.R_ANKLE, out: -1 },
};

function leanDeg(p: Pose): number {
  const h = midHip(p);
  const s = midShoulder(p);
  return (Math.atan2(s.x - h.x, -(s.y - h.y)) * 180) / Math.PI;
}

/** Describe what the dancer should change so `live` matches `target` for one limb. */
export function describeFix(group: GroupId, live: Pose, target: Pose): ShapeDetail {
  if (group === 'torso') {
    const l = leanDeg(live);
    const t = leanDeg(target);
    const diff = t - l;
    const size = Math.abs(diff) / 8;
    if (Math.abs(t) < 4) return { fix: 'upright', size };
    return { fix: diff > 0 ? 'lean_left' : 'lean_right', size };
  }
  const limb = LIMBS[group];
  const rel = (p: Pose) => {
    const scale = torsoLength(p);
    return {
      out: ((jx(p, limb.end) - jx(p, limb.root)) * limb.out) / scale,
      down: (jy(p, limb.end) - jy(p, limb.root)) / scale,
      joint: interiorAngle(p, limb.root, limb.mid, limb.end),
    };
  };
  const a = rel(live);
  const b = rel(target);
  const vertical: ShapeDetail = { fix: a.down > b.down ? 'higher' : 'lower', size: Math.abs(a.down - b.down) / 0.22 };
  const sideways: ShapeDetail = { fix: a.out > b.out ? 'closer' : 'wider', size: Math.abs(a.out - b.out) / 0.22 };
  const joint: ShapeDetail = { fix: a.joint > b.joint ? 'bend' : 'straighten', size: Math.abs(a.joint - b.joint) / 30 };
  // A limb at the wrong height usually reads as "too far out" as well. Height is
  // the cue a teacher would give, so prefer it unless sideways clearly dominates.
  if (vertical.size >= 1 && sideways.size < vertical.size * 2.5 && joint.size < vertical.size * 1.5) return vertical;
  const options = [vertical, sideways, joint];
  options.sort((x, y) => y.size - x.size);
  return options[0].size >= 1 ? options[0] : { fix: 'match', size: options[0].size };
}
