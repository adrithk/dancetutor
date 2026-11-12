import { evaluateAttempt } from '../src/coach/compare';
import { judge, updateStreaks } from '../src/coach/select';
import { buildSyntheticLesson } from '../src/lesson/synthetic';
import { beatDur, beatTime } from '../src/lesson/types';
import { mirrorPose, samplePose } from '../src/pose/features';
import { SimScenario, SimulatedDancer } from '../src/pose/simulated';
import { GroupId, PoseFrame } from '../src/pose/types';

export const lesson = buildSyntheticLesson();
export const grid = { bpm: lesson.bpm, firstBeatSec: lesson.firstBeatSec };
export const refAt = (t: number) => mirrorPose(samplePose(lesson.poses, t), lesson.poses.aspect);

/** Dance beats [from, to) with a simulated dancer and return the recorded frames. */
export function dance(dancer: SimulatedDancer, from: number, to: number, speed = 1): PoseFrame[] {
  const dur = beatDur(grid);
  const frames: PoseFrame[] = [];
  const start = beatTime(grid, from) - dur / 2;
  const end = beatTime(grid, to - 1) + dur / 2;
  // 30 camera frames per real second.
  for (let t = start; t < end; t += speed / 30) frames.push({ t, p: dancer.poseAt(t, speed, refAt) });
  return frames;
}

export function attempt(
  dancer: SimulatedDancer,
  from: number,
  to: number,
  streaks: Map<string, number>,
  speed = 1,
  focus?: GroupId[],
) {
  const frames = dance(dancer, from, to, speed);
  const beats = Array.from({ length: to - from }, (_, i) => from + i);
  const results = evaluateAttempt(refAt, frames, beats, grid);
  const judgement = judge(results, { grid, notes: lesson.notes, mirror: true, refAt, frames, focus, streaks });
  updateStreaks(streaks, results, judgement.issues);
  return { results, judgement };
}

export const scenario = (s: Partial<SimScenario>): SimScenario => ({ faults: [], lateBeatsAtTempo: 0, noiseDeg: 0, ...s });
