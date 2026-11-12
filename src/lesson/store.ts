// Routines the dancer added from their own videos, kept in the browser's
// database (IndexedDB) together with the video itself.

import { PoseTrack } from '../pose/types';
import { Lesson, LessonMeta } from './types';

interface StoredLesson {
  id: string;
  meta: LessonMeta;
  poses: PoseTrack;
  video: Blob;
  createdAt: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('dancetutor', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('lessons', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction('lessons', mode);
        const req = fn(tx.objectStore('lessons'));
        tx.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

const toLesson = (s: StoredLesson): Lesson => ({
  ...s.meta,
  id: s.id,
  poses: s.poses,
  videoUrl: URL.createObjectURL(s.video),
  source: 'imported',
});

export async function saveImported(meta: LessonMeta, poses: PoseTrack, video: Blob): Promise<Lesson> {
  const stored: StoredLesson = { id: meta.id, meta, poses, video, createdAt: Date.now() };
  await run('readwrite', (s) => s.put(stored));
  return toLesson(stored);
}

export async function listImported(): Promise<Lesson[]> {
  try {
    const all = await run<StoredLesson[]>('readonly', (s) => s.getAll());
    return all.sort((a, b) => b.createdAt - a.createdAt).map(toLesson);
  } catch {
    // No database available (some private windows): just show the other routines.
    return [];
  }
}

export async function deleteImported(id: string): Promise<void> {
  await run('readwrite', (s) => s.delete(id));
}
