import { useMemo, useState } from "react";
import "./App.css";
import { useTournamentData } from "./hooks/useTournamentData";
import { getTeamMatches, type PlayedMap, type PlayedResult, type TeamMatch } from "./data/tournament";
import { KO_ROUND_EN, type KOMatch, type KOResults } from "./data/tournamentEngine";
import type { MatchDetailed } from "./data/types";
import { CountrySelect } from "./components/CountrySelect";
import { TeamHub } from "./components/TeamHub";
import { Bracket } from "./components/Bracket";
import { MatchBoard, emptySlots, type Lineup } from "./components/MatchBoard";
import { ConditionDesk } from "./components/ConditionDesk";

type View = "select" | "hub" | "match" | "bracket" | "komatch" | "condition";

function koMatchIdNum(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return 900000 + (Math.abs(h) % 90000);
}

function App() {
  const { data, loading, error } = useTournamentData();
  const [view, setView] = useState<View>("select");
  const [teamId, setTeamId] = useState<number | null>(null);
  const [activeMatchId, setActiveMatchId] = useState<number | null>(null);
  const [lineups, setLineups] = useState<Record<number, Lineup>>({});
  const [played, setPlayed] = useState<PlayedMap>({});
  // knockout state
  const [koResults, setKoResults] = useState<KOResults>({});
  const [koLineups, setKoLineups] = useState<Record<string, Lineup>>({});
  const [activeKo, setActiveKo] = useState<KOMatch | null>(null);
  const [restBias, setRestBias] = useState<Record<number, number>>({});

  const team = useMemo(
    () => (data && teamId != null ? data.teams.find((t) => t.team_id === teamId) ?? null : null),
    [data, teamId]
  );
  const teamMatches = useMemo(
    () => (data && team ? getTeamMatches(data, team.team_name) : []),
    [data, team]
  );

  if (loading) return <div className="status-screen">데이터를 불러오는 중…</div>;
  if (error || !data)
    return <div className="status-screen status-screen--error">데이터 로드 실패: {error}</div>;

  function pickTeam(id: number) {
    setTeamId(id);
    setLineups({});
    setPlayed({});
    setKoResults({});
    setKoLineups({});
    setRestBias({});
    setView("hub");
  }

  function changeRestBias(playerId: number, value: number) {
    setRestBias((prev) => ({ ...prev, [playerId]: value }));
  }

  function recordResult(matchId: number, result: PlayedResult) {
    setPlayed((prev) => ({ ...prev, [matchId]: result }));
  }

  /** next unplayed group-stage fixture after the given one, chronologically; null if none left. */
  function nextGroupMatch(afterMatchId: number): number | null {
    const groupMatches = teamMatches
      .filter((tm) => tm.match.stage_name === "Group Stage")
      .sort((a, b) => a.order - b.order);
    const idx = groupMatches.findIndex((tm) => tm.match.match_id === afterMatchId);
    for (let i = idx + 1; i < groupMatches.length; i++) {
      if (!played[groupMatches[i].match.match_id]) return groupMatches[i].match.match_id;
    }
    return null;
  }

  function goToNextGroupMatch(afterMatchId: number) {
    const nextId = nextGroupMatch(afterMatchId);
    if (nextId != null) openMatch(nextId);
    else setView("hub");
  }

  function openMatch(matchId: number) {
    setActiveMatchId(matchId);
    setLineups((prev) =>
      prev[matchId] ? prev : { ...prev, [matchId]: { formation: "4-3-3", slots: emptySlots("4-3-3") } }
    );
    setView("match");
  }

  function openKO(m: KOMatch) {
    setActiveKo(m);
    setKoLineups((prev) =>
      prev[m.id] ? prev : { ...prev, [m.id]: { formation: "4-3-3", slots: emptySlots("4-3-3") } }
    );
    setView("komatch");
  }

  // build a synthetic TeamMatch for a knockout tie (user always "home")
  function koTeamMatch(m: KOMatch): TeamMatch | null {
    if (!team || !m.a || !m.b) return null;
    const userIsA = m.a.name === team.team_name;
    const opp = userIsA ? m.b : m.a;
    const match: MatchDetailed = {
      match_id: koMatchIdNum(m.id),
      date: "",
      kickoff_time_utc: "",
      stage_name: KO_ROUND_EN[m.round],
      stadium_name: m.venue.stadium_name,
      city: m.venue.city,
      country: m.venue.country,
      home_team_name: team.team_name,
      home_fifa_code: team.fifa_code,
      away_team_name: opp.name,
      away_fifa_code: opp.code,
      home_score: null,
      away_score: null,
      home_penalty_score: null,
      away_penalty_score: null,
      status: "Scheduled",
      result_type: "",
    };
    return {
      match,
      isHome: true,
      opponentName: opp.name,
      opponentCode: opp.code,
      venue: m.venue,
      elevation: m.venue.elevation_meters,
      restDays: 4,
      order: 99,
    };
  }

  const lineupCounts: Record<number, number> = {};
  for (const [mid, lu] of Object.entries(lineups)) {
    lineupCounts[Number(mid)] = Object.values(lu.slots).filter((v) => v != null).length;
  }

  if (view === "select") {
    return <CountrySelect teams={data.teams} onPick={pickTeam} />;
  }

  if (view === "hub" && team) {
    return (
      <TeamHub
        data={data}
        team={team}
        lineupCounts={lineupCounts}
        played={played}
        onBack={() => setView("select")}
        onOpenMatch={openMatch}
        onOpenBracket={() => setView("bracket")}
        onOpenCondition={() => setView("condition")}
      />
    );
  }

  if (view === "condition" && team) {
    return (
      <ConditionDesk
        data={data}
        team={team}
        restBias={restBias}
        onChangeRestBias={changeRestBias}
        onBack={() => setView("hub")}
      />
    );
  }

  if (view === "bracket" && team) {
    return (
      <Bracket
        data={data}
        team={team}
        played={played}
        koResults={koResults}
        onBack={() => setView("hub")}
        onPlayKO={openKO}
      />
    );
  }

  if (view === "match" && team && activeMatchId != null) {
    const activeMatch = teamMatches.find((tm) => tm.match.match_id === activeMatchId);
    const lineup = lineups[activeMatchId];
    if (activeMatch && lineup) {
      return (
        <MatchBoard
          data={data}
          team={team}
          teamMatches={teamMatches}
          activeMatch={activeMatch}
          lineup={lineup}
          restBias={restBias}
          onChangeLineup={(next) => setLineups((prev) => ({ ...prev, [activeMatchId]: next }))}
          onBack={() => setView("hub")}
          onPlayed={recordResult}
          onNextMatch={() => goToNextGroupMatch(activeMatchId)}
        />
      );
    }
  }

  if (view === "komatch" && team && activeKo) {
    const activeMatch = koTeamMatch(activeKo);
    const lineup = koLineups[activeKo.id];
    if (activeMatch && lineup) {
      return (
        <MatchBoard
          data={data}
          team={team}
          teamMatches={teamMatches}
          activeMatch={activeMatch}
          lineup={lineup}
          restBias={restBias}
          onChangeLineup={(next) => setKoLineups((prev) => ({ ...prev, [activeKo.id]: next }))}
          onBack={() => setView("bracket")}
          onPlayed={(_, result) =>
            setKoResults((prev) => ({
              ...prev,
              [activeKo.id]: { userGoals: result.homeGoals, oppGoals: result.awayGoals },
            }))
          }
          onNextMatch={() => setView("bracket")}
        />
      );
    }
  }

  return <CountrySelect teams={data.teams} onPick={pickTeam} />;
}

export default App;
