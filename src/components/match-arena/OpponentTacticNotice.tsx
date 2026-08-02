import type { OpponentTacticChange } from "../match-board/opponentPlan";

interface Props {
  changes: OpponentTacticChange[];
  /** Playback minute: a change the viewer has not reached yet is not news. */
  minute: number;
}

/**
 * What the opposition manager has just done about us.
 *
 * The stats tab and the feed tab each used to render this themselves, with
 * different markup and — worse — different data: the stats tab took the last
 * change outright, so a replay paused at half time already showed a response
 * the manager would not make until the seventieth minute.
 */
export function OpponentTacticNotice({ changes, minute }: Props) {
  const latest = changes.filter((change) => change.minute <= minute).at(-1);
  if (!latest) return null;
  return (
    <div className="arena-opponent-change" role="status">
      <span>{latest.minute}' 상대 전술 변화</span>
      <strong>{latest.title}</strong>
      <p>{latest.detail}</p>
    </div>
  );
}
