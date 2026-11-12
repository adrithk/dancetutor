// Runs body tracking over a reference video, frame by frame, to produce the
// joint positions every attempt is compared against.

import { createLandmarker, toPose } from '../pose/tracker';
import { Pose, PoseTrack } from '../pose/types';

export interface TrackResult {
  poses: PoseTrack;
  /** Frames where no dancer was found. */
  missed: number;
  total: number;
}

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      window.clearTimeout(timer);
      video.removeEventListener('seeked', done);
      resolve();
    };
    // Some browsers skip the event when the time does not change; do not hang on it.
    const timer = window.setTimeout(done, 2000);
    video.addEventListener('seeked', done);
    video.currentTime = t;
  });
}

const blank = (p: Pose) => p.map((v, k) => (k % 3 === 2 ? 0 : v));

/**
 * Track the dancer between two media times.
 * @param onFrame called after each frame with progress (0 to 1) and the pose found, if any
 */
export async function trackVideo(
  video: HTMLVideoElement,
  range: { from: number; to: number },
  onFrame?: (progress: number, pose: Pose | null) => void,
  fps = 30,
): Promise<TrackResult> {
  const landmarker = await createLandmarker();
  try {
    video.pause();
    const aspect = video.videoWidth / video.videoHeight;
    const from = Math.max(0, range.from);
    const to = Math.min(video.duration || range.to, range.to);
    const total = Math.max(1, Math.floor((to - from) * fps));
    const frames: (Pose | null)[] = [];
    let last: Pose | null = null;
    let missed = 0;
    for (let i = 0; i < total; i++) {
      await seek(video, from + i / fps);
      // Timestamps given to the tracker must always increase.
      const result = landmarker.detectForVideo(video, performance.now());
      const lm = result.landmarks[0];
      if (lm) last = toPose(lm, aspect);
      else missed++;
      // If the dancer is lost for a frame, hold the last pose with zero confidence.
      frames.push(lm ? last : last ? blank(last) : null);
      onFrame?.((i + 1) / total, lm ? last : null);
    }
    const firstSeen = frames.find((f) => f !== null);
    if (!firstSeen) throw new Error('No dancer was found in the video.');
    const round = (p: Pose) => p.map((v) => Math.round(v * 10000) / 10000);
    return {
      poses: { aspect, fps, t0: from, frames: frames.map((f) => round(f ?? blank(firstSeen))) },
      missed,
      total,
    };
  } finally {
    landmarker.close();
  }
}

/** Fit a steady beat to taps: returns tempo and the time of the first tap. */
export function fitBeat(taps: number[]): { bpm: number; first: number } | null {
  const n = taps.length;
  if (n < 4) return null;
  const meanI = (n - 1) / 2;
  const meanT = taps.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  taps.forEach((t, i) => {
    num += (i - meanI) * (t - meanT);
    den += (i - meanI) ** 2;
  });
  const period = num / den;
  if (!(period > 0.2 && period < 2)) return null;
  return { bpm: 60 / period, first: meanT - period * meanI };
}
