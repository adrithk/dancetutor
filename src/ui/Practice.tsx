import { useEffect, useState } from 'react';
import { rangeShort } from '../coach/phrasing';
import { Lesson } from '../lesson/types';
import { CameraTracker } from '../pose/tracker';
import { AttemptRecord, Phase, Session } from '../session/session';
import { HeatStrip } from './HeatStrip';
import { RoutineMap } from './RoutineMap';
import { Stage } from './Stage';
import { Settings } from './settings';
import { useSessionState } from './useSession';

interface Props {
  lesson: Lesson;
  tracker: CameraTracker | null;
  settings: Settings;
  onExit: (attempts: AttemptRecord[]) => void;
}

const PHASE_LABEL: Record<Phase, string> = {
  ready: 'Ready',
  talking: 'Teacher',
  watch: 'Watch',
  countin: 'Get ready',
  dancing: 'Dance',
  paused: 'Paused',
  finished: 'Finished',
};

const KIND_TITLE = { learn: 'Learning', join: 'Joining', link: 'Linking', top: 'From the top', review: 'Reviewing' } as const;

export function Practice({ lesson, tracker, settings, onExit }: Props) {
  const [session] = useState(() => new Session({ lesson, mirror: settings.mirror, pace: settings.pace, simulated: !tracker, voice: settings.voice }));
  const state = useSessionState(session);

  useEffect(() => {
    if (tracker) tracker.listener = session.onPose;
    void session.start();
    return () => {
      if (tracker) tracker.listener = null;
      session.dispose();
    };
  }, [session, tracker]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ['INPUT', 'BUTTON', 'SELECT'].includes(e.target.tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        session.togglePause();
      } else if (e.key === 'r') session.watchAgain();
      else if (e.key === 's') session.skipStep();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session]);

  const a = state.activity;
  const finished = state.phase === 'finished';
  const stepAttempts = a ? state.attempts.filter((x) => x.stepId === a.step.id) : [];
  const doneCount = state.steps.filter((s) => state.done.includes(s.id)).length;

  return (
    <div className="practice">
      <header className="practice-top">
        <button className="link" onClick={() => onExit(state.attempts)}>
          ← End session
        </button>
        <div className="practice-title">
          <h1>{lesson.title}</h1>
          {a && !finished && (
            <p>
              <strong>{a.drill ? 'Drill' : KIND_TITLE[a.step.kind]}</strong> · {rangeShort(a.from, a.to, lesson.counts)}
            </p>
          )}
        </div>
        <div className="chips">
          <span className={`chip phase phase-${state.phase}`}>{PHASE_LABEL[state.phase]}</span>
          {a && !finished && <span className="chip">{Math.round(a.speed * 100)}% speed</span>}
          {a && !finished && <span className="chip">{a.music ? 'With music' : 'Counts only'}</span>}
          {a?.drill && <span className="chip drill">{a.drill.focus.includes('left_arm') ? 'Arms only' : a.drill.focus.includes('left_leg') ? 'Feet only' : 'Body only'}</span>}
        </div>
      </header>

      <Stage session={session} tracker={tracker} />

      <div className={`teacher ${state.phase === 'talking' ? 'is-speaking' : ''}`} aria-live="polite">
        <span className="teacher-dot" aria-hidden="true" />
        <p>{finished ? "That's the whole routine. Nice work." : state.caption || (state.phase === 'dancing' ? 'Follow the teacher. Match the ghost.' : '')}</p>
      </div>

      {finished ? (
        <div className="finish">
          <button className="primary" onClick={() => onExit(state.attempts)}>
            See your progress
          </button>
        </div>
      ) : (
        <div className="controls">
          <button onClick={() => session.togglePause()}>{state.phase === 'paused' ? 'Resume' : 'Pause'} <kbd>Space</kbd></button>
          <button onClick={() => session.watchAgain()}>Show me again <kbd>R</kbd></button>
          <button onClick={() => session.skipStep()}>Skip this part <kbd>S</kbd></button>
        </div>
      )}

      <div className="progress">
        <section className="card">
          <h2>This section</h2>
          {a && <HeatStrip attempts={stepAttempts} from={a.step.from} to={a.step.to} />}
          <p className="legend">
            <span className="heat-cell lv-good" /> on target <span className="heat-cell lv-warn" /> close <span className="heat-cell lv-bad" /> needs work
          </p>
        </section>
        <section className="card">
          <h2>
            Lesson plan <small>{doneCount} of {state.steps.length} done</small>
          </h2>
          <RoutineMap steps={state.steps} stepIndex={state.stepIndex} done={state.done} shaky={state.shaky} totalCounts={lesson.counts} />
        </section>
      </div>
    </div>
  );
}
