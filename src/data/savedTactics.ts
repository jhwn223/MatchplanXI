import { DEFAULT_TEAM_TACTICS, type TeamTactics } from "../components/match-arena/tactics";

/**
 * Plans the manager built himself, kept between matches.
 *
 * Every instruction had to be set again from scratch at every kick-off, which
 * made anything but the three built-in presets not worth the effort.
 */
export interface SavedTactic {
  id: string;
  name: string;
  tactics: TeamTactics;
}

const STORAGE_KEY = "altitude-tactics:saved-tactics";
export const MAX_SAVED_TACTICS = 6;

/** Unknown or renamed fields are filled from the defaults, so an old save still loads. */
function reconcile(stored: Partial<TeamTactics> | undefined): TeamTactics {
  const merged = { ...DEFAULT_TEAM_TACTICS } as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_TEAM_TACTICS)) {
    const value = (stored as Record<string, unknown> | undefined)?.[key];
    if (value !== undefined) merged[key] = value;
  }
  return merged as unknown as TeamTactics;
}

export function loadSavedTactics(): SavedTactic[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry != null)
      .map((entry, index) => ({
        id: typeof entry.id === "string" ? entry.id : `saved-${index}`,
        name: typeof entry.name === "string" && entry.name.trim() ? entry.name : `내 전술 ${index + 1}`,
        tactics: reconcile(entry.tactics as Partial<TeamTactics> | undefined),
      }))
      .slice(0, MAX_SAVED_TACTICS);
  } catch {
    // A corrupted entry must not stop the match screen from opening.
    return [];
  }
}

function persist(entries: SavedTactic[]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage being full or blocked is not worth interrupting a match for.
  }
}

/** Saving under a name that already exists overwrites it rather than adding a duplicate. */
export function saveTactic(name: string, tactics: TeamTactics): SavedTactic[] {
  const trimmed = name.trim();
  if (!trimmed) return loadSavedTactics();
  const current = loadSavedTactics();
  const existing = current.findIndex((entry) => entry.name === trimmed);
  const entry: SavedTactic = {
    id: existing >= 0 ? current[existing].id : `saved-${Date.now()}`,
    name: trimmed,
    tactics,
  };
  const next = existing >= 0
    ? current.map((item, index) => (index === existing ? entry : item))
    : [entry, ...current].slice(0, MAX_SAVED_TACTICS);
  persist(next);
  return next;
}

export function deleteSavedTactic(id: string): SavedTactic[] {
  const next = loadSavedTactics().filter((entry) => entry.id !== id);
  persist(next);
  return next;
}
