// The shared library: routines shipped with the app in public/lessons.
// While running `npm run dev`, the app can add to it directly; commit the new
// folder and everyone who opens the app gets the routine preloaded.

import { PoseTrack } from '../pose/types';
import { Lesson, LessonMeta } from './types';

const BASE = `${import.meta.env.BASE_URL}lessons`;
const API = `${import.meta.env.BASE_URL}__library`;

/** True when the app is served by the dev server and can write to the library. */
export async function libraryWritable(): Promise<boolean> {
  if (!import.meta.env.DEV) return false;
  try {
    const res = await fetch(API);
    return res.ok && ((await res.json()) as { writable?: boolean }).writable === true;
  } catch {
    return false;
  }
}

export function slugify(title: string, taken: string[]): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'routine';
  let slug = base;
  for (let n = 2; taken.includes(slug); n++) slug = `${base}-${n}`;
  return slug;
}

async function put(slug: string, file: string, body: Blob | string) {
  const res = await fetch(`${API}/${slug}/${file}`, { method: 'PUT', body });
  if (!res.ok) throw new Error(`Could not save ${file} to the library (${res.status}).`);
}

export async function saveToLibrary(meta: LessonMeta, poses: PoseTrack, video: Blob, fileName: string, taken: string[]): Promise<Lesson> {
  const slug = slugify(meta.title, taken);
  const ext = (fileName.match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? 'mp4').toLowerCase();
  const stored: LessonMeta = { ...meta, id: slug, video: `video.${ext}` };
  await put(slug, stored.video!, video);
  await put(slug, 'poses.json', JSON.stringify(poses));
  await put(slug, 'lesson.json', JSON.stringify(stored, null, 2));
  return { ...stored, poses, videoUrl: `${BASE}/${slug}/${stored.video}`, source: 'bundled' };
}

export async function removeFromLibrary(id: string) {
  const res = await fetch(`${API}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Could not remove the routine (${res.status}).`);
}
