import { useEffect, useRef } from 'react';
import { countInPhrase } from '../lesson/types';
import { fitToBody } from '../pose/features';
import { CameraTracker } from '../pose/tracker';
import { Session } from '../session/session';
import { COLORS, drawFigure, prepareCanvas } from './draw';

interface Props {
  session: Session;
  tracker: CameraTracker | null;
  /** Draw the tracked joints over the teacher's video. */
  showJoints: boolean;
}

/** The two practice panels: the reference on the left, the dancer on the right. */
export function Stage({ session, tracker, showJoints }: Props) {
  const refCanvas = useRef<HTMLCanvasElement>(null);
  const liveCanvas = useRef<HTMLCanvasElement>(null);
  const liveBox = useRef<HTMLDivElement>(null);
  const refVideo = useRef<HTMLVideoElement>(null);
  const countEl = useRef<HTMLDivElement>(null);
  const { lesson, options } = session;

  // Put the camera's own video element behind the skeleton overlay.
  useEffect(() => {
    const box = liveBox.current;
    if (!tracker || !box) return;
    tracker.video.className = 'panel-video';
    box.prepend(tracker.video);
    void tracker.video.play().catch(() => {});
    return () => tracker.video.remove();
  }, [tracker]);

  useEffect(() => {
    if (!refVideo.current) return;
    session.transport.media = refVideo.current;
    session.transport.mediaHasMusic = true;
    return () => {
      session.transport.media = null;
    };
  }, [session]);

  useEffect(() => {
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const state = session.getState();
      const t = session.transport.mediaTime;
      const playing = session.transport.isPlaying;

      // Reference panel.
      const rc = refCanvas.current && prepareCanvas(refCanvas.current);
      if (rc) {
        const spot = state.spotlight;
        if (!lesson.videoUrl) {
          drawFigure(rc.ctx, session.refPose(t), rc.h, { color: (g) => (g === spot ? COLORS.spotlight : COLORS.reference) });
        } else if (showJoints || spot) {
          // The joints every attempt is compared against, drawn on the video they came from.
          const quiet = showJoints ? COLORS.reference : 'rgba(0,0,0,0)';
          drawFigure(rc.ctx, session.refPose(t), rc.h, { color: (g) => (g === spot ? COLORS.spotlight : quiet), weight: 0.09, minVisibility: 0.4, outline: true });
        }
      }

      // Dancer panel: the target as a ghost on their body, then their own skeleton.
      const lc = liveCanvas.current && prepareCanvas(liveCanvas.current);
      if (lc) {
        const live = session.livePose;
        if (live) {
          if (playing && (state.phase === 'countin' || state.phase === 'dancing')) {
            drawFigure(lc.ctx, fitToBody(session.targetAt(t), live), lc.h, { color: () => COLORS.ghost, weight: 0.26 });
          }
          const levels = session.liveLevels;
          drawFigure(lc.ctx, live, lc.h, {
            color: (g) => (levels[g] === 'idle' ? COLORS.idle : COLORS[levels[g]]),
            weight: tracker ? 0.1 : 0.15,
            minVisibility: 0.4,
            outline: !!tracker,
          });
        }
      }

      // Big count in the corner, switching exactly on the beat.
      const el = countEl.current;
      if (el) {
        const a = state.activity;
        const beat = Math.floor(session.transport.beatPos + 0.04);
        const show = playing && a !== null;
        const text = show ? String(countInPhrase(beat)) : '';
        if (el.textContent !== text) el.textContent = text;
        el.dataset.mode = show && (state.phase === 'countin' || (state.phase !== 'watch' && beat < a.from)) ? 'in' : 'on';
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [session, tracker, lesson, showJoints]);

  const refAspect = lesson.poses.aspect;
  const liveAspect = tracker ? tracker.aspect : lesson.poses.aspect;
  // Mirror practice shows the reference as filmed; same-side practice flips it.
  const flipRef = !options.mirror;
  return (
    <div className="stage">
      <section className="panel" aria-label="Reference">
        <div className="panel-box" style={{ aspectRatio: String(refAspect) }}>
          {lesson.videoUrl && <video ref={refVideo} className={`panel-video contain ${flipRef ? 'flip' : ''}`} src={lesson.videoUrl} playsInline preload="auto" />}
          <canvas ref={refCanvas} className={`panel-canvas ${flipRef ? 'flip' : ''}`} />
          <div ref={countEl} className="count" aria-hidden="true" />
          <span className="panel-tag">Teacher</span>
        </div>
      </section>
      <section className="panel" aria-label="You">
        <div ref={liveBox} className={`panel-box selfie ${tracker ? '' : 'is-sim'}`} style={{ aspectRatio: String(liveAspect) }}>
          <canvas ref={liveCanvas} className="panel-canvas" />
          <span className="panel-tag">{tracker ? 'You' : 'You (simulated)'}</span>
        </div>
      </section>
    </div>
  );
}
