import { PoseTrack } from '../pose/types';
import { listImported } from './store';
import { buildSyntheticLesson } from './synthetic';
import { Lesson, LessonMeta } from './types';

const BASE = `${import.meta.env.BASE_URL}lessons`;

async function json<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Routines added from videos in this browser, then any lessons shipped in
 * public/lessons, then the built-in practice figure. A shipped lesson folder
 * holds lesson.json, poses.json and a video; public/lessons/index.json lists
 * the folder names.
 */
export async function loadLessons(): Promise<Lesson[]> {
  const lessons: Lesson[] = await listImported();
  const ids = (await json<string[]>(`${BASE}/index.json`)) ?? [];
  for (const id of ids) {
    const meta = await json<LessonMeta>(`${BASE}/${id}/lesson.json`);
    const poses = await json<PoseTrack>(`${BASE}/${id}/poses.json`);
    if (!meta || !poses) continue;
    lessons.push({ ...meta, id, poses, videoUrl: meta.video ? `${BASE}/${id}/${meta.video}` : undefined, source: 'bundled' });
  }
  lessons.push(buildSyntheticLesson());
  return lessons;
}
