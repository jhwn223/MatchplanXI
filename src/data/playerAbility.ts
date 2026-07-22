import type { ConditionBreakdown } from "./conditionEngine";
import type { Player } from "./types";

export interface TeamAbilityProfile {
  overall: number;
  attack: number;
  creativity: number;
  defense: number;
  goalkeeper: number;
  stamina: number;
}

const DEFAULT_PROFILE: TeamAbilityProfile = {
  overall: 70,
  attack: 70,
  creativity: 70,
  defense: 70,
  goalkeeper: 70,
  stamina: 70,
};

function average(values: number[], fallback: number) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;
}

function bestAverage(values: number[], count: number, fallback: number) {
  return average([...values].sort((a, b) => b - a).slice(0, count), fallback);
}

export function selectBestEleven(squad: Player[]): Player[] {
  const byOverall = (a: Player, b: Player) => (b.ability?.overall ?? 0) - (a.ability?.overall ?? 0);
  const quotas = { GK: 1, DEF: 4, MID: 3, FWD: 3 } as const;
  const selected: Player[] = [];
  for (const position of Object.keys(quotas) as Array<keyof typeof quotas>) {
    selected.push(...squad.filter((player) => player.position === position).sort(byOverall).slice(0, quotas[position]));
  }
  if (selected.length < 11) {
    const picked = new Set(selected.map((player) => player.player_id));
    selected.push(...squad.filter((player) => !picked.has(player.player_id)).sort(byOverall).slice(0, 11 - selected.length));
  }
  return selected;
}

export function buildTeamAbilityProfile(
  players: Player[],
  conditions?: Map<number, ConditionBreakdown>
): TeamAbilityProfile {
  if (!players.length) return DEFAULT_PROFILE;
  const outfield = players.filter((player) => player.position !== "GK" && player.ability);
  const keepers = players.filter((player) => player.position === "GK" && player.ability);
  const conditionMultiplier = (player: Player) => {
    const score = conditions?.get(player.player_id)?.score;
    return score == null ? 1 : 0.88 + score / 500;
  };
  const adjusted = (value: number, player: Player) => value * conditionMultiplier(player);

  const attacking = outfield.map((player) => {
    const a = player.ability!;
    return adjusted(a.shooting * 0.35 + a.finishing * 0.3 + a.positioning * 0.2 + a.pace * 0.15, player);
  });
  const creative = outfield.map((player) => {
    const a = player.ability!;
    return adjusted(a.passing * 0.35 + a.vision * 0.25 + a.shortPassing * 0.2 + a.dribbling * 0.2, player);
  });
  const defending = outfield.map((player) => {
    const a = player.ability!;
    return adjusted(a.defending * 0.35 + a.defensiveAwareness * 0.25 + a.interceptions * 0.2 + a.physical * 0.2, player);
  });
  const goalkeeper = keepers.map((player) => {
    const a = player.ability!;
    return adjusted((a.gkDiving + a.gkHandling + a.gkPositioning + a.gkReflexes) / 4, player);
  });

  return {
    overall: average(players.map((player) => adjusted(player.ability?.overall ?? 70, player)), 70),
    attack: bestAverage(attacking, 4, 70),
    creativity: bestAverage(creative, 5, 70),
    defense: bestAverage(defending, 5, 70),
    goalkeeper: average(goalkeeper, 70),
    stamina: average(players.map((player) => adjusted(player.ability?.stamina ?? 70, player)), 70),
  };
}
