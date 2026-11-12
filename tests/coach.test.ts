import { describe, expect, it } from 'vitest';
import { correctionText, feedbackText, rangeLabel } from '../src/coach/phrasing';
import { Planner, buildPlan } from '../src/coach/planner';
import { mirrorPose } from '../src/pose/features';
import { SimulatedDancer } from '../src/pose/simulated';
import { attempt, grid, lesson, refAt, scenario } from './helpers';

describe('pose geometry', () => {
  it('mirroring twice returns the original pose', () => {
    const p = refAt(1.2);
    const back = mirrorPose(mirrorPose(p, lesson.poses.aspect), lesson.poses.aspect);
    back.forEach((v, i) => expect(v).toBeCloseTo(p[i], 9));
  });
});

describe('judging an attempt', () => {
  it('passes a dancer who copies the reference', () => {
    const dancer = new SimulatedDancer(grid, scenario({ noiseDeg: 3 }));
    const { judgement, results } = attempt(dancer, 0, 8, new Map());
    expect(judgement.issues).toEqual([]);
    expect(judgement.passed).toBe(true);
    for (const r of results) expect(Math.abs(r.offsetMs)).toBeLessThan(60);
  });

  it('finds a dropped arm on the right count and says how to fix it', () => {
    const dancer = new SimulatedDancer(grid, scenario({ faults: [{ beat: 3, group: 'right_arm', deltaDeg: 45, fixAfter: 1 }] }));
    const { judgement } = attempt(dancer, 0, 4, new Map());
    expect(judgement.passed).toBe(false);
    const c = judgement.correction!;
    expect(c.kind).toBe('shape');
    if (c.kind !== 'shape') return;
    expect(c.beat).toBe(3);
    expect(c.group).toBe('left_arm');
    expect(c.detail.fix).toBe('higher');
    // The choreographer's note is about their right arm; a mirrored dancer hears "left".
    expect(c.importance).toBe('essential');
    expect(correctionText(c)).toBe('On count four, lift your left arm higher. The left arm finishes straight up, right beside your ear.');
  });

  it('measures lateness separately from shape', () => {
    const dancer = new SimulatedDancer(grid, scenario({ lateBeatsAtTempo: 0.4 }));
    const { judgement, results } = attempt(dancer, 0, 8, new Map());
    const timed = results.filter((r) => r.timingKnown);
    expect(timed.length).toBeGreaterThanOrEqual(6);
    for (const r of timed) expect(r.offsetMs).toBeGreaterThan(150);
    expect(judgement.issues).toHaveLength(1);
    const c = judgement.correction!;
    expect(c.kind).toBe('timing');
    expect(c.key).toBe('timing:all');
    expect(correctionText(c)).toContain('behind the beat');
  });

  it('ignores limbs the choreographer left free', () => {
    const dancer = new SimulatedDancer(grid, scenario({}));
    const streaks = new Map<string, number>();
    const { judgement } = attempt(dancer, 0, 4, streaks);
    expect(judgement.issues.filter((i) => i.kind === 'shape' && i.group === 'torso')).toEqual([]);
  });

  it('counts how many attempts in a row an issue has appeared', () => {
    const dancer = new SimulatedDancer(grid, scenario({ faults: [{ beat: 3, group: 'right_arm', deltaDeg: 45, fixAfter: 3 }] }));
    const streaks = new Map<string, number>();
    expect(attempt(dancer, 0, 4, streaks).judgement.correction!.streak).toBe(1);
    expect(attempt(dancer, 0, 4, streaks).judgement.correction!.streak).toBe(2);
    expect(correctionText(attempt(dancer, 0, 4, streaks).judgement.correction!)).toMatch(/^Still count four/);
  });
});

describe('lesson plan', () => {
  it('builds the add-on sequence for a 32-count routine', () => {
    const plan = buildPlan(32).map((s) => `${s.kind} ${s.from + 1}-${s.to}`);
    expect(plan).toEqual([
      'learn 1-4', 'learn 5-8', 'join 1-8',
      'learn 9-12', 'learn 13-16', 'join 9-16', 'top 1-16',
      'learn 17-20', 'learn 21-24', 'join 17-24', 'link 9-24', 'top 1-24',
      'learn 25-28', 'learn 29-32', 'join 25-32', 'link 17-32', 'top 1-32',
    ]);
  });

  it('climbs the speed ladder and needs two clean passes at tempo', () => {
    const p = new Planner(buildPlan(32));
    expect(p.current()!.speed).toBe(0.6);
    expect(p.current()!.music).toBe(false);
    expect(p.report(true, null).outcome).toBe('speed-up');
    expect(p.report(true, null).outcome).toBe('speed-up');
    expect(p.current()!.speed).toBe(1);
    expect(p.report(true, null).outcome).toBe('lock-in');
    const r = p.report(true, null);
    expect(r.outcome).toBe('advance');
    expect(r.next!.step.id).toBe('learn-4');
    expect(r.next!.fresh).toBe(true);
  });

  it('teaches a struggling dancer through a drill and on to the next step', () => {
    const dancer = new SimulatedDancer(grid);
    const planner = new Planner(buildPlan(lesson.counts));
    const streaks = new Map<string, number>();
    const log: string[] = [];
    for (let i = 0; i < 40 && planner.current()!.step.id === 'learn-0'; i++) {
      const a = planner.current()!;
      const { judgement } = attempt(dancer, a.from, a.to, streaks, a.speed, a.drill?.focus);
      const report = planner.report(judgement.passed, judgement.correction);
      if (judgement.correction) dancer.hear(judgement.correction.key);
      log.push(report.outcome);
      expect(feedbackText(report, judgement.correction, lesson.counts).length).toBeGreaterThan(3);
    }
    expect(log).toContain('drill-start');
    expect(log).toContain('drill-pass');
    expect(log[log.length - 1]).toBe('advance');
    expect(planner.current()!.step.id).toBe('learn-4');
  });

  it('moves on after too many attempts and comes back before the final run', () => {
    const p = new Planner(buildPlan(32));
    const issue = { kind: 'timing', key: 'timing:all', beat: null, offsetMs: 250, severity: 1.2, streak: 1, score: 1 } as const;
    let r = p.report(false, issue);
    for (let i = 0; i < 7; i++) r = p.report(false, issue);
    expect(r.outcome).toBe('moved-on');
    expect(p.shaky.has('learn-0')).toBe(true);
    const kinds = p.steps.map((s) => s.kind);
    expect(kinds[kinds.length - 2]).toBe('review');
    expect(kinds[kinds.length - 1]).toBe('top');
  });
});

describe('phrasing', () => {
  it('names ranges the way a teacher would', () => {
    expect(rangeLabel(0, 4, 32)).toBe('counts one to four of the first eight');
    expect(rangeLabel(12, 16, 32)).toBe('counts five to eight of the second eight');
    expect(rangeLabel(8, 16, 32)).toBe('the second eight');
    expect(rangeLabel(0, 16, 32)).toBe('the first two eights');
    expect(rangeLabel(8, 24, 32)).toBe('the second and third eights');
    expect(rangeLabel(0, 32, 32)).toBe('the whole routine');
  });
});
