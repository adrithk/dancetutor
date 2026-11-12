import { Pace } from '../config';

export interface Settings {
  /** Copy the teacher like a mirror image (true) or use the same side they do (false). */
  mirror: boolean;
  pace: Pace;
  voice: boolean;
  /** Practise with a simulated dancer instead of the camera. */
  simulated: boolean;
}

export function initialSettings(): Settings {
  const q = new URLSearchParams(window.location.search);
  return {
    mirror: q.get('mirror') !== '0',
    pace: q.get('pace') === 'quick' ? 'quick' : 'full',
    voice: q.get('voice') !== '0',
    simulated: q.get('sim') === '1',
  };
}
