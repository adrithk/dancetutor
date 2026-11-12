import { countWord, groupLabel, rangeShort } from '../coach/phrasing';
import { Lesson } from '../lesson/types';
import { StoredAttempt, clearHistory, loadHistory } from '../session/history';
import { HeatStrip } from './HeatStrip';

interface Props {
  lesson: Lesson;
  onBack: () => void;
  onPractise: () => void;
}

const FIX_WORDS: Record<string, string> = {
  higher: 'too low',
  lower: 'too high',
  wider: 'not far enough out',
  closer: 'too far out',
  bend: 'too straight',
  straighten: 'too bent',
  lean_left: 'not tipped enough',
  lean_right: 'not tipped enough',
  upright: 'leaning',
  match: 'off the shape',
  late: 'late',
  early: 'early',
};

/** Progress across every session: first try against latest, and what kept needing correction. */
export function Review({ lesson, onBack, onPractise }: Props) {
  const sessions = loadHistory(lesson.id);
  const attempts: StoredAttempt[] = sessions.flatMap((s) => s.attempts);
  const full = attempts.filter((a) => !a.drill);

  // Group attempts by the section practised, in the order first met.
  const sections = new Map<string, StoredAttempt[]>();
  for (const a of full) {
    const key = `${a.from}-${a.to}`;
    sections.set(key, [...(sections.get(key) ?? []), a]);
  }

  // What the teacher corrected, most frequent first, and whether it is fixed now.
  const corrections = new Map<string, { a: StoredAttempt; times: number }>();
  for (const a of attempts) {
    if (!a.correction) continue;
    const c = corrections.get(a.correction.key);
    corrections.set(a.correction.key, { a, times: (c?.times ?? 0) + 1 });
  }
  const fixedNow = (a: StoredAttempt) => {
    const beat = a.correction?.beat;
    if (beat == null) return full.length > 0 && full[full.length - 1].passed;
    const latest = [...full].reverse().find((x) => beat >= x.from && beat < x.to);
    return !!latest && latest.levels[beat - latest.from] !== 'bad';
  };

  const minutes = sessions.reduce((sum, s) => {
    const last = s.attempts[s.attempts.length - 1];
    return sum + (last ? (last.at - s.startedAt) / 60000 : 0);
  }, 0);
  const clean = full.filter((a) => a.passed).length;

  return (
    <main className="review">
      <button className="link" onClick={onBack}>
        ← Routines
      </button>
      <h1>Your progress: {lesson.title}</h1>
      {attempts.length === 0 ? (
        <p className="muted">No practice yet. Start a lesson and your attempts will show up here.</p>
      ) : (
        <>
          <ul className="stats">
            <li>
              <strong>{attempts.length}</strong> attempts
            </li>
            <li>
              <strong>{clean}</strong> clean runs
            </li>
            <li>
              <strong>{sections.size}</strong> sections practised
            </li>
            <li>
              <strong>{Math.max(1, Math.round(minutes))}</strong> minutes
            </li>
          </ul>
          <h2>First try and latest, section by section</h2>
          <div className="review-grid">
            {[...sections.values()].map((list) => {
              const first = list[0];
              const latest = list[list.length - 1];
              const pair = list.length > 1 ? [first, latest] : [first];
              return (
                <section key={`${first.from}-${first.to}`} className="card">
                  <h3>
                    {rangeShort(first.from, first.to, lesson.counts)} <small>{list.length} attempts</small>
                  </h3>
                  <HeatStrip attempts={pair} from={first.from} to={first.to} labels={list.length > 1 ? ['First', 'Latest'] : ['Only']} />
                </section>
              );
            })}
          </div>
          <h2>What your teacher corrected</h2>
          {corrections.size === 0 ? (
            <p className="muted">Nothing needed correcting.</p>
          ) : (
            <ul className="corrections">
              {[...corrections.values()]
                .sort((x, y) => y.times - x.times)
                .map(({ a, times }) => {
                  const c = a.correction!;
                  const where = c.beat === null ? 'Timing' : `Count ${countWord(c.beat)}${lesson.counts > 8 ? `, eight ${Math.floor(c.beat / 8) + 1}` : ''}`;
                  const what = c.group ? `${groupLabel(c.group)} ${FIX_WORDS[c.fix] ?? ''}` : c.fix === 'late' ? 'behind the beat' : 'ahead of the beat';
                  const fixed = fixedNow(a);
                  return (
                    <li key={c.key}>
                      <span className={`badge ${fixed ? 'ok' : ''}`}>{fixed ? 'Fixed' : 'Still working'}</span>
                      <span>
                        <strong>{where}:</strong> {what}
                      </span>
                      <small>corrected {times}×</small>
                    </li>
                  );
                })}
            </ul>
          )}
        </>
      )}
      <div className="review-actions">
        <button className="primary" onClick={onPractise}>
          Practise this routine
        </button>
        {attempts.length > 0 && (
          <button
            className="link"
            onClick={() => {
              if (window.confirm('Delete all practice history for this routine?')) {
                clearHistory(lesson.id);
                onBack();
              }
            }}
          >
            Clear history
          </button>
        )}
      </div>
    </main>
  );
}
