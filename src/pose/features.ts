import { BONES, Bone, J, JOINT_COUNT, Pose, PoseTrack } from './types';

export interface Vec {
  x: number;
  y: number;
}

export const jx = (p: Pose, j: number) => p[j * 3];
export const jy = (p: Pose, j: number) => p[j * 3 + 1];
export const jv = (p: Pose, j: number) => p[j * 3 + 2];
export const joint = (p: Pose, j: number): Vec => ({ x: p[j * 3], y: p[j * 3 + 1] });

export function mid(p: Pose, a: number, b: number): Vec {
  return { x: (jx(p, a) + jx(p, b)) / 2, y: (jy(p, a) + jy(p, b)) / 2 };
}

export const midHip = (p: Pose) => mid(p, J.L_HIP, J.R_HIP);
export const midShoulder = (p: Pose) => mid(p, J.L_SHOULDER, J.R_SHOULDER);

export function torsoLength(p: Pose): number {
  const h = midHip(p);
  const s = midShoulder(p);
  return Math.hypot(s.x - h.x, s.y - h.y) || 1e-6;
}

const SWAP = [
  [J.L_SHOULDER, J.R_SHOULDER],
  [J.L_ELBOW, J.R_ELBOW],
  [J.L_WRIST, J.R_WRIST],
  [J.L_HIP, J.R_HIP],
  [J.L_KNEE, J.R_KNEE],
  [J.L_ANKLE, J.R_ANKLE],
];

/** Flip a pose left-to-right, as if seen in a mirror: x is reflected and left/right joints swap. */
export function mirrorPose(p: Pose, aspect: number): Pose {
  const out = p.slice();
  for (let j = 0; j < JOINT_COUNT; j++) out[j * 3] = aspect - p[j * 3];
  for (const [a, b] of SWAP) {
    for (let k = 0; k < 3; k++) {
      const tmp = out[a * 3 + k];
      out[a * 3 + k] = out[b * 3 + k];
      out[b * 3 + k] = tmp;
    }
  }
  return out;
}

export function lerpPose(a: Pose, b: Pose, u: number): Pose {
  const out = new Array<number>(a.length);
  for (let i = 0; i < a.length; i++) {
    // Visibility takes the weaker of the two frames.
    out[i] = i % 3 === 2 ? Math.min(a[i], b[i]) : a[i] + (b[i] - a[i]) * u;
  }
  return out;
}

/** Pose at media time t, interpolated between stored frames and clamped at the ends. */
export function samplePose(track: PoseTrack, t: number): Pose {
  const f = (t - track.t0) * track.fps;
  const last = track.frames.length - 1;
  if (f <= 0) return track.frames[0];
  if (f >= last) return track.frames[last];
  const i = Math.floor(f);
  return lerpPose(track.frames[i], track.frames[i + 1], f - i);
}

export interface BoneDir {
  x: number;
  y: number;
  /** Lowest visibility of the joints the bone is built from. */
  conf: number;
}

export function boneDir(p: Pose, bone: Bone): BoneDir {
  let ax: number, ay: number, bx: number, by: number, conf: number;
  if (bone.a < 0) {
    const h = midHip(p);
    const s = midShoulder(p);
    ax = h.x;
    ay = h.y;
    bx = s.x;
    by = s.y;
    conf = Math.min(jv(p, J.L_HIP), jv(p, J.R_HIP), jv(p, J.L_SHOULDER), jv(p, J.R_SHOULDER));
  } else {
    ax = jx(p, bone.a);
    ay = jy(p, bone.a);
    bx = jx(p, bone.b);
    by = jy(p, bone.b);
    conf = Math.min(jv(p, bone.a), jv(p, bone.b));
  }
  const len = Math.hypot(bx - ax, by - ay) || 1e-6;
  return { x: (bx - ax) / len, y: (by - ay) / len, conf };
}

/** Angle in degrees between two unit vectors. */
export function angleBetween(a: Vec, b: Vec): number {
  const dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y));
  return (Math.acos(dot) * 180) / Math.PI;
}

export interface BoneError {
  err: number;
  conf: number;
}

/** Angle error for every bone between a dancer pose and the target pose. */
export function boneErrors(live: Pose, target: Pose): BoneError[] {
  return BONES.map((bone) => {
    const a = boneDir(live, bone);
    const b = boneDir(target, bone);
    return { err: angleBetween(a, b), conf: Math.min(a.conf, b.conf) };
  });
}

/** Interior angle at joint b (degrees), 180 when a-b-c is a straight line. */
export function interiorAngle(p: Pose, a: number, b: number, c: number): number {
  const v1 = { x: jx(p, a) - jx(p, b), y: jy(p, a) - jy(p, b) };
  const v2 = { x: jx(p, c) - jx(p, b), y: jy(p, c) - jy(p, b) };
  const l1 = Math.hypot(v1.x, v1.y) || 1e-6;
  const l2 = Math.hypot(v2.x, v2.y) || 1e-6;
  return angleBetween({ x: v1.x / l1, y: v1.y / l1 }, { x: v2.x / l2, y: v2.y / l2 });
}

/** Move and scale `target` so its hips sit on the dancer's hips and its torso matches theirs. */
export function fitToBody(target: Pose, dancer: Pose): Pose {
  const th = midHip(target);
  const dh = midHip(dancer);
  const scale = torsoLength(dancer) / torsoLength(target);
  const out = target.slice();
  for (let j = 0; j < JOINT_COUNT; j++) {
    out[j * 3] = dh.x + (target[j * 3] - th.x) * scale;
    out[j * 3 + 1] = dh.y + (target[j * 3 + 1] - th.y) * scale;
  }
  return out;
}
