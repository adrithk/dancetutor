import { Lesson } from '../lesson/types';
import { loadHistory } from '../session/history';

interface Props {
  lessons: Lesson[] | null;
  onPick: (lesson: Lesson) => void;
  onReview: (lesson: Lesson) => void;
  onAdd: () => void;
  onDelete: (lesson: Lesson) => void;
}

export function Home({ lessons, onPick, onReview, onAdd, onDelete }: Props) {
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
          <h2>Routines</h2>
          <button className="primary" onClick={onAdd}>
            Add a routine from a video
          </button>
        </div>
        {!lessons && <p className="muted">Loading routines…</p>}
        <ul className="lessons">
          {lessons?.map((l) => {
            const history = loadHistory(l.id);
            const attempts = history.reduce((n, s) => n + s.attempts.length, 0);
            const seconds = Math.round((l.counts * 60) / l.bpm);
            return (
              <li key={l.id} className="lesson">
                <div>
                  <p className="lesson-style">{l.style}</p>
                  <h3>{l.title}</h3>
                  <p className="muted">{l.description}</p>
                  <p className="lesson-facts">
                    {l.level && <span>{l.level}</span>}
                    <span>{l.counts} counts</span>
                    <span>{Math.round(l.bpm)} bpm</span>
                    <span>{seconds} seconds</span>
                    <span>{l.videoUrl ? 'Video' : 'No video'}</span>
                  </p>
                </div>
                <div className="lesson-actions">
                  <button className="primary" onClick={() => onPick(l)}>
                    {attempts > 0 ? 'Practise again' : 'Start learning'}
                  </button>
                  {attempts > 0 && (
                    <button className="link" onClick={() => onReview(l)}>
                      Your progress ({attempts} attempts)
                    </button>
                  )}
                  {l.source === 'imported' && (
                    <button className="link" onClick={() => window.confirm(`Remove "${l.title}" and its video from this device?`) && onDelete(l)}>
                      Remove
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
