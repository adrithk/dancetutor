// What the teacher says. Plain templates for now; a voice model can later
// take the same structured inputs and phrase them itself.

import { countInPhrase } from '../lesson/types';
import { GroupId } from '../pose/types';
import { Fix } from './describe';
import { Activity, Report, Step } from './planner';
import { Issue } from './select';

const WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];

export const countWord = (beat: number) => WORDS[countInPhrase(beat) - 1];
const ordinal = (i: number) => ORDINALS[i] ?? `number ${i + 1}`;

/** Spoken name for a beat range, e.g. "counts five to eight of the second eight". */
export function rangeLabel(from: number, to: number, totalCounts: number, phrase = 8): string {
  if (from === 0 && to >= totalCounts) return 'the whole routine';
  const firstPhrase = Math.floor(from / phrase);
  const lastPhrase = Math.floor((to - 1) / phrase);
  if (firstPhrase !== lastPhrase) {
    const whole = from % phrase === 0 && (to % phrase === 0 || to >= totalCounts);
    if (whole && from === 0) return `the first ${lastPhrase + 1 === 2 ? 'two' : lastPhrase + 1} eights`;
    if (whole) return `the ${ordinal(firstPhrase)} and ${ordinal(lastPhrase)} eights`;
    return `counts ${from + 1} to ${to}`;
  }
  const whole = from % phrase === 0 && (to % phrase === 0 || to >= totalCounts);
  if (whole) return `the ${ordinal(firstPhrase)} eight`;
  const span = to - from === 1 ? `count ${countWord(from)}` : `counts ${countWord(from)} to ${countWord(to - 1)}`;
  return totalCounts > phrase ? `${span} of the ${ordinal(firstPhrase)} eight` : span;
}

/** Short on-screen name for a beat range, e.g. "Eight 2 · counts 5–8". */
export function rangeShort(from: number, to: number, totalCounts: number, phrase = 8): string {
  if (from === 0 && to >= totalCounts) return 'Whole routine';
  const firstPhrase = Math.floor(from / phrase);
  const lastPhrase = Math.floor((to - 1) / phrase);
  if (firstPhrase !== lastPhrase) return `Eights ${firstPhrase + 1}–${lastPhrase + 1}`;
  const a = countInPhrase(from, phrase);
  const b = countInPhrase(to - 1, phrase);
  if (a === 1 && (b === phrase || to >= totalCounts)) return `Eight ${firstPhrase + 1}`;
  return `Eight ${firstPhrase + 1} · counts ${a}–${b}`;
}

const SIDE: Record<GroupId, string> = {
  left_arm: 'left',
  right_arm: 'right',
  left_leg: 'left',
  right_leg: 'right',
  torso: '',
};

export function groupLabel(group: GroupId): string {
  return group === 'torso' ? 'body' : group.replace('_', ' ');
}

function fixPhrase(group: GroupId, fix: Fix): string {
  const side = SIDE[group];
  if (group === 'torso') {
    if (fix === 'lean_left') return 'tip your body more to your left';
    if (fix === 'lean_right') return 'tip your body more to your right';
    return 'keep your body upright';
  }
  const arm = group.endsWith('arm');
  switch (fix) {
    case 'higher':
      return arm ? `lift your ${side} arm higher` : `lift your ${side} foot higher`;
    case 'lower':
      return arm ? `bring your ${side} arm lower` : `keep your ${side} foot lower`;
    case 'wider':
      return arm ? `reach your ${side} arm further out to the side` : `step your ${side} foot out wider`;
    case 'closer':
      return arm ? `keep your ${side} arm closer in` : `bring your ${side} foot in closer`;
    case 'bend':
      return arm ? `bend your ${side} elbow more` : `bend your ${side} knee more`;
    case 'straighten':
      return arm ? `straighten your ${side} arm` : `straighten your ${side} leg`;
    default:
      return `check your ${side} ${arm ? 'arm' : 'leg'} against the reference`;
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function correctionText(issue: Issue): string {
  if (issue.kind === 'timing') {
    const late = issue.offsetMs > 0;
    if (issue.beat === null) {
      return late
        ? "You're a little behind the beat. Start each move sooner."
        : "You're rushing ahead of the beat. Wait for each count.";
    }
    const count = countWord(issue.beat);
    return late
      ? `You're late on count ${count}. Start moving sooner.`
      : `You're early on count ${count}. Hold the shape before it a little longer.`;
  }
  const count = countWord(issue.beat);
  const fix = fixPhrase(issue.group, issue.detail.fix);
  let text: string;
  if (issue.streak <= 1) text = `On count ${count}, ${fix}.`;
  else if (issue.streak === 2) text = `Count ${count} again: ${fix}.`;
  else text = `Still count ${count}. ${cap(fix)}.`;
  if (issue.cue && issue.streak <= 2) text += ` ${issue.cue}`;
  return text;
}

function stepIntro(step: Step, totalCounts: number): string {
  const label = rangeLabel(step.from, step.to, totalCounts);
  switch (step.kind) {
    case 'learn':
      return `Next, ${label}. Watch first.`;
    case 'join':
      return `Now join them together: ${label}.`;
    case 'link':
      return `Let's link ${label}.`;
    case 'top':
      return step.to >= totalCounts ? 'Now the whole routine, from the top.' : `From the top: ${label}.`;
    case 'review':
      return `Let's go back to ${label}. Watch first.`;
  }
}

const speedPhrase = (a: Activity) => (a.speed >= 1 ? 'Now at full tempo.' : 'Now a little faster.');

/** What the teacher says after an attempt, given the correction and what the plan decided. */
export function feedbackText(report: Report, correction: Issue | null, totalCounts: number): string {
  const fix = correction ? correctionText(correction) : '';
  const next = report.next;
  switch (report.outcome) {
    case 'repeat':
      return fix ? `${fix} Again.` : 'Again.';
    case 'slow-down':
      return `${fix} Let's slow it down.`.trim();
    case 'drill-start': {
      const d = next?.drill;
      const what = d ? (d.focus.includes('left_arm') ? 'arms only' : d.focus.includes('left_leg') ? 'feet only' : 'body only') : '';
      const where = d ? rangeLabel(d.from, d.to, 8) : 'that moment';
      return `${fix} Let's drill ${where}, slowly, ${what}.`;
    }
    case 'drill-pass':
      return "That's it. Back to the full section.";
    case 'drill-end':
      return `${fix} Keep that in mind. Back to the full section.`.trim();
    case 'speed-up':
      return `Good. ${next ? speedPhrase(next) : ''}`.trim();
    case 'lock-in':
      return 'Clean. One more to lock it in.';
    case 'advance':
      return `Got it. ${next ? stepIntro(next.step, totalCounts) : ''}`.trim();
    case 'moved-on':
      return `Let's move on and come back to that. ${next ? stepIntro(next.step, totalCounts) : ''}`.trim();
    case 'finished':
      return "That's the whole routine. Nice work.";
  }
}

export function introText(title: string): string {
  return `Let's learn ${title}. We'll take it four counts at a time, then join the pieces together. Watch first.`;
}
