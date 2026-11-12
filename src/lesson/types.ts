import { GroupId, PoseTrack } from '../pose/types';

export type Importance = 'essential' | 'normal' | 'free';

/** A teaching note written by the choreographer. Sides are the choreographer's own left and right. */
export interface Note {
  /** Count number across the whole routine, starting at 1, or 'all'. */
  count: number | 'all';
  group: GroupId;
  importance?: Importance;
  /** Short reminder the teacher can add to a correction. Use {left} / {right} for sides. */
  cue?: string;
}

export interface LessonMeta {
  id: string;
  title: string;
  style: string;
  level: string;
  description: string;
  bpm: number;
  /** Media time, in seconds, of count 1. */
  firstBeatSec: number;
  /** Total number of counts in the routine. */
  counts: number;
  /** Counts per practice segment (default 4) and per phrase (default 8). */
  segmentCounts?: number;
  phraseCounts?: number;
  notes: Note[];
  /** Reference video, relative to the lesson folder. Omit for a pose-only lesson. */
  video?: string;
}

export interface Lesson extends LessonMeta {
  poses: PoseTrack;
  videoUrl?: string;
  /** Added in this browser, shipped in public/lessons, or the built-in practice figure. */
  source: 'imported' | 'bundled' | 'builtin';
}

export interface BeatGrid {
  bpm: number;
  firstBeatSec: number;
}

export const beatDur = (g: BeatGrid) => 60 / g.bpm;
/** Media time of a beat. Beats are 0-indexed, so beat 0 is count 1. */
export const beatTime = (g: BeatGrid, beat: number) => g.firstBeatSec + beat * beatDur(g);
/** Count number within an 8-count, 1 to 8. Works for count-in beats before beat 0. */
export const countInPhrase = (beat: number, phrase = 8) => (((beat % phrase) + phrase) % phrase) + 1;
