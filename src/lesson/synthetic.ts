// A built-in routine defined as one key pose per count, so the app works
// without any video. The reference is drawn as a figure and the music is a
// synthesised beat. Angles are degrees from "hanging straight down":
// positive swings the limb out to the side and up, negative crosses the body.

import { J, JOINT_COUNT, Pose, PoseTrack } from '../pose/types';
import { Lesson } from './types';

interface KeyPose {
  /** [upper arm, forearm] */
  la: [number, number];
  ra: [number, number];
  /** [thigh, shin] */
  ll: [number, number];
  rl: [number, number];
  /** Torso lean, positive toward the figure's left. */
  lean?: number;
  /** Extra hip drop, for a bend of the knees. */
  drop?: number;
}

const DOWN: [number, number] = [8, 8];
const SIDE: [number, number] = [90, 90];
const UP: [number, number] = [172, 172];
const V_UP: [number, number] = [145, 145];
const V_DOWN: [number, number] = [45, 45];
const HIP: [number, number] = [50, -65];
const POST_UP: [number, number] = [90, 180];
const POST_DOWN: [number, number] = [90, 0];
const CROSS: [number, number] = [25, -115];
const DIAG_UP: [number, number] = [135, 135];
const DIAG_DOWN: [number, number] = [45, 45];

const TOGETHER: [number, number] = [3, 3];
const OUT: [number, number] = [22, 16];
const WIDE: [number, number] = [14, 10];
const KNEE: [number, number] = [55, -8];
const BEND: [number, number] = [28, -6];

const REST: KeyPose = { la: DOWN, ra: DOWN, ll: TOGETHER, rl: TOGETHER };

const ROUTINE: KeyPose[] = [
  // Counts 1-8
  { la: DOWN, ra: SIDE, ll: TOGETHER, rl: OUT },
  { la: SIDE, ra: SIDE, ll: TOGETHER, rl: TOGETHER },
  { la: V_UP, ra: V_UP, ll: OUT, rl: TOGETHER },
  { la: HIP, ra: UP, ll: TOGETHER, rl: TOGETHER },
  { la: POST_UP, ra: POST_UP, ll: WIDE, rl: WIDE },
  { la: POST_DOWN, ra: POST_DOWN, ll: WIDE, rl: WIDE },
  { la: DIAG_UP, ra: DIAG_DOWN, ll: OUT, rl: TOGETHER, lean: -8 },
  { la: DIAG_DOWN, ra: DIAG_UP, ll: TOGETHER, rl: OUT, lean: 8 },
  // Counts 9-16
  { la: SIDE, ra: SIDE, ll: WIDE, rl: WIDE },
  { la: CROSS, ra: CROSS, ll: TOGETHER, rl: TOGETHER },
  { la: HIP, ra: UP, ll: TOGETHER, rl: KNEE },
  { la: UP, ra: HIP, ll: KNEE, rl: TOGETHER },
  { la: V_DOWN, ra: V_DOWN, ll: BEND, rl: BEND, drop: 0.035 },
  { la: V_UP, ra: V_UP, ll: TOGETHER, rl: TOGETHER },
  { la: POST_UP, ra: POST_UP, ll: WIDE, rl: WIDE, lean: 10 },
  { la: POST_UP, ra: POST_UP, ll: WIDE, rl: WIDE, lean: -10 },
  // Counts 17-24
  { la: SIDE, ra: CROSS, ll: OUT, rl: TOGETHER },
  { la: CROSS, ra: SIDE, ll: TOGETHER, rl: OUT },
  { la: UP, ra: UP, ll: TOGETHER, rl: TOGETHER },
  { la: SIDE, ra: SIDE, ll: TOGETHER, rl: TOGETHER },
  { la: V_UP, ra: HIP, ll: TOGETHER, rl: OUT },
  { la: HIP, ra: V_UP, ll: OUT, rl: TOGETHER },
  { la: HIP, ra: HIP, ll: WIDE, rl: WIDE },
  { la: [60, 60], ra: [60, 60], ll: TOGETHER, rl: TOGETHER },
  // Counts 25-32
  { la: SIDE, ra: SIDE, ll: OUT, rl: TOGETHER },
  { la: V_UP, ra: V_UP, ll: TOGETHER, rl: TOGETHER },
  { la: SIDE, ra: SIDE, ll: TOGETHER, rl: OUT },
  { la: V_UP, ra: V_UP, ll: TOGETHER, rl: TOGETHER },
  { la: POST_DOWN, ra: POST_DOWN, ll: BEND, rl: BEND, drop: 0.035 },
  { la: POST_UP, ra: POST_UP, ll: TOGETHER, rl: TOGETHER },
  { la: DIAG_DOWN, ra: DIAG_UP, ll: WIDE, rl: WIDE, lean: 8 },
  { la: V_UP, ra: V_UP, ll: WIDE, rl: WIDE },
];

const ASPECT = 4 / 3;
const FPS = 30;
const BODY = {
  hipY: 0.56,
  torso: 0.22,
  shoulderHalf: 0.078,
  hipHalf: 0.048,
  upperArm: 0.125,
  forearm: 0.115,
  thigh: 0.18,
  shin: 0.18,
  head: 0.075,
};

const rad = (deg: number) => (deg * Math.PI) / 180;

function numbers(k: KeyPose): number[] {
  return [...k.la, ...k.ra, ...k.ll, ...k.rl, k.lean ?? 0, k.drop ?? 0];
}

function buildPose(v: number[]): Pose {
  const [la0, la1, ra0, ra1, ll0, ll1, rl0, rl1, lean, drop] = v;
  const p = new Array<number>(JOINT_COUNT * 3).fill(1);
  const set = (j: number, x: number, y: number) => {
    p[j * 3] = x;
    p[j * 3 + 1] = y;
  };
  const cx = ASPECT / 2;
  const hipY = BODY.hipY + drop;
  // Torso direction, from hips up to shoulders. The figure faces the camera,
  // so its left side is on the right of the image (+x).
  const ux = Math.sin(rad(lean));
  const uy = -Math.cos(rad(lean));
  const sx = cx + ux * BODY.torso;
  const sy = hipY + uy * BODY.torso;
  // Shoulder line is perpendicular to the torso.
  const px = -uy;
  const py = ux;

  const limb = (
    side: 1 | -1,
    rootX: number,
    rootY: number,
    a0: number,
    a1: number,
    len0: number,
    len1: number,
    j0: number,
    j1: number,
    j2: number,
  ) => {
    set(j0, rootX, rootY);
    const mx = rootX + Math.sin(rad(a0)) * side * len0;
    const my = rootY + Math.cos(rad(a0)) * len0;
    set(j1, mx, my);
    set(j2, mx + Math.sin(rad(a1)) * side * len1, my + Math.cos(rad(a1)) * len1);
  };

  limb(1, sx + px * BODY.shoulderHalf, sy + py * BODY.shoulderHalf, la0, la1, BODY.upperArm, BODY.forearm, J.L_SHOULDER, J.L_ELBOW, J.L_WRIST);
  limb(-1, sx - px * BODY.shoulderHalf, sy - py * BODY.shoulderHalf, ra0, ra1, BODY.upperArm, BODY.forearm, J.R_SHOULDER, J.R_ELBOW, J.R_WRIST);
  limb(1, cx + BODY.hipHalf, hipY, ll0, ll1, BODY.thigh, BODY.shin, J.L_HIP, J.L_KNEE, J.L_ANKLE);
  limb(-1, cx - BODY.hipHalf, hipY, rl0, rl1, BODY.thigh, BODY.shin, J.R_HIP, J.R_KNEE, J.R_ANKLE);
  set(J.NOSE, sx + ux * BODY.head, sy + uy * BODY.head);
  return p;
}

const smooth = (u: number) => u * u * (3 - 2 * u);

/** Hold the previous pose, then move so the new pose lands exactly on its count. */
function poseAtBeat(keys: number[][], rest: number[], beatPos: number): Pose {
  const next = Math.ceil(beatPos);
  const frac = beatPos - (next - 1);
  const from = next - 1 < 0 ? rest : keys[Math.min(next - 1, keys.length - 1)];
  const to = next < 0 ? rest : keys[Math.min(next, keys.length - 1)];
  const u = smooth(Math.max(0, Math.min(1, (frac - 0.4) / 0.6)));
  return buildPose(from.map((a, i) => a + (to[i] - a) * u));
}

export function buildSyntheticLesson(): Lesson {
  const bpm = 100;
  const firstBeatSec = 0;
  const beat = 60 / bpm;
  const keys = ROUTINE.map(numbers);
  const rest = numbers(REST);
  const t0 = -8 * beat;
  const tEnd = (ROUTINE.length + 2) * beat;
  const frames: Pose[] = [];
  for (let i = 0; t0 + i / FPS <= tEnd; i++) {
    const t = t0 + i / FPS;
    frames.push(poseAtBeat(keys, rest, (t - firstBeatSec) / beat));
  }
  const poses: PoseTrack = { aspect: ASPECT, fps: FPS, t0, frames };
  return {
    id: 'first-steps',
    title: 'First Steps',
    style: 'Practice figure',
    level: 'Beginner',
    description: 'An animated figure with no video, for trying the app. Thirty-two counts of arm shapes and steps in place.',
    bpm,
    firstBeatSec,
    counts: ROUTINE.length,
    notes: [
      { count: 'all', group: 'torso', importance: 'free' },
      { count: 4, group: 'right_arm', importance: 'essential', cue: 'The {right} arm finishes straight up, right beside your ear.' },
      { count: 4, group: 'left_arm', cue: 'The {left} hand lands on your hip.' },
      { count: 5, group: 'left_arm', importance: 'essential', cue: 'Elbows level with your shoulders, like a goalpost.' },
      { count: 5, group: 'right_arm', importance: 'essential', cue: 'Elbows level with your shoulders, like a goalpost.' },
      { count: 7, group: 'torso', importance: 'normal', cue: 'Let your body tip toward the low arm.' },
      { count: 8, group: 'torso', importance: 'normal', cue: 'Let your body tip toward the low arm.' },
      { count: 11, group: 'right_leg', importance: 'essential', cue: 'Lift the knee to hip height.' },
      { count: 12, group: 'left_leg', importance: 'essential', cue: 'Lift the knee to hip height.' },
      { count: 13, group: 'left_leg', cue: 'Sit into the bend, knees out.' },
      { count: 13, group: 'right_leg', cue: 'Sit into the bend, knees out.' },
      { count: 32, group: 'left_arm', importance: 'essential', cue: 'Finish big: both arms high and wide.' },
      { count: 32, group: 'right_arm', importance: 'essential', cue: 'Finish big: both arms high and wide.' },
    ],
    poses,
    source: 'builtin',
  };
}
