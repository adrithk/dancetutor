// Practice history, kept in the browser so progress survives a reload and
// first-versus-latest comparisons are possible.

import { StepKind } from '../coach/planner';
import { Level } from '../coach/select';
import { GroupId } from '../pose/types';

export interface StoredAttempt {
  stepId: string;
  kind: StepKind;
  from: number;
  to: number;
  speed: number;
  drill: boolean;
  passed: boolean;
  /** One level per count in the range. */
  levels: Level[];
  said: string;
  correction: { key: string; kind: 'shape' | 'timing'; beat: number | null; group: GroupId | null; fix: string } | null;
  at: number;
}

export interface StoredSession {
  startedAt: number;
  attempts: StoredAttempt[];
}

const key = (lessonId: string) => `dancetutor:history:${lessonId}`;

export function loadHistory(lessonId: string): StoredSession[] {
  try {
    return JSON.parse(localStorage.getItem(key(lessonId)) ?? '[]') as StoredSession[];
  } catch {
    return [];
  }
}

export function saveSession(lessonId: string, startedAt: number, attempts: StoredAttempt[]) {
  try {
    const all = loadHistory(lessonId).filter((s) => s.startedAt !== startedAt);
    all.push({ startedAt, attempts });
    localStorage.setItem(key(lessonId), JSON.stringify(all.slice(-20)));
  } catch {
    // Storage can be unavailable (private windows); practice still works without it.
  }
}

export function clearHistory(lessonId: string) {
  try {
    localStorage.removeItem(key(lessonId));
  } catch {
    // Nothing to clear.
  }
}
