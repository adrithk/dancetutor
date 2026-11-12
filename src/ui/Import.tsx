import { useEffect, useRef, useState } from 'react';
import { Transport } from '../audio/transport';
import { libraryWritable, saveToLibrary } from '../lesson/library';
import { saveImported } from '../lesson/store';
import { fitBeat, trackVideo } from '../lesson/track';
import { Lesson, LessonMeta, countInPhrase } from '../lesson/types';
import { COLORS, drawFigure, prepareCanvas } from './draw';

interface Props {
  /** Ids already in use, so a new library routine gets its own folder name. */
  taken: string[];
  onDone: (lesson: Lesson) => void;
  onBack: () => void;
}

const LEVELS = ['Beginner', 'Intermediate', 'Advanced'];

/** Add a routine from a video: set the beat, then track the dancer's joints. */
export function Import({ taken, onDone, onBack }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const countEl = useRef<HTMLDivElement>(null);
  const transport = useRef<Transport | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [duration, setDuration] = useState(0);
  const [aspect, setAspect] = useState(16 / 9);
  const [title, setTitle] = useState('');
  const [style, setStyle] = useState('');
  const [level, setLevel] = useState(LEVELS[0]);
  const [credit, setCredit] = useState('');
  const [canShare, setCanShare] = useState(false);
  const [share, setShare] = useState(true);
  const [bpm, setBpm] = useState(100);
  const [first, setFirst] = useState(0);
  const [counts, setCounts] = useState(32);
  const [countsEdited, setCountsEdited] = useState(false);
  const [taps, setTaps] = useState<number[]>([]);
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => () => transport.current?.stop(), []);
  useEffect(() => {
    void libraryWritable().then(setCanShare);
  }, []);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  // Suggest the number of counts that fit after count 1, in whole eights.
  const beat = 60 / bpm;
  const fit = Math.floor((duration - first) / beat + 0.25);
  const suggested = Math.max(4, fit >= 8 ? Math.floor(fit / 8) * 8 : Math.floor(fit / 4) * 4);
  useEffect(() => {
    if (!countsEdited && duration > 0) setCounts(suggested);
  }, [suggested, countsEdited, duration]);

  const choose = (f: File | undefined) => {
    if (!f) return;
    transport.current?.stop();
    setFile(f);
    setUrl(URL.createObjectURL(f));
    setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
    setTaps([]);
    setCountsEdited(false);
    setMessage('');
  };

  const tap = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) {
      // The first press starts the video; taps begin on count 1.
      void v.play();
      setTaps([]);
      return;
    }
    const next = [...taps, v.currentTime];
    setTaps(next);
    const beatFit = fitBeat(next);
    if (beatFit) {
      setBpm(Math.round(beatFit.bpm * 10) / 10);
      setFirst(Math.max(0, Math.round(beatFit.first * 100) / 100));
    }
  };

  // Play the video with a click and a number on every count, to check the beat.
  const check = async () => {
    const v = video.current;
    if (!v) return;
    if (checking) {
      transport.current?.stop();
      return;
    }
    const grid = { bpm, firstBeatSec: first };
    const t = new Transport(grid);
    t.media = v;
    t.mediaHasMusic = true;
    t.unlock();
    transport.current = t;
    setChecking(true);
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (countEl.current) {
        const b = Math.floor(t.beatPos + 0.04);
        countEl.current.textContent = t.isPlaying && b >= 0 ? String(countInPhrase(b)) : '';
      }
    };
    draw();
    await t.play({ from: Math.max(0, first - 2 * beat), to: Math.min(duration, first + counts * beat), rate: 1, music: true, firstDanceBeat: 0, alwaysClick: true });
    cancelAnimationFrame(raf);
    if (countEl.current) countEl.current.textContent = '';
    setChecking(false);
  };

  const save = async () => {
    const v = video.current;
    if (!v || !file) return;
    transport.current?.stop();
    setMessage('');
    setProgress(0);
    try {
      const end = first + counts * beat;
      const { poses, missed, total } = await trackVideo(v, { from: first - 6 * beat, to: end + beat }, (p, pose) => {
        setProgress(p);
        const c = canvas.current && prepareCanvas(canvas.current);
        if (c && pose) drawFigure(c.ctx, pose, c.h, { color: () => COLORS.reference, weight: 0.08, minVisibility: 0.4, outline: true });
      });
      if (missed > total * 0.25) {
        setMessage(`The dancer could not be found in ${Math.round((missed / total) * 100)}% of the video. Use a video with one dancer, whole body in frame, and a fixed camera.`);
        setProgress(null);
        return;
      }
      const meta: LessonMeta = {
        id: `video-${Date.now()}`,
        title: title.trim() || 'My routine',
        style: style.trim() || 'Dance',
        level,
        description: '',
        credit: credit.trim() || undefined,
        bpm,
        firstBeatSec: first,
        counts,
        notes: [],
        video: file.name,
      };
      onDone(canShare && share ? await saveToLibrary(meta, poses, file, file.name, taken) : await saveImported(meta, poses, file));
    } catch (e) {
      setMessage(`Could not process the video: ${e instanceof Error ? e.message : String(e)}`);
      setProgress(null);
    }
  };

  const busy = progress !== null;
  const tooLong = duration > 0 && first + counts * beat > duration + beat * 0.5;
  return (
    <main className="setup">
      <button className="link" onClick={onBack} disabled={busy}>
        ← Routines
      </button>
      <h1>Add a routine from a video</h1>
      <p className="muted">
        Use a video of one dancer, whole body in frame, facing a camera that does not move. It stays on this device.
      </p>
      <div className="setup-grid">
        <div className="panel-box" style={{ aspectRatio: String(aspect) }}>
          {url ? (
            <video
              ref={video}
              className="panel-video contain"
              src={url}
              playsInline
              controls={!busy && !checking}
              onLoadedMetadata={(e) => {
                setDuration(e.currentTarget.duration);
                setAspect(e.currentTarget.videoWidth / e.currentTarget.videoHeight || 16 / 9);
              }}
            />
          ) : (
            <p className="panel-note">Choose a video to begin.</p>
          )}
          <canvas ref={canvas} className="panel-canvas" style={{ pointerEvents: 'none' }} />
          <div ref={countEl} className="count" aria-hidden="true" />
        </div>
        <div className="setup-side">
          <label className="field">
            Video
            <input type="file" accept="video/*" disabled={busy} onChange={(e) => choose(e.target.files?.[0])} />
          </label>
          {url && (
            <>
              <label className="field">
                Name
                <input type="text" value={title} disabled={busy} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <div className="row">
                <label className="field">
                  Style
                  <input type="text" value={style} placeholder="Hip hop, K-pop, salsa…" disabled={busy} onChange={(e) => setStyle(e.target.value)} />
                </label>
                <label className="field">
                  Level
                  <select value={level} disabled={busy} onChange={(e) => setLevel(e.target.value)}>
                    {LEVELS.map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="field">
                Credit <span className="muted">(choreographer or source, optional)</span>
                <input type="text" value={credit} disabled={busy} onChange={(e) => setCredit(e.target.value)} />
              </label>
              <fieldset disabled={busy}>
                <legend>Where are the counts?</legend>
                <p className="muted small">
                  Press the button once to start the video, then tap it on every count, beginning on count 1. Eight taps or more works best.
                </p>
                <div className="row">
                  <button type="button" onClick={tap}>
                    Tap the beat{taps.length > 0 ? ` (${taps.length})` : ''}
                  </button>
                  {taps.length > 0 && (
                    <button type="button" className="link" onClick={() => setTaps([])}>
                      Start over
                    </button>
                  )}
                </div>
                <div className="row">
                  <label className="field">
                    Tempo (bpm)
                    <input type="number" min={40} max={220} step={0.1} value={bpm} onChange={(e) => setBpm(Number(e.target.value) || 100)} />
                  </label>
                  <label className="field">
                    Count 1 at (seconds)
                    <input type="number" min={0} step={0.01} value={first} onChange={(e) => setFirst(Math.max(0, Number(e.target.value) || 0))} />
                  </label>
                  <label className="field">
                    Counts
                    <input
                      type="number"
                      min={4}
                      step={4}
                      value={counts}
                      onChange={(e) => {
                        setCountsEdited(true);
                        setCounts(Math.max(4, Math.round(Number(e.target.value)) || 4));
                      }}
                    />
                  </label>
                </div>
                <div className="row">
                  <button type="button" onClick={() => video.current && setFirst(Math.round(video.current.currentTime * 100) / 100)}>
                    Count 1 is where the video is now
                  </button>
                  <button type="button" onClick={check}>
                    {checking ? 'Stop' : 'Check the counts'}
                  </button>
                </div>
                {tooLong && <p className="warn-text">That is more counts than the video has. Reduce the counts or check the tempo.</p>}
              </fieldset>
              {canShare && (
                <label className="toggle">
                  <input type="checkbox" checked={share} disabled={busy} onChange={(e) => setShare(e.target.checked)} />
                  <span>
                    Add to the app's library <small className="muted">Saved into the project so it is preloaded for everyone. Untick to keep it on this device only.</small>
                  </span>
                </label>
              )}
              <button className="primary big" disabled={busy || tooLong} onClick={save}>
                {busy ? `Tracking the dancer… ${Math.round((progress ?? 0) * 100)}%` : 'Save routine'}
              </button>
              {busy && <progress value={progress ?? 0} max={1} />}
            </>
          )}
          {message && <p className="warn-text">{message}</p>}
        </div>
      </div>
    </main>
  );
}
