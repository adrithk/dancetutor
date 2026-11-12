// The lesson plan: which part of the routine to practise next, and how fast.
// It follows the add-on method used in dance classes: learn four counts,
// learn the next four, join them into an eight, link eights, run from the top.

import { PACING, Pace } from '../config';
import { GroupId } from '../pose/types';
import { Issue } from './select';

export type StepKind = 'learn' | 'join' | 'link' | 'top' | 'review';

export interface Step {
  id: string;
  kind: StepKind;
  /** Beat range, `to` exclusive. Beat 0 is count 1. */
  from: number;
  to: number;
}

export function buildPlan(counts: number, segmentCounts = 4, phraseCounts = 8): Step[] {
  const steps: Step[] = [];
  const phrases: { from: number; to: number }[] = [];
  for (let from = 0; from < counts; from += phraseCounts) {
    phrases.push({ from, to: Math.min(counts, from + phraseCounts) });
  }
  phrases.forEach((ph, i) => {
    const segments: { from: number; to: number }[] = [];
    for (let from = ph.from; from < ph.to; from += segmentCounts) {
      segments.push({ from, to: Math.min(ph.to, from + segmentCounts) });
    }
    for (const s of segments) steps.push({ id: `learn-${s.from}`, kind: 'learn', ...s });
    if (segments.length > 1) steps.push({ id: `join-${ph.from}`, kind: 'join', ...ph });
    if (i >= 2) steps.push({ id: `link-${ph.from}`, kind: 'link', from: phrases[i - 1].from, to: ph.to });
    if (i >= 1) steps.push({ id: `top-${ph.to}`, kind: 'top', from: 0, to: ph.to });
  });
  return steps;
}

export interface Drill {
  from: number;
  to: number;
  /** The limb that kept going wrong. */
  group: GroupId;
  /** Limbs judged during the drill: both arms, both legs, or the body. */
  focus: GroupId[];
  key: string;
  tries: number;
}

export interface Activity {
  step: Step;
  stepIndex: number;
  from: number;
  to: number;
  speed: number;
  music: boolean;
  drill: Drill | null;
  /** True before the first attempt at a step. */
  fresh: boolean;
}

export type Outcome =
  | 'repeat'
  | 'slow-down'
  | 'drill-start'
  | 'drill-pass'
  | 'drill-end'
  | 'speed-up'
  | 'lock-in'
  | 'advance'
  | 'moved-on'
  | 'finished';

export interface Report {
  outcome: Outcome;
  /** The step just completed or left, when the plan moved forward. */
  left?: Step;
  next: Activity | null;
}

const ARMS: GroupId[] = ['left_arm', 'right_arm'];
const LEGS: GroupId[] = ['left_leg', 'right_leg'];

export class Planner {
  steps: Step[];
  index = 0;
  /** Step ids the dancer could not get clean yet. */
  shaky = new Set<string>();
  done = new Set<string>();
  private rung: number;
  private passesAtTop = 0;
  private failsInRow = 0;
  private attempts = 0;
  private lastKey: string | null = null;
  private sameKeyRuns = 0;
  private drilled = new Set<string>();
  private drill: Drill | null = null;
  private pace: (typeof PACING)['full'];

  constructor(steps: Step[], pace: Pace = 'full') {
    this.steps = steps.slice();
    this.pace = PACING[pace];
    this.rung = this.startRung();
  }

  get finished() {
    return this.index >= this.steps.length;
  }

  private startRung() {
    const step = this.steps[this.index];
    if (!step) return 0;
    return step.kind === 'learn' || step.kind === 'review' ? this.pace.learnStartRung : this.pace.joinStartRung;
  }

  current(): Activity | null {
    const step = this.steps[this.index];
    if (!step) return null;
    if (this.drill) {
      return { step, stepIndex: this.index, from: this.drill.from, to: this.drill.to, speed: PACING.drillSpeed, music: false, drill: this.drill, fresh: false };
    }
    const speed = this.pace.rungs[this.rung];
    return { step, stepIndex: this.index, from: step.from, to: step.to, speed, music: speed >= 0.75, drill: null, fresh: this.attempts === 0 };
  }

  /** Record the result of an attempt and decide what happens next. */
  report(passed: boolean, correction: Issue | null): Report {
    const step = this.steps[this.index];
    if (!step) return { outcome: 'finished', next: null };

    if (this.drill) {
      this.drill.tries++;
      if (passed || this.drill.tries >= PACING.drillMaxTries) {
        this.drill = null;
        this.failsInRow = 0;
        this.sameKeyRuns = 0;
        this.lastKey = null;
        return { outcome: passed ? 'drill-pass' : 'drill-end', next: this.current() };
      }
      return { outcome: 'repeat', next: this.current() };
    }

    this.attempts++;
    if (passed) {
      this.failsInRow = 0;
      this.sameKeyRuns = 0;
      this.lastKey = null;
      if (this.rung < this.pace.rungs.length - 1) {
        this.rung++;
        return { outcome: 'speed-up', next: this.current() };
      }
      this.passesAtTop++;
      if (this.passesAtTop < this.pace.passesToAdvance) return { outcome: 'lock-in', next: this.current() };
      this.done.add(step.id);
      this.shaky.delete(step.id);
      return this.advance('advance', step);
    }

    this.passesAtTop = 0;
    this.failsInRow++;
    const key = correction?.key ?? null;
    this.sameKeyRuns = key && key === this.lastKey ? this.sameKeyRuns + 1 : 1;
    this.lastKey = key;

    if (correction?.kind === 'shape' && this.sameKeyRuns >= PACING.drillAfterRepeats && !this.drilled.has(correction.key)) {
      this.drilled.add(correction.key);
      let from = Math.max(step.from, correction.beat - 1);
      const to = Math.min(step.to, from + 2);
      from = Math.max(step.from, to - 2);
      const focus = ARMS.includes(correction.group) ? ARMS : LEGS.includes(correction.group) ? LEGS : [correction.group];
      this.drill = { from, to, group: correction.group, focus, key: correction.key, tries: 0 };
      return { outcome: 'drill-start', next: this.current() };
    }

    if (this.attempts >= PACING.maxAttemptsPerStep) {
      this.shaky.add(step.id);
      const isLast = this.index === this.steps.length - 1;
      if (step.kind === 'learn' && !isLast) {
        // Come back to it just before the final run-through.
        this.steps.splice(this.steps.length - 1, 0, { ...step, id: `review-${step.from}`, kind: 'review' });
      }
      return this.advance('moved-on', step);
    }

    if (this.failsInRow >= PACING.failsBeforeSlowing && this.rung > 0) {
      this.rung--;
      this.failsInRow = 0;
      return { outcome: 'slow-down', next: this.current() };
    }
    return { outcome: 'repeat', next: this.current() };
  }

  /** Skip the current step without passing it. */
  skip(): Report {
    const step = this.steps[this.index];
    if (!step) return { outcome: 'finished', next: null };
    this.drill = null;
    this.shaky.add(step.id);
    return this.advance('moved-on', step);
  }

  private advance(outcome: 'advance' | 'moved-on', left: Step): Report {
    this.index++;
    this.rung = this.startRung();
    this.passesAtTop = 0;
    this.failsInRow = 0;
    this.attempts = 0;
    this.lastKey = null;
    this.sameKeyRuns = 0;
    this.drilled.clear();
    if (this.finished) return { outcome: 'finished', left, next: null };
    return { outcome, left, next: this.current() };
  }
}
