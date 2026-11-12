// Live body tracking from the webcam, using MediaPipe Pose Landmarker.

import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { MEDIAPIPE_INDEX, Pose } from './types';

const LOCAL_WASM = `${import.meta.env.BASE_URL}mediapipe/wasm`;
const LOCAL_MODEL = `${import.meta.env.BASE_URL}models/pose_landmarker_lite.task`;
const REMOTE_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm';
const REMOTE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task';

async function reachable(url: string) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok && !(res.headers.get('content-type') ?? '').includes('text/html');
  } catch {
    return false;
  }
}

export async function createLandmarker(): Promise<PoseLandmarker> {
  // Prefer the copies set up by `npm run setup:pose`; fall back to the CDN.
  const local = (await reachable(LOCAL_MODEL)) && (await reachable(`${LOCAL_WASM}/vision_wasm_internal.wasm`));
  const fileset = await FilesetResolver.forVisionTasks(local ? LOCAL_WASM : REMOTE_WASM);
  const make = (delegate: 'GPU' | 'CPU') =>
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: local ? LOCAL_MODEL : REMOTE_MODEL, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
    });
  try {
    return await make('GPU');
  } catch {
    return await make('CPU');
  }
}

interface Landmark {
  x: number;
  y: number;
  visibility?: number;
}

/** Convert MediaPipe's 33 landmarks to our 13-joint pose. */
export function toPose(landmarks: Landmark[], aspect: number): Pose {
  const p: Pose = [];
  for (const i of MEDIAPIPE_INDEX) {
    const lm = landmarks[i];
    p.push(lm.x * aspect, lm.y, lm.visibility ?? 1);
  }
  return p;
}

export type PoseListener = (pose: Pose | null, perfMs: number) => void;

export class CameraTracker {
  readonly video = document.createElement('video');
  aspect = 4 / 3;
  private stream: MediaStream | null = null;
  private landmarker: PoseLandmarker | null = null;
  private running = false;
  private lastVideoTime = -1;
  listener: PoseListener | null = null;

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 960 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false,
    });
    this.video.srcObject = this.stream;
    this.video.playsInline = true;
    this.video.muted = true;
    await this.video.play();
    this.aspect = this.video.videoWidth / this.video.videoHeight || this.aspect;
    this.landmarker = await createLandmarker();
    this.running = true;
    this.loop();
  }

  private loop = () => {
    if (!this.running) return;
    const v = this.video;
    if (this.landmarker && v.readyState >= 2 && v.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = v.currentTime;
      const now = performance.now();
      try {
        const result = this.landmarker.detectForVideo(v, now);
        const lm = result.landmarks[0];
        this.listener?.(lm ? toPose(lm, this.aspect) : null, now);
      } catch {
        this.listener?.(null, now);
      }
    }
    requestAnimationFrame(this.loop);
  };

  stop() {
    this.running = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.landmarker?.close();
    this.landmarker = null;
  }
}
