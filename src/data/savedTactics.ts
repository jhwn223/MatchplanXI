import type { TeamTactics } from "../components/match-arena/tactics";

/**
 * Plans the manager built himself, kept for the rest of the current run.
 *
 * Every instruction had to be set again from scratch at every kick-off, which
 * made anything but the three built-in presets not worth the effort. Held in
 * memory only (owned by the App root) rather than persisted storage: nothing
 * else in the app survives a restart, so a saved tactic outliving the run it
 * was made in would be the odd one out.
 */
export interface SavedTactic {
  id: string;
  name: string;
  tactics: TeamTactics;
}

export const MAX_SAVED_TACTICS = 6;

/** Saving under a name that already exists overwrites it rather than adding a duplicate. */
export function saveTactic(current: SavedTactic[], name: string, tactics: TeamTactics): SavedTactic[] {
  const trimmed = name.trim();
  if (!trimmed) return current;
  const existing = current.findIndex((entry) => entry.name === trimmed);
  const entry: SavedTactic = {
    id: existing >= 0 ? current[existing].id : `saved-${Date.now()}`,
    name: trimmed,
    tactics,
  };
  return existing >= 0
    ? current.map((item, index) => (index === existing ? entry : item))
    : [entry, ...current].slice(0, MAX_SAVED_TACTICS);
}

export function deleteSavedTactic(current: SavedTactic[], id: string): SavedTactic[] {
  return current.filter((entry) => entry.id !== id);
}
