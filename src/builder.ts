// Lesson builder: tracks a reference video and produces the lesson.json and
// poses.json files for a lesson folder, so a routine can be shared in the repo.

import './styles.css';
import './builder.css';
import { LessonMeta } from './lesson/types';
import { trackVideo } from './lesson/track';
import { COLORS, drawFigure, prepareCanvas } from './ui/draw';

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
    const { poses, missed, total } = await trackVideo(video, { from: 0, to: video.duration }, (progress, pose) => {
      if (pose) {
        const c = prepareCanvas(overlay);
        if (c) drawFigure(c.ctx, pose, c.h, { color: () => COLORS.good, weight: 0.08, minVisibility: 0.4, outline: true });
      }
      status.textContent = `Tracking… ${Math.round(progress * 100)}%`;
    });

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
