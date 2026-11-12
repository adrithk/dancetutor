import { countInPhrase } from '../lesson/types';
import { StoredAttempt } from '../session/history';

interface Props {
  attempts: StoredAttempt[];
  from: number;
  to: number;
  /** Show at most this many of the latest attempts. */
  limit?: number;
  /** Row labels; defaults to the attempt number. */
  labels?: string[];
}

/** One row per attempt, one cell per count: red where it went wrong, green where it was right. */
export function HeatStrip({ attempts, from, to, limit = 6, labels }: Props) {
  const beats = Array.from({ length: to - from }, (_, i) => from + i);
  const shown = attempts.slice(-limit);
  const offset = attempts.length - shown.length;
  return (
    <div className="heat" role="table" aria-label="Attempts by count">
      <div className="heat-row heat-head" role="row">
        <span className="heat-label" />
        {beats.map((b) => (
          <span key={b} className="heat-count" role="columnheader">
            {countInPhrase(b)}
          </span>
        ))}
        <span className="heat-end" />
      </div>
      {shown.length === 0 && <div className="heat-empty">Your attempts will appear here.</div>}
      {shown.map((a, i) => (
        <div key={i} className="heat-row" role="row">
          <span className="heat-label">
            {labels?.[offset + i] ?? `#${offset + i + 1}`}
            <small>{a.drill ? 'drill' : `${Math.round(a.speed * 100)}%`}</small>
          </span>
          {beats.map((b) => {
            const level = b >= a.from && b < a.to ? a.levels[b - a.from] : null;
            return <span key={b} role="cell" className={`heat-cell ${level ? `lv-${level}` : 'lv-none'}`} title={level ?? 'not practised'} />;
          })}
          <span className={`heat-end ${a.passed ? 'ok' : ''}`}>{a.passed ? '✓' : ''}</span>
        </div>
      ))}
    </div>
  );
}
