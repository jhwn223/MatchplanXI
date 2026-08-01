import { describe, expect, test } from "vitest";
import fc26Ratings from "../../data/fc26PlayerRatings.json";
import type { Player, PlayerAbility, Position, Team } from "../../data/types";
import { buildOpponentPlan } from "./opponentPlan";

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
});
