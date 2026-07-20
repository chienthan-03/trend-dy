export type DuckInterval = { startSec: number; endSec: number };

export type BuildDuckVolumeFilterInput = {
  intervals: DuckInterval[];
  duckGain: number;
};

/**
 * Builds a single ffmpeg `volume` filter expression that ducks (lowers)
 * the original track's volume during narration windows and leaves it at
 * full volume everywhere else, e.g.:
 *
 *   volume=eval=frame:volume='if(between(t,1,2)+between(t,5,6),0.2,1)'
 *
 * `between(...)` returns 0/1 per window; summing them ORs the windows since
 * `mergeNarrationIntervals` already guarantees they don't overlap. With no
 * intervals, the original track is left untouched (`volume=1`).
 */
export const buildDuckVolumeFilter = ({
  intervals,
  duckGain,
}: BuildDuckVolumeFilterInput): string => {
  if (intervals.length === 0) {
    return "volume=1";
  }

  const betweenExpr = intervals
    .map((interval) => `between(t,${interval.startSec},${interval.endSec})`)
    .join("+");

  return `volume=eval=frame:volume='if(${betweenExpr},${duckGain},1)'`;
};
