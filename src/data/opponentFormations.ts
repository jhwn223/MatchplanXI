import { FORMATION_KEYS, type FormationKey } from "./formation";
import formationData from "./opponentFormations.json";

interface FormationReportRecord {
  match: string;
  sourceUrl: string;
}

interface TeamFormationRecord {
  formation: string;
  reportId: string;
}

interface OpponentFormationDataset {
  metadata: {
    description: string;
    updatedAt: string;
    methodology: string;
    sourceHub: string;
  };
  reports: Record<string, FormationReportRecord>;
  teams: Record<string, TeamFormationRecord>;
}

export interface ObservedFormation {
  formation: FormationKey;
  matchId: string;
  match: string;
  sourceName: string;
  sourceUrl: string;
}

const data = formationData as OpponentFormationDataset;

function isFormationKey(value: string): value is FormationKey {
  return FORMATION_KEYS.includes(value as FormationKey);
}

export function getObservedFormation(fifaCode: string): ObservedFormation | null {
  const team = data.teams[fifaCode.toUpperCase()];
  if (!team || !isFormationKey(team.formation)) return null;

  const report = data.reports[team.reportId];
  if (!report) return null;

  return {
    formation: team.formation,
    matchId: team.reportId,
    match: report.match,
    sourceName: "FIFA Training Centre 경기 리포트",
    sourceUrl: report.sourceUrl,
  };
}

export const OPPONENT_FORMATION_DATASET = data.metadata;
