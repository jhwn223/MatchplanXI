import { describe, expect, test } from "vitest";
import fc26Ratings from "../../data/fc26PlayerRatings.json";
import type { Player, PlayerAbility, Position, Team } from "../../data/types";
import { DEFAULT_TEAM_TACTICS } from "../match-arena/tactics";
import { buildOpponentPlan, decideOpponentTacticChange } from "./opponentPlan";

const baseAbility = Object.values(fc26Ratings)[0] as PlayerAbility;

function team(teamId: number): Team {
  return {
    team_id: teamId,
    team_name: `Test Team ${teamId}`,
    fifa_code: `T${teamId}`,
    group_letter: "A",
    confederation: "UEFA",
    fifa_ranking_pre_tournament: teamId,
    elo_rating: 1600,
    manager_name: "Test Manager",
  };
}

function squad(teamId: number, height: number, aerial: number): Player[] {
  const positions: Position[] = [
    "GK",
    "DEF", "DEF", "DEF", "DEF",
    "MID", "MID", "MID",
    "FWD", "FWD", "FWD",
  ];
  return positions.map((position, index) => ({
    player_id: teamId * 100 + index,
    team_id: teamId,
    player_name: `Player ${teamId}-${index}`,
    position,
    club_team: "Test FC",
    market_value_eur: 0,
    caps: 0,
    date_of_birth: "2000-01-01",
    height_cm: height,
    goals: 0,
    ability: {
      ...baseAbility,
      source: "estimated",
      overall: 70,
      pace: 70,
      passing: 70,
      defending: 70,
      physical: 70,
      crossing: 70,
      finishing: 70,
      stamina: 70,
      jumping: aerial,
      headingAccuracy: aerial,
      strength: aerial,
    },
  }));
}

describe("opponent scouting report", () => {
  const squads = [
    squad(1, 195, 92),
    squad(2, 186, 78),
    squad(3, 178, 62),
    squad(4, 170, 45),
  ];
  const referencePlayers = squads.flat();

  test("classifies a tall, strong aerial squad as an aerial strength", () => {
    const plan = buildOpponentPlan({
      team: team(1),
      squad: squads[0],
      referencePlayers,
      elevation: 0,
      isHome: false,
      seed: 1,
    });

    expect(plan.strengths).toContain("높은 타깃과 제공권을 활용한 세트피스 위협");
    expect(plan.strengths).toContain("수비진의 제공권과 높은 크로스 대응");
  });

  test("classifies a short, weak aerial squad as an aerial weakness", () => {
    const plan = buildOpponentPlan({
      team: team(4),
      squad: squads[3],
      referencePlayers,
      elevation: 0,
      isHome: false,
      seed: 4,
    });

    expect(plan.weaknesses).toContain("높은 크로스와 공중볼 공격 위력 부족");
    expect(plan.weaknesses).toContain("세트피스와 높은 크로스 수비 취약");
  });

  test("keeps both relative strengths and weaknesses populated", () => {
    for (const [index, players] of squads.entries()) {
      const plan = buildOpponentPlan({
        team: team(index + 1),
        squad: players,
        referencePlayers,
        elevation: 0,
        isHome: false,
        seed: index + 1,
      });

      expect(plan.strengths.length).toBeGreaterThanOrEqual(2);
      expect(plan.weaknesses.length).toBeGreaterThanOrEqual(2);
      expect(plan.strengths.length).toBeLessThanOrEqual(5);
      expect(plan.weaknesses.length).toBeLessThanOrEqual(5);
    }
  });
});

describe("opponent in-match decisions", () => {
  test("can chase early when the score deficit is already large", () => {
    const decision = decideOpponentTacticChange({
      minute: 40,
      userGoals: 3,
      oppGoals: 1,
      current: DEFAULT_TEAM_TACTICS,
      userTactics: DEFAULT_TEAM_TACTICS,
      live: null,
    });

    expect(decision?.tactics.mentality).toBe("attacking");
    expect(decision?.tactics.shooting).toBe("onSight");
  });

  test("raises threat without going all-out for a one-goal deficit at 60 minutes", () => {
    const decision = decideOpponentTacticChange({
      minute: 60,
      userGoals: 1,
      oppGoals: 0,
      current: DEFAULT_TEAM_TACTICS,
      userTactics: DEFAULT_TEAM_TACTICS,
      live: null,
    });

    expect(decision?.tactics.mentality).toBe("positive");
    expect(decision?.tactics.shooting).toBe("balanced");
    expect(decision?.tactics.defensiveLine).toBe("standard");
  });

  test("uses an all-out chase for a one-goal deficit late on", () => {
    const decision = decideOpponentTacticChange({
      minute: 80,
      userGoals: 1,
      oppGoals: 0,
      current: DEFAULT_TEAM_TACTICS,
      userTactics: DEFAULT_TEAM_TACTICS,
      live: null,
    });

    expect(decision?.tactics.mentality).toBe("attacking");
    expect(decision?.tactics.shooting).toBe("onSight");
  });
});
