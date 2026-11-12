import { useEffect, useRef, useState } from 'react';
import { libraryWritable } from '../lesson/library';
import { Lesson } from '../lesson/types';
import { loadHistory } from '../session/history';

interface Props {
  lessons: Lesson[] | null;
  onPick: (lesson: Lesson) => void;
  onReview: (lesson: Lesson) => void;
  onAdd: () => void;
  onDelete: (lesson: Lesson) => void;
  /** Copy a routine kept on this device into the shared library. */
  onShare: (lesson: Lesson) => void;
}

/** A still from the routine's video that plays a silent preview on hover. */
function Thumb({ lesson }: { lesson: Lesson }) {
  const ref = useRef<HTMLVideoElement>(null);
  const start = Math.max(0, lesson.firstBeatSec);
  if (!lesson.videoUrl) return <div className="thumb thumb-none">No video</div>;
  return (
    <video
      ref={ref}
      className="thumb"
      src={`${lesson.videoUrl}#t=${start.toFixed(2)}`}
      muted
      loop
      playsInline
      preload="metadata"
      aria-hidden="true"
      onMouseEnter={() => void ref.current?.play().catch(() => {})}
      onMouseLeave={() => {
        const v = ref.current;
        if (!v) return;
        v.pause();
        v.currentTime = start;
      }}
    />
  );
}

function Card({ lesson: l, canShare, onPick, onReview, onDelete, onShare }: { lesson: Lesson; canShare: boolean } & Omit<Props, 'lessons' | 'onAdd'>) {
  const attempts = loadHistory(l.id).reduce((n, s) => n + s.attempts.length, 0);
  const seconds = Math.round((l.counts * 60) / l.bpm);
  const removable = l.source === 'imported' || (l.source === 'bundled' && canShare);
  return (
    <li className="lesson">
      <Thumb lesson={l} />
      <div className="lesson-body">
        <p className="lesson-style">{[l.style, l.level].filter(Boolean).join(' · ')}</p>
        <h3>{l.title}</h3>
        {l.credit && <p className="muted small">{l.credit}</p>}
        {l.description && <p className="muted small">{l.description}</p>}
        <p className="lesson-facts">
          <span>{seconds} seconds</span>
          <span>{l.counts} counts</span>
          <span>{Math.round(l.bpm)} bpm</span>
        </p>
        <div className="lesson-actions">
          <button className="primary" onClick={() => onPick(l)}>
            {attempts > 0 ? 'Practise again' : 'Start learning'}
          </button>
          {attempts > 0 && (
            <button className="link" onClick={() => onReview(l)}>
              Progress ({attempts})
            </button>
          )}
          {l.source === 'imported' && canShare && (
            <button className="link" onClick={() => onShare(l)}>
              Add to library
            </button>
          )}
          {removable && (
            <button className="link" onClick={() => window.confirm(`Remove "${l.title}" and its video?`) && onDelete(l)}>
              Remove
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

export function Home({ lessons, onAdd, ...actions }: Props) {
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    void libraryWritable().then(setCanShare);
  }, []);
  const library = lessons?.filter((l) => l.source === 'bundled') ?? [];
  const mine = lessons?.filter((l) => l.source === 'imported') ?? [];
  const figure = lessons?.filter((l) => l.source === 'builtin') ?? [];
  const list = (items: Lesson[]) => (
    <ul className="lessons">
      {items.map((l) => (
        <Card key={l.id} lesson={l} canShare={canShare} {...actions} />
      ))}
    </ul>
  );
  return (
    <main className="home">
      <header className="hero">
        <p className="brand">DanceTutor</p>
        <h1>Pick a dance. Learn it four counts at a time.</h1>
        <p className="lede">
          Your teacher watches you through the camera, corrects one thing at a time, and builds the pieces into the full routine.
        </p>
      </header>
      <section>
        <div className="section-head">
          <h2>Library</h2>
          <button className="primary" onClick={onAdd}>
            Add a routine from a video
          </button>
        </div>
        {!lessons && <p className="muted">Loading routines…</p>}
        {lessons && library.length === 0 && (
          <p className="empty">
            No routines in the library yet. Add one from a video{canShare ? ' and it will be preloaded for everyone' : ''}.
          </p>
        )}
        {list(library)}
      </section>
      {mine.length > 0 && (
        <section>
          <h2>On this device only</h2>
          {list(mine)}
        </section>
      )}
      {figure.length > 0 && (
        <section>
          <h2>Try it without a video</h2>
          {list(figure)}
        </section>
      )}
    </main>
  );
}
