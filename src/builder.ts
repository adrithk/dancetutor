// Lesson builder: runs body tracking over a reference video, frame by frame,
// and produces the lesson.json and poses.json a lesson folder needs.

import './styles.css';
import './builder.css';
import { LessonMeta } from './lesson/types';
import { createLandmarker, toPose } from './pose/tracker';
import { Pose, PoseTrack } from './pose/types';
import { COLORS, drawFigure, prepareCanvas } from './ui/draw';

const FPS = 30;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const file = $<HTMLInputElement>('file');
const video = $<HTMLVideoElement>('video');
const overlay = $<HTMLCanvasElement>('overlay');
const box = $<HTMLDivElement>('box');
const go = $<HTMLButtonElement>('go');
const status = $<HTMLParagraphElement>('status');
const num = (id: string) => Number($<HTMLInputElement>(id).value);
const text = (id: string) => $<HTMLInputElement>(id).value.trim();

let fileName = 'reference.mp4';

file.addEventListener('change', () => {
  const f = file.files?.[0];
  if (!f) return;
  fileName = f.name;
  video.src = URL.createObjectURL(f);
  video.addEventListener(
    'loadedmetadata',
    () => {
      box.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
      go.disabled = false;
      status.textContent = `Loaded ${f.name} (${video.duration.toFixed(1)} seconds). Set the tempo and where count 1 falls, then process.`;
    },
    { once: true },
  );
});

$('mark').addEventListener('click', () => {
  $<HTMLInputElement>('first').value = video.currentTime.toFixed(2);
});

function seek(t: number): Promise<void> {
  return new Promise((resolve) => {
    video.addEventListener('seeked', () => resolve(), { once: true });
    video.currentTime = t;
  });
}

function download(anchor: HTMLAnchorElement, name: string, data: unknown) {
  anchor.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  anchor.download = name;
  anchor.textContent = `Download ${name}`;
}

go.addEventListener('click', async () => {
  go.disabled = true;
  video.pause();
  video.controls = false;
  status.textContent = 'Loading the body tracker…';
  try {
    const landmarker = await createLandmarker();
    const aspect = video.videoWidth / video.videoHeight;
    const frames: Pose[] = [];
    let last: Pose | null = null;
    let missed = 0;
    const total = Math.floor(video.duration * FPS);
    for (let i = 0; i < total; i++) {
      await seek(i / FPS);
      const result = landmarker.detectForVideo(video, (i / FPS) * 1000 + 1);
      const lm = result.landmarks[0];
      // If the dancer is lost for a frame, repeat the last pose with zero confidence.
      const pose: Pose | null = lm ? toPose(lm, aspect) : last ? last.map((v, k) => (k % 3 === 2 ? 0 : v)) : null;
      if (!lm) missed++;
      if (pose) {
        last = pose;
        const c = prepareCanvas(overlay);
        if (c) drawFigure(c.ctx, pose, c.h, { color: () => COLORS.good, weight: 0.08, minVisibility: 0.4 });
      }
      frames.push(pose ?? []);
      if (i % 10 === 0) status.textContent = `Tracking frame ${i + 1} of ${total}…`;
    }
    landmarker.close();
    // Fill any frames before the dancer was first seen.
    const firstSeen = frames.find((f) => f.length > 0);
    if (!firstSeen) throw new Error('No dancer was found in the video.');
    const filled = frames.map((f) => (f.length > 0 ? f : firstSeen.map((v, k) => (k % 3 === 2 ? 0 : v))));
    const poses: PoseTrack = { aspect, fps: FPS, t0: 0, frames: filled.map((f) => f.map((v) => Math.round(v * 10000) / 10000)) };

    const title = text('title') || 'My routine';
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'routine';
    const meta: LessonMeta = {
      id: slug,
      title,
      style: text('style'),
      level: text('level'),
      description: '',
      bpm: num('bpm'),
      firstBeatSec: num('first'),
      counts: num('counts'),
      notes: [],
      video: fileName,
    };
    download($<HTMLAnchorElement>('dl-lesson'), 'lesson.json', meta);
    download($<HTMLAnchorElement>('dl-poses'), 'poses.json', poses);
    $('slug').textContent = slug;
    $('slug2').textContent = slug;
    $('result').hidden = false;
    const pct = Math.round((missed / total) * 100);
    status.textContent = `Tracked ${total} frames. The dancer was not found in ${missed} of them (${pct}%).${pct > 10 ? ' That is a lot: check the whole body is visible throughout.' : ''}`;
  } catch (e) {
    status.textContent = `Could not process the video: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    go.disabled = false;
    video.controls = true;
  }
});
