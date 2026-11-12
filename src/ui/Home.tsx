import { useEffect, useState } from 'react';
import { libraryWritable } from '../lesson/library';
import { Lesson } from '../lesson/types';

interface Props {
  lessons: Lesson[] | null;
  onPick: (lesson: Lesson) => void;
  onAdd: () => void;
  onDelete: (lesson: Lesson) => void;
  /** Copy a routine kept on this device into the shared library. */
  onShare: (lesson: Lesson) => void;
}

/** The dance selector: a plain list. Pick one to start the tutor. */
export function Home({ lessons, onPick, onAdd, onDelete, onShare }: Props) {
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    void libraryWritable().then(setCanShare);
  }, []);
  return (
    <main className="page">
      <h1>DanceTutor</h1>
      <p className="muted">Pick a dance to learn.</p>
      {!lessons && <p className="muted">Loading…</p>}
      <ul className="dances">
        {lessons?.map((l) => (
          <li key={l.id}>
            <button className="dance" onClick={() => onPick(l)}>
              <strong>{l.title}</strong>
              <span className="muted">
                {[l.videoUrl ? l.style : 'No video (animated figure)', `${l.counts} counts`, `${Math.round((l.counts * 60) / l.bpm)}s`].filter(Boolean).join(' · ')}
                {l.source === 'imported' ? ' · this device only' : ''}
              </span>
            </button>
            {l.source === 'imported' && canShare && (
              <button className="link" onClick={() => onShare(l)}>
                add to library
              </button>
            )}
            {(l.source === 'imported' || (l.source === 'bundled' && canShare)) && (
              <button className="link" onClick={() => window.confirm(`Remove "${l.title}" and its video?`) && onDelete(l)}>
                remove
              </button>
            )}
          </li>
        ))}
      </ul>
      <button className="link" onClick={onAdd}>
        + Add a dance from a video
      </button>
    </main>
  );
}
