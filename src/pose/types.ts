// A pose is 13 joints, stored flat as [x, y, visibility] per joint.
// Coordinates are in "height units": y runs 0 (top) to 1 (bottom) and x runs
// 0 to `aspect` (width / height), so distances are the same in both axes.
// Left and right always mean the person's own left and right.

export const J = {
  NOSE: 0,
  L_SHOULDER: 1,
  R_SHOULDER: 2,
  L_ELBOW: 3,
  R_ELBOW: 4,
  L_WRIST: 5,
  R_WRIST: 6,
  L_HIP: 7,
  R_HIP: 8,
  L_KNEE: 9,
  R_KNEE: 10,
  L_ANKLE: 11,
  R_ANKLE: 12,
} as const;

export const JOINT_COUNT = 13;

/** Index of each of our joints in MediaPipe's 33-landmark pose output. */
export const MEDIAPIPE_INDEX = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

export type Pose = number[];

export interface PoseFrame {
  /** Media time in seconds. */
  t: number;
  p: Pose;
}

export interface PoseTrack {
  /** Width / height of the source the poses were measured in. */
  aspect: number;
  fps: number;
  /** Media time of the first frame. */
  t0: number;
  frames: Pose[];
}

export type GroupId = 'left_arm' | 'right_arm' | 'left_leg' | 'right_leg' | 'torso';
export const GROUPS: GroupId[] = ['left_arm', 'right_arm', 'left_leg', 'right_leg', 'torso'];

export type BoneId =
  | 'l_upper_arm'
  | 'l_forearm'
  | 'r_upper_arm'
  | 'r_forearm'
  | 'l_thigh'
  | 'l_shin'
  | 'r_thigh'
  | 'r_shin'
  | 'torso';

export interface Bone {
  id: BoneId;
  group: GroupId;
  /** Joint indices, or -1 for the torso bone (mid-hip to mid-shoulder). */
  a: number;
  b: number;
}

export const BONES: Bone[] = [
  { id: 'l_upper_arm', group: 'left_arm', a: J.L_SHOULDER, b: J.L_ELBOW },
  { id: 'l_forearm', group: 'left_arm', a: J.L_ELBOW, b: J.L_WRIST },
  { id: 'r_upper_arm', group: 'right_arm', a: J.R_SHOULDER, b: J.R_ELBOW },
  { id: 'r_forearm', group: 'right_arm', a: J.R_ELBOW, b: J.R_WRIST },
  { id: 'l_thigh', group: 'left_leg', a: J.L_HIP, b: J.L_KNEE },
  { id: 'l_shin', group: 'left_leg', a: J.L_KNEE, b: J.L_ANKLE },
  { id: 'r_thigh', group: 'right_leg', a: J.R_HIP, b: J.R_KNEE },
  { id: 'r_shin', group: 'right_leg', a: J.R_KNEE, b: J.R_ANKLE },
  { id: 'torso', group: 'torso', a: -1, b: -1 },
];

export function mirrorGroup(g: GroupId): GroupId {
  switch (g) {
    case 'left_arm':
      return 'right_arm';
    case 'right_arm':
      return 'left_arm';
    case 'left_leg':
      return 'right_leg';
    case 'right_leg':
      return 'left_leg';
    default:
      return g;
  }
}
