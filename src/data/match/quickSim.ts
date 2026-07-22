import type { TeamAbilityProfile } from "../playerAbility";
import { clamp, mulberry32, poisson } from "./random";

function computeXg(input: {
  userElo: number;
  oppElo: number;
  conditionIndex: number;
  attackBias: number;
  isHome: boolean;
  userAbility: TeamAbilityProfile;
  oppAbility: TeamAbilityProfile;
}) {
  const homeAdvantage = input.isHome ? 0.25 : 0;
  const eloDiff = (input.userElo - input.oppElo) / 400;
  const conditionFactor = (input.conditionIndex - 62) / 100;
  const userAttackEdge =
    (input.userAbility.attack - input.oppAbility.defense) / 22 +
    (input.userAbility.creativity - input.oppAbility.goalkeeper) / 48;
  const oppAttackEdge =
    (input.oppAbility.attack - input.userAbility.defense) / 22 +
    (input.oppAbility.creativity - input.userAbility.goalkeeper) / 48;
  const staminaEdge = (input.userAbility.stamina - input.oppAbility.stamina) / 80;
  return {
    userXg: clamp(
      1.18 + eloDiff * 0.48 + conditionFactor * 1.25 + userAttackEdge + staminaEdge + input.attackBias * 0.55 + homeAdvantage,
      0.15,
      4.8
    ),
    oppXg: clamp(
      1.18 - eloDiff * 0.42 - conditionFactor * 0.7 + oppAttackEdge - staminaEdge + input.attackBias * 0.3 + (input.isHome ? 0 : 0.25),
      0.15,
      4.2
    ),
  };
}

export function quickSimScore(seed: number, eloHome: number, eloAway: number) {
  const rng = mulberry32(seed >>> 0);
  const neutralAbility: TeamAbilityProfile = {
    overall: 70,
    attack: 70,
    creativity: 70,
    defense: 70,
    goalkeeper: 70,
    stamina: 70,
  };
  const { userXg, oppXg } = computeXg({
    userElo: eloHome,
    oppElo: eloAway,
    conditionIndex: 62,
    attackBias: 0,
    isHome: true,
    userAbility: neutralAbility,
    oppAbility: neutralAbility,
  });
  return { home: poisson(userXg, rng), away: poisson(oppXg, rng) };
}
