// Tunable numbers for judging and pacing, kept in one place.

export const TUNING = {
  /** Largest allowed limb angle error, in degrees, before a count fails. */
  toleranceDeg: { essential: 20, normal: 28, free: Infinity },
  /** Limbs seen with less confidence than this are neither judged nor corrected. */
  minConfidence: 0.5,
  /** Timing is searched within this fraction of a beat either side. */
  timingSearchBeats: 0.5,
  /** A count is off-time beyond this fraction of a beat. */
  timingToleranceBeats: 0.3,
  /** Timing is only trusted when shifting the reference improves the match by this many degrees. */
  timingMinGainDeg: 5,
  /** Live highlight thresholds, in degrees. */
  liveWarnDeg: 18,
  liveBadDeg: 32,
  /** Delay between a movement and its camera frame arriving, in milliseconds. */
  cameraLatencyMs: 90,
};

export type Pace = 'full' | 'quick';

export const PACING = {
  full: {
    rungs: [0.6, 0.8, 1],
    learnStartRung: 0,
    joinStartRung: 1,
    passesToAdvance: 2,
  },
  /** Shorter ladder for demos. */
  quick: {
    rungs: [0.8, 1],
    learnStartRung: 0,
    joinStartRung: 1,
    passesToAdvance: 1,
  },
  /** The same correction this many times in a row starts a drill. */
  drillAfterRepeats: 2,
  drillSpeed: 0.6,
  drillMaxTries: 3,
  /** After this many attempts without passing, move on and come back later. */
  maxAttemptsPerStep: 8,
  /** Failed attempts in a row before dropping to a slower speed. */
  failsBeforeSlowing: 2,
  countInBeats: 4,
};
