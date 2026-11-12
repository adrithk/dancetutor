import { useEffect, useRef, useState } from 'react';
import { Lesson } from '../lesson/types';
import { jv, jx, jy, torsoLength } from '../pose/features';
import { CameraTracker } from '../pose/tracker';
import { JOINT_COUNT, Pose } from '../pose/types';
import { COLORS, drawFigure, prepareCanvas } from './draw';
import { Settings } from './settings';

interface Props {
  lesson: Lesson;
  settings: Settings;
  onChange: (s: Settings) => void;
  onStart: (tracker: CameraTracker | null) => void;
  onBack: () => void;
}

interface Checks {
  seen: boolean;
  wholeBody: boolean;
  distance: 'ok' | 'close' | 'far';
}

function check(pose: Pose | null, aspect: number): Checks {
  if (!pose) return { seen: false, wholeBody: false, distance: 'ok' };
  let wholeBody = true;
  for (let j = 0; j < JOINT_COUNT; j++) {
    const inside = jx(pose, j) > 0.02 && jx(pose, j) < aspect - 0.02 && jy(pose, j) > 0.02 && jy(pose, j) < 0.98;
    if (jv(pose, j) < 0.5 || !inside) wholeBody = false;
  }
  const torso = torsoLength(pose);
  return { seen: true, wholeBody, distance: torso > 0.3 ? 'close' : torso < 0.1 ? 'far' : 'ok' };
}

export function Setup({ lesson, settings, onChange, onStart, onBack }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const trackerRef = useRef<CameraTracker | null>(null);
  const handedOver = useRef(false);
  const [status, setStatus] = useState<'starting' | 'ready' | 'error'>('starting');
  const [error, setError] = useState('');
  const [checks, setChecks] = useState<Checks>({ seen: false, wholeBody: false, distance: 'ok' });
  const [aspect, setAspect] = useState(4 / 3);

  useEffect(() => {
    if (settings.simulated) return;
    const tracker = new CameraTracker();
    trackerRef.current = tracker;
    let alive = true;
    let last = 0;
    setStatus('starting');
    tracker.listener = (pose) => {
      const c = canvas.current && prepareCanvas(canvas.current);
      if (c && pose) drawFigure(c.ctx, pose, c.h, { color: () => COLORS.good, weight: 0.1, minVisibility: 0.4, outline: true });
      const now = performance.now();
      if (now - last > 250) {
        last = now;
        setChecks(check(pose, tracker.aspect));
      }
    };
    tracker
      .start()
      .then(() => {
        if (!alive) return tracker.stop();
        setAspect(tracker.aspect);
        tracker.video.className = 'panel-video';
        box.current?.prepend(tracker.video);
        setStatus('ready');
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      });
    return () => {
      alive = false;
      tracker.listener = null;
      tracker.video.remove();
      if (!handedOver.current) tracker.stop();
      trackerRef.current = null;
    };
  }, [settings.simulated]);

  const start = () => {
    if (settings.simulated) return onStart(null);
    handedOver.current = true;
    onStart(trackerRef.current);
  };

  const ready = settings.simulated || (status === 'ready' && checks.wholeBody && checks.distance === 'ok');
  const item = (ok: boolean, text: string) => (
    <li className={ok ? 'ok' : ''}>
      <span aria-hidden="true">{ok ? '✓' : '○'}</span> {text}
    </li>
  );

  return (
    <main className="setup">
      <button className="link" onClick={onBack}>
        ← Routines
      </button>
      <h1>Set up for {lesson.title}</h1>
      <div className="setup-grid">
        <div ref={box} className={`panel-box selfie ${settings.simulated ? 'is-sim' : ''}`} style={{ aspectRatio: String(aspect) }}>
          <canvas ref={canvas} className="panel-canvas" />
          {settings.simulated && <p className="panel-note">Simulated dancer: no camera needed. It makes a few mistakes and improves as it is corrected.</p>}
          {!settings.simulated && status === 'starting' && <p className="panel-note">Starting the camera…</p>}
          {!settings.simulated && status === 'error' && <p className="panel-note">The camera could not start ({error}). Allow camera access and reload, or use the simulated dancer.</p>}
        </div>
        <div className="setup-side">
          {!settings.simulated && (
            <ul className="checklist">
              {item(status === 'ready', 'Camera is on')}
              {item(checks.seen, 'I can see you')}
              {item(checks.wholeBody, 'Whole body in frame, head to feet')}
              {item(checks.seen && checks.distance === 'ok', checks.distance === 'close' ? 'Step back a little' : checks.distance === 'far' ? 'Come a little closer' : 'Good distance')}
            </ul>
          )}
          <fieldset>
            <legend>How do you want to follow?</legend>
            <label>
              <input type="radio" name="mirror" checked={settings.mirror} onChange={() => onChange({ ...settings, mirror: true })} />
              Like a mirror <small>The teacher's left side matches your left side on screen.</small>
            </label>
            <label>
              <input type="radio" name="mirror" checked={!settings.mirror} onChange={() => onChange({ ...settings, mirror: false })} />
              Same side as the teacher <small>Their right arm is your right arm.</small>
            </label>
          </fieldset>
          <fieldset>
            <legend>Pace</legend>
            <label>
              <input type="radio" name="pace" checked={settings.pace === 'full'} onChange={() => onChange({ ...settings, pace: 'full' })} />
              Full lesson <small>Slow, medium, then tempo, with two clean runs to move on.</small>
            </label>
            <label>
              <input type="radio" name="pace" checked={settings.pace === 'quick'} onChange={() => onChange({ ...settings, pace: 'quick' })} />
              Quick <small>Fewer repeats. Good for demos.</small>
            </label>
          </fieldset>
          <label className="toggle">
            <input type="checkbox" checked={settings.voice} onChange={(e) => onChange({ ...settings, voice: e.target.checked })} />
            Teacher speaks out loud
          </label>
          <label className="toggle">
            <input type="checkbox" checked={settings.simulated} onChange={(e) => onChange({ ...settings, simulated: e.target.checked })} />
            Use a simulated dancer instead of the camera
          </label>
          <button className="primary big" disabled={!ready} onClick={start}>
            Start the lesson
          </button>
          {!ready && !settings.simulated && status === 'ready' && <p className="muted">Stand where your whole body is visible to begin.</p>}
        </div>
      </div>
    </main>
  );
}
