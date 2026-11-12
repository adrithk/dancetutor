import { Step } from '../coach/planner';
import { rangeShort } from '../coach/phrasing';

interface Props {
  steps: Step[];
  stepIndex: number;
  done: string[];
  shaky: string[];
  totalCounts: number;
}

const KIND_LABEL: Record<Step['kind'], string> = {
  learn: 'Learn',
  join: 'Join',
  link: 'Link',
  top: 'From the top',
  review: 'Review',
};

/** The whole lesson plan at a glance: what is learned, what is next, what is still shaky. */
export function RoutineMap({ steps, stepIndex, done, shaky, totalCounts }: Props) {
  return (
    <ol className="map">
      {steps.map((s, i) => {
        const status = i === stepIndex ? 'current' : shaky.includes(s.id) ? 'shaky' : done.includes(s.id) ? 'done' : i < stepIndex ? 'shaky' : 'todo';
        return (
          <li key={s.id} className={`map-step is-${status} kind-${s.kind}`} aria-current={i === stepIndex ? 'step' : undefined}>
            <span className="map-kind">{KIND_LABEL[s.kind]}</span>
            <span className="map-range">{rangeShort(s.from, s.to, totalCounts)}</span>
          </li>
        );
      })}
    </ol>
  );
}
