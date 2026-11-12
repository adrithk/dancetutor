import { useEffect, useState } from 'react';
import { rangeShort } from '../coach/phrasing';
import { Lesson } from '../lesson/types';
import { jv, jx, jy } from '../pose/features';
import { CameraTracker } from '../pose/tracker';
import { JOINT_COUNT, Pose } from '../pose/types';
import { Session } from '../session/session';
import { HeatStrip } from './HeatStrip';
import { Stage } from './Stage';
import { Settings } from './settings';
import { useSessionState } from './useSession';

interface Props {
  lesson: Lesson;
  settings: Settings;
  onExit: () => void;
}

const KIND = { learn: 'Learning', join: 'Joining', link: 'Linking', top: 'From the top', review: 'Reviewing' } as const;

function wholeBody(pose: Pose, aspect: number) {
  for (let j = 0; j < JOINT_COUNT; j++) {
    const inside = jx(pose, j) > 0.01 && jx(pose, j) < aspect - 0.01 && jy(pose, j) > 0.01 && jy(pose, j) < 0.99;
    if (jv(pose, j) < 0.5 || !inside) return false;
  }
  return true;
}

/** The tutor: the teacher's video, the dancer's camera, and what the teacher says. */
export function Practice({ lesson, settings, onExit }: Props) {
  const [session] = useState(() => new Session({ lesson, mirror: settings.mirror, pace: settings.pace, simulated: settings.simulated, voice: settings.voice }));
  const state = useSessionState(session);
  const [tracker, setTracker] = useState<CameraTracker | null>(null);
  const [camera, setCamera] = useState<'starting' | 'waiting' | 'ready' | 'error'>(settings.simulated ? 'ready' : 'starting');
  const [error, setError] = useState('');
  const [showJoints, setShowJoints] = useState(true);

  // Start the camera, then begin the lesson once the dancer's whole body is in view.
  useEffect(() => {
    if (settings.simulated) {
      void session.start();
      return () => session.dispose();
    }
    const t = new CameraTracker();
    let alive = true;
    let begun = false;
    t.listener = (pose, perfMs) => {
      session.onPose(pose, perfMs);
      if (!begun && pose && wholeBody(pose, t.aspect)) {
        begun = true;
        setCamera('ready');
        void session.start();
      }
    };
    t.start()
      .then(() => {
        if (!alive) return t.stop();
        setTracker(t);
        setCamera((c) => (c === 'starting' ? 'waiting' : c));
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
        setCamera('error');
      });
    return () => {
      alive = false;
      t.listener = null;
      t.stop();
      session.dispose();
    };
  }, [session, settings.simulated]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ['BUTTON', 'INPUT'].includes(e.target.tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        session.togglePause();
      } else if (e.key === 'r') session.watchAgain();
      else if (e.key === 's') session.skipStep();
      else if (e.key === 'j') setShowJoints((v) => !v);
      else if (e.key === 'Enter') {
        // Start without waiting for the whole-body check.
        setCamera((c) => (c === 'waiting' ? 'ready' : c));
        void session.start();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session]);

  const a = state.activity;
  const finished = state.phase === 'finished';
  const caption =
    camera === 'starting'
      ? 'Starting the camera…'
      : camera === 'error'
        ? `The camera could not start (${error}). Allow camera access and reload.`
        : camera === 'waiting'
          ? 'Step back until your whole body is in view. Press Enter to start anyway.'
          : finished
            ? "That's the whole routine. Nice work."
            : state.phase === 'paused'
              ? 'Paused. Press Space to continue.'
              : state.caption || (state.phase === 'dancing' ? 'Dance.' : '');
  const status = a && !finished ? `${a.drill ? 'Drill' : KIND[a.step.kind]} · ${rangeShort(a.from, a.to, lesson.counts)} · ${Math.round(a.speed * 100)}% speed` : '';

  return (
    <main className="tutor">
      <header>
        <button className="link" onClick={onExit}>
          ← Dances
        </button>
        <span>
          <strong>{lesson.title}</strong>
          {status && <span className="muted"> · {status}</span>}
        </span>
      </header>
      <Stage session={session} tracker={tracker} showJoints={showJoints} />
      <p className="caption" aria-live="polite">
        {caption}
      </p>
      {a && state.attempts.length > 0 && <HeatStrip attempts={state.attempts.filter((x) => x.stepId === a.step.id)} from={a.step.from} to={a.step.to} limit={4} />}
      <p className="muted hint">Space pause · R show again · S skip{lesson.videoUrl ? ' · J joints on video' : ''}</p>
    </main>
  );
}
