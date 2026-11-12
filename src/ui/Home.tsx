import { Lesson } from '../lesson/types';
import { loadHistory } from '../session/history';

interface Props {
  lessons: Lesson[] | null;
  onPick: (lesson: Lesson) => void;
  onReview: (lesson: Lesson) => void;
}

export function Home({ lessons, onPick, onReview }: Props) {
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
        <h2>Routines</h2>
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
                    <span>{l.level}</span>
                    <span>{l.counts} counts</span>
                    <span>{l.bpm} bpm</span>
                    <span>{seconds} seconds</span>
                    {!l.videoUrl && <span>Figure reference</span>}
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
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
