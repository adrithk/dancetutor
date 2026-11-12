// Copies the MediaPipe WASM runtime into public/ and downloads the pose model,
// so the app runs without reaching a CDN (useful on hackathon wifi).
//   node scripts/setup-pose.mjs            -> wasm + model
//   node scripts/setup-pose.mjs --wasm-only -> wasm only (runs on npm install)
import { cp, mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const wasmDst = join(root, 'public/mediapipe/wasm');
const modelDst = join(root, 'public/models/pose_landmarker_lite.task');
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task';

const exists = (p) => access(p).then(() => true, () => false);

if (await exists(wasmSrc)) {
  await mkdir(wasmDst, { recursive: true });
  await cp(wasmSrc, wasmDst, { recursive: true });
  console.log('pose: copied wasm runtime to public/mediapipe/wasm');
} else {
  console.log('pose: @mediapipe/tasks-vision not installed yet, skipping wasm copy');
}

if (!process.argv.includes('--wasm-only')) {
  if (await exists(modelDst)) {
    console.log('pose: model already present');
  } else {
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`model download failed: ${res.status}`);
    await mkdir(dirname(modelDst), { recursive: true });
    await writeFile(modelDst, Buffer.from(await res.arrayBuffer()));
    console.log('pose: downloaded model to public/models');
  }
}
