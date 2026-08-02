import type { TeamAbilityProfile } from "../playerAbility";
import { clamp, mulberry32, poisson } from "./random";
import { BALANCED_SIM_TACTICS } from "./tactics";
import type { SimTacticProfile } from "./types";

export interface QuickSimTeamInput {
  elo: number;
  ability?: TeamAbilityProfile;
  conditionIndex?: number;
  tactics?: SimTacticProfile;
}

export interface QuickSimInput {
  seed: number;
  home: QuickSimTeamInput;
  away: QuickSimTeamInput;
  elevation?: number;
  homeAdvantage?: boolean;
}

export interface QuickSimOptions {
  homeAbility?: TeamAbilityProfile;
  awayAbility?: TeamAbilityProfile;
  homeConditionIndex?: number;
  awayConditionIndex?: number;
  homeTactics?: SimTacticProfile;
  awayTactics?: SimTacticProfile;
  elevation?: number;
  homeAdvantage?: boolean;
}

const NEUTRAL_ABILITY: TeamAbilityProfile = {
  overall: 70,
  attack: 70,
  creativity: 70,
  defense: 70,
  goalkeeper: 70,
  stamina: 70,
};

function computeXg(input: {
  home: Required<QuickSimTeamInput>;
  away: Required<QuickSimTeamInput>;
  elevation: number;
  homeAdvantage: boolean;
}) {
  const homeAdvantage = input.homeAdvantage ? 0.22 : 0;
  const eloDiff = (input.home.elo - input.away.elo) / 400;
  const conditionEdge =
    (input.home.conditionIndex - input.away.conditionIndex) / 100;
  const homeAttackEdge =
    (input.home.ability.attack - input.away.ability.defense) / 24 +
    (input.home.ability.creativity - input.away.ability.goalkeeper) / 52;
  const awayAttackEdge =
    (input.away.ability.attack - input.home.ability.defense) / 24 +
    (input.away.ability.creativity - input.home.ability.goalkeeper) / 52;
  const staminaEdge =
    (input.home.ability.stamina - input.away.ability.stamina) / 85;
  const altitudeLoad = clamp((input.elevation - 900) / 3_600, 0, 0.55);
  const homeFatigue =
    altitudeLoad * (100 - input.home.ability.stamina) / 210;
  const awayFatigue =
    altitudeLoad * (100 - input.away.ability.stamina) / 190;
  const homeTacticAttack =
    input.home.tactics.attackBias * 0.28 +
    input.home.tactics.creativityBias * 0.12 +
    input.home.tactics.shootingBias * 0.08;
  const awayTacticAttack =
    input.away.tactics.attackBias * 0.28 +
    input.away.tactics.creativityBias * 0.12 +
    input.away.tactics.shootingBias * 0.08;
  return {
    homeXg: clamp(
      1.18 +
        eloDiff * 0.46 +
        conditionEdge * 0.8 +
        homeAttackEdge +
        staminaEdge +
        homeTacticAttack +
        homeAdvantage -
        homeFatigue,
      0.15,
      4.8
    ),
    awayXg: clamp(
      1.12 -
        eloDiff * 0.42 -
        conditionEdge * 0.72 +
        awayAttackEdge -
        staminaEdge +
        awayTacticAttack -
        awayFatigue,
      0.15,
      4.2
    ),
  };
}

function completeTeam(team: QuickSimTeamInput): Required<QuickSimTeamInput> {
  return {
    elo: team.elo,
    ability: team.ability ?? NEUTRAL_ABILITY,
    conditionIndex: team.conditionIndex ?? 72,
    tactics: team.tactics ?? BALANCED_SIM_TACTICS,
  };
}

export function quickSimExpectedGoals(input: QuickSimInput) {
  return computeXg({
    home: completeTeam(input.home),
    away: completeTeam(input.away),
    elevation: input.elevation ?? 0,
    homeAdvantage: input.homeAdvantage ?? true,
  });
}

export function quickSimMatch(input: QuickSimInput) {
  const rng = mulberry32(input.seed >>> 0);
  const { homeXg, awayXg } = quickSimExpectedGoals(input);
  return {
    home: poisson(homeXg, rng),
    away: poisson(awayXg, rng),
    homeXg,
    awayXg,
  };
}

export function quickSimScore(
  seed: number,
  eloHome: number,
  eloAway: number,
  options: QuickSimOptions = {},
) {
  const result = quickSimMatch({
    seed,
    home: {
      elo: eloHome,
      ability: options.homeAbility,
      conditionIndex: options.homeConditionIndex,
      tactics: options.homeTactics,
    },
    away: {
      elo: eloAway,
      ability: options.awayAbility,
      conditionIndex: options.awayConditionIndex,
      tactics: options.awayTactics,
    },
    elevation: options.elevation,
    homeAdvantage: options.homeAdvantage,
  });
  return { home: result.home, away: result.away };
}
