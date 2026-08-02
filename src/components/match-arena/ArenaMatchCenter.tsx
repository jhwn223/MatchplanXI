import { useMemo, useState, type CSSProperties } from "react";
import type { LiveMatchSnapshot, MatchEvent, PassType, PlayerMatchStats } from "../../data/matchSim";
import { ballDwell, playerDwell } from "../../data/matchSim";
import { FORMATION_KEYS, slotsOf, type FormationKey, type SlotPositions } from "../../data/formation";
import type { Player } from "../../data/types";
import type { PlayerRole, SlotRoleAssignments } from "../../data/playerRoles";
import type { SetPieceAssignments } from "../../data/tactics";
import type { SavedTactic } from "../../data/savedTactics";
import { Bench } from "../Bench";
import { Pitch } from "../Pitch";
import { TeamFlag } from "../TeamFlag";
import { OpponentAnalysisPanel } from "../match-board/OpponentAnalysisPanel";
import type { ArenaSim, ArenaSquadControls } from "./types";
import { ArenaEventMap, type EventMapMode } from "./ArenaEventMap";
import { ArenaLiveStats } from "./ArenaLiveStats";
import { ArenaTacticsPanel } from "./ArenaTacticsPanel";
import { ALL_PASS_TYPES, PASS_TYPE_META } from "./passMap";
import { applyQuickTactic, type QuickTacticKey, type TeamTactics } from "./tactics";
import { disciplineFromEvents, type PlayerDiscipline } from "../playerDiscipline";

export type MatchCenterTab =
  | "overview"
  | "ratings"
  | "analysis"
  | "tactics"
  | "squad"
  | "opponent";

interface Props {
  activeTab: MatchCenterTab;
  onTabChange: (tab: MatchCenterTab) => void;
  sim: ArenaSim;
  live: LiveMatchSnapshot | null;
  minute: number;
  userTeamName: string;
  userCode: string;
  oppTeamName: string;
  formation: FormationKey;
  formationLabel?: string;
  tactics: TeamTactics;
  slots: Record<string, number | null>;
  positions?: SlotPositions;
  slotRoles?: SlotRoleAssignments;
  playersById: Map<number, Player>;
  opponentPlayers: Player[];
  opponentBench: Player[];
  dismissedOpponentPlayers?: Player[];
  opponentFormation?: FormationKey;
  opponentTactics?: TeamTactics;
  squadControls?: ArenaSquadControls;
  onApplyTactics: (tactics: TeamTactics) => void;
  onRoleChange?: (slotId: string, role: PlayerRole) => void;
  onFormationChange?: (formation: FormationKey) => void;
  setPieces?: SetPieceAssignments;
  onSetPieceChange?: (assignments: SetPieceAssignments) => void;
  dismissalNotice?: string | null;
  dismissalSide?: "user" | "opp" | null;
  discipline?: Map<number, PlayerDiscipline>;
  opponentDiscipline?: Map<number, PlayerDiscipline>;
  savedTactics?: SavedTactic[];
  onSaveTactic?: (name: string, tactics: TeamTactics) => void;
  onDeleteTactic?: (id: string) => void;
}

export function ArenaMatchCenter({
  activeTab,
  onTabChange,
  sim,
  live,
  minute,
  userTeamName,
  userCode,
  oppTeamName,
  formation,
  formationLabel,
  tactics,
  slots,
  positions,
  slotRoles,
  playersById,
  opponentPlayers,
  opponentBench,
  dismissedOpponentPlayers = [],
  opponentFormation,
  opponentTactics,
  squadControls,
  onApplyTactics,
  onRoleChange,
  onFormationChange,
  setPieces,
  onSetPieceChange,
  dismissalNotice,
  dismissalSide,
  discipline: suppliedDiscipline,
  opponentDiscipline,
  savedTactics,
  onSaveTactic,
  onDeleteTactic,
}: Props) {
  const events = useMemo(() => sim.events ?? [], [sim.events]);
  const eventDiscipline = useMemo(() => disciplineFromEvents(events, "user"), [events]);
  const discipline = suppliedDiscipline ?? eventDiscipline;
  const advice = buildAdvice(live, minute, sim.userGoals, sim.oppGoals);
  // Stamina in the squad tab is what it is right now: the live snapshot holds
  // each player's current condition, so it is overlaid on the pre-match
  // breakdown. Bench players keep their pre-match figure — they have not run.
  const liveConditions = useMemo(() => {
    if (!squadControls) return undefined;
    const current = new Map(
      (live?.players ?? [])
        .filter((player) => player.side === "user")
        .map((player) => [player.playerId, player.condition]),
    );
    if (!current.size) return squadControls.conditions;
    return new Map(
      [...squadControls.conditions].map(([playerId, breakdown]) => {
        const score = current.get(playerId);
        return [playerId, score == null ? breakdown : { ...breakdown, score }] as const;
      }),
    );
  }, [live?.players, squadControls]);

  return (
    <section className="match-center">
      <header className="match-center__header">
        <nav>
          {([
            ["overview", "개요"],
            ["ratings", "선수 평점"],
            ["analysis", "경기 분석"],
            ["tactics", "전술"],
            ...(squadControls
              ? ([["squad", "스쿼드 · 교체"], ["opponent", "상대 분석"]] as const)
              : []),
          ] as const).map(([key, label]) => (
            <button key={key} type="button" data-active={activeTab === key || undefined} onClick={() => onTabChange(key)}>
              {label}
            </button>
          ))}
        </nav>
      </header>

      {activeTab === "overview" && (
        <div className="match-overview">
          <div className="match-overview__score">
            <span>{userTeamName}</span><strong>{sim.userGoals} : {sim.oppGoals}</strong><span>{oppTeamName}</span>
          </div>
          <div className="match-overview__content">
            <section className="match-stat-card">
              <h3>경기 흐름</h3>
              <ArenaLiveStats live={live} userXg={sim.userXg ?? 0} oppXg={sim.oppXg ?? 0} />
            </section>
            <section className="match-mini-map">
              <div><h3>선수 포지셔닝</h3><span>{minute}분까지</span></div>
              <ArenaEventMap
                events={events}
                track={sim.track}
                minute={minute}
                mode="positions"
              />
            </section>
            <section className="manager-advice">
              <div className="manager-advice__avatar">AI</div>
              <div>
                <span>수석 코치 실시간 분석</span>
                <strong>{advice.title}</strong>
                <p>{advice.description}</p>
                <button type="button" onClick={() => onApplyTactics(applyQuickTactic(tactics, advice.preset))}>
                  추천 전술 바로 적용
                </button>
              </div>
            </section>
          </div>
        </div>
      )}

      {activeTab === "ratings" && <PlayerRatings players={live?.players ?? []} />}
      {activeTab === "analysis" && (
        <MatchAnalysis
          events={events}
          players={live?.players ?? []}
          track={sim.track}
          minute={minute}
        />
      )}
      {activeTab === "squad" && squadControls && (
        <div className="arena-squad-board">
          <section className="arena-squad-board__pitch">
            <Pitch
              formation={slotsOf(formation)}
              slots={slots}
              playersById={playersById}
              conditions={liveConditions ?? squadControls.conditions}
              onSelectPlayer={squadControls.onSelectPlayer}
              positions={positions}
              positionMode
              pitchRef={squadControls.pitchRef}
              discipline={discipline}
            />
          </section>
          <aside className="arena-squad-board__controls">
            <header className="arena-squad-board__team">
              <span>
                <TeamFlag fifaCode={userCode} className="arena-squad-board__flag" />
                <small>{userCode}</small>
              </span>
              <div>
                <small>SQUAD MANAGEMENT</small>
                <h2>{userTeamName}</h2>
                <p>선수 배치와 교체는 다음 플레이부터 반영됩니다.</p>
              </div>
            </header>
            {dismissalNotice && (
              <div
                className="arena-dismissal-notice"
                data-side={dismissalSide ?? "user"}
                role="alert"
              >
                <span aria-hidden="true">{dismissalSide === "opp" ? "↗" : "!"}</span>
                {dismissalNotice}
              </div>
            )}
            <div className="arena-squad-board__status">
              <label>
                <span>현재 포메이션</span>
                {onFormationChange ? (
                  <select
                    className="match-formation-select"
                    value={formation}
                    onChange={(event) => onFormationChange(event.target.value as FormationKey)}
                    aria-label="경기 중 포메이션 변경"
                  >
                    {FORMATION_KEYS.map((key) => <option key={key} value={key}>{key}</option>)}
                  </select>
                ) : (
                  <strong>{formation}</strong>
                )}
              </label>
              <div>
                <span>교체 사용</span>
                <strong>{squadControls.subsUsed}/{squadControls.maxSubs}</strong>
              </div>
            </div>
            <section className="arena-squad-board__guide">
              <h3>선수 배치</h3>
              <ul>
                <li>피치 안에서 드래그해 선수 위치를 조정합니다.</li>
                <li>오른쪽 명단에서 피치로 끌어와 교체합니다.</li>
                <li>선수 카드를 누르면 상세 능력치를 확인할 수 있습니다.</li>
              </ul>
            </section>
            <button
              type="button"
              className="arena-squad-board__reset"
              onClick={squadControls.onResetPositions}
            >
              ↺ 기본 위치로 되돌리기
            </button>
            <button
              type="button"
              className="arena-squad-board__reset arena-squad-board__autofill"
              onClick={squadControls.onAutoFill}
            >
              ⚡ 현재 선수 자동 배치
            </button>
          </aside>
          <Bench
            benchPlayers={squadControls.benchPlayers}
            conditions={liveConditions ?? squadControls.conditions}
            benchedOut={squadControls.benchedOut}
            onSelectPlayer={squadControls.onSelectPlayer}
            discipline={discipline}
          />
        </div>
      )}

      {activeTab === "opponent" && squadControls && (
        squadControls.opponent && squadControls.opponentPlan ? (
          <div className="arena-opponent-board">
            <OpponentAnalysisPanel
              opponent={squadControls.opponent}
              players={opponentPlayers}
              bench={opponentBench}
              dismissedPlayers={dismissedOpponentPlayers}
              onSelectPlayer={squadControls.onSelectPlayer}
              conditions={squadControls.opponentConditions}
              plan={squadControls.opponentPlan}
              currentFormation={opponentFormation}
              currentTactics={opponentTactics}
              discipline={opponentDiscipline}
            />
          </div>
        ) : (
          <div className="opponent-report opponent-report--empty">
            상대 팀 분석 데이터를 불러올 수 없습니다.
          </div>
        )
      )}

      {activeTab === "tactics" && (
        <ArenaTacticsPanel
          userTeamName={userTeamName}
          userCode={userCode}
          formation={formation}
          formationLabel={formationLabel}
          tactics={tactics}
          slots={slots}
          playersById={playersById}
          slotRoles={slotRoles}
          onRoleChange={onRoleChange}
          onApply={onApplyTactics}
          setPieces={setPieces}
          onSetPieceChange={onSetPieceChange}
          savedTactics={savedTactics}
          onSaveTactic={onSaveTactic}
          onDeleteTactic={onDeleteTactic}
        />
      )}
    </section>
  );
}

function PlayerRatings({ players }: { players: PlayerMatchStats[] }) {
  const sides = ["user", "opp"] as const;
  return (
    <div className="player-ratings-board">
      {sides.map((side) => (
        <section key={side}>
          <h3>{side === "user" ? "우리 팀" : "상대 팀"}</h3>
          {players.filter((player) => player.side === side).map((player) => (
            <div className="live-player-rating" key={`${side}-${player.name}`}>
              <span><strong>{player.name}</strong><small>{player.position} · 체력 {Math.round(player.condition)}%</small></span>
              <i><b style={{ width: `${player.condition}%` }} /></i>
              <em data-level={player.rating >= 7 ? "good" : player.rating < 6 ? "bad" : "normal"}>{player.rating.toFixed(1)}</em>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

/** The events that mark a change of possession, whichever side won the ball. */
function isBallWon(type: MatchEvent["type"]) {
  return type === "tackle" || type === "interception" || type === "recovery";
}

export function MatchAnalysis({
  events,
  players,
  track,
  minute,
}: {
  events: NonNullable<ArenaSim["events"]>;
  players: PlayerMatchStats[];
  track?: ArenaSim["track"];
  minute: number;
}) {
  const [mode, setMode] = useState<EventMapMode>("positions");
  const [side, setSide] = useState<"user" | "opp">("user");
  const [player, setPlayer] = useState("");
  // A cumulative map cannot show a change made mid-match: everything before it
  // swamps the handful of minutes played since. Narrowing the window is what
  // makes a tactical switch visible on the pitch.
  const [windowMinutes, setWindowMinutes] = useState(0);
  const since = windowMinutes > 0 ? Math.max(0, minute - windowMinutes) : 0;
  const [passTypes, setPassTypes] = useState<PassType[]>(ALL_PASS_TYPES);
  const sidePlayers = useMemo(() => players.filter((entry) => entry.side === side), [players, side]);
  // The position track is keyed by player id; the filter is chosen by name.
  const playerId = sidePlayers.find((entry) => entry.name === player)?.playerId;
  const elapsed = events.filter((event) => event.minute <= minute && event.minute >= since);
  const visibleSidePasses = elapsed.filter((event) =>
    event.side === side
    && event.type === "pass"
    && (!player || event.actor === player));
  const passTypeCounts = Object.fromEntries(
    ALL_PASS_TYPES.map((type) => [
      type,
      visibleSidePasses.filter((event) => (event.passType ?? "normal") === type).length,
    ]),
  ) as Record<PassType, number>;
  const window = { fromMinute: since, toMinute: minute };
  const counts: Record<EventMapMode, number> = {
    positions: track
      ? playerDwell(track, { ...window, side, playerId, includeKeeper: true, inPlayOnly: true }).length
      : 0,
    // Seconds the side actually had the ball, which is what the map now draws.
    ball: track
      ? Math.round(
          ballDwell(track, { ...window, side, playerId })
            .reduce((total, point) => total + point.seconds, 0),
        )
      : 0,
    shots: elapsed.filter((event) => event.side === side && event.type === "shot").length,
    passes: elapsed.filter((event) => event.side === side && event.type === "pass").length,
    turnovers: elapsed.filter((event) => event.side !== side && isBallWon(event.type)).length,
    recoveries: elapsed.filter((event) => event.side === side && isBallWon(event.type)).length,
  };
  return (
    <div className="match-analysis-board">
      <aside>
        <h3>분석 필터</h3>
        <div className="analysis-side-switch" role="group" aria-label="분석 팀 선택">
          <button type="button" data-active={side === "user" || undefined} onClick={() => { setSide("user"); setPlayer(""); }}>우리 팀</button>
          <button type="button" data-active={side === "opp" || undefined} onClick={() => { setSide("opp"); setPlayer(""); }}>상대 팀</button>
        </div>
        <label>
          <span>구간</span>
          <select
            value={windowMinutes}
            onChange={(event) => setWindowMinutes(Number(event.target.value))}
          >
            <option value={0}>경기 전체</option>
            <option value={5}>최근 5분</option>
            <option value={10}>최근 10분</option>
            <option value={15}>최근 15분</option>
          </select>
        </label>
        <label>
          <span>선수</span>
          <select value={player} onChange={(event) => setPlayer(event.target.value)}>
            <option value="">전체 선수</option>
            {sidePlayers.map((entry) => <option key={entry.name} value={entry.name}>{entry.name}</option>)}
          </select>
        </label>
        {([
          ["positions", "포지셔닝 히트맵"],
          ["ball", "볼 히트맵"],
          ["shots", "슈팅 맵"],
          ["passes", "패스 맵"],
          ["turnovers", "뺏긴 위치"],
          ["recoveries", "뺏은 위치"],
        ] as const).map(([key, label]) => (
          <button type="button" key={key} data-active={mode === key || undefined} onClick={() => setMode(key)}>
            <span>{label}</span><strong>{counts[key]}</strong>
          </button>
        ))}
      </aside>
      <section>
        <header><h3>{mode === "positions" ? "선수 포지셔닝 히트맵" : mode === "ball" ? "볼 히트맵" : mode === "shots" ? "슈팅 위치와 방향" : mode === "passes" ? "패스 진행 방향" : mode === "recoveries" ? "공을 빼앗은 위치" : "공을 빼앗긴 위치"}</h3><span>{side === "user" ? "우리 팀" : "상대 팀"} · {windowMinutes > 0 ? `${since}~${minute}분` : `${minute}분까지`}</span></header>
        {mode === "passes" && (
          <div className="pass-map-legend" aria-label="패스 유형 필터">
            {ALL_PASS_TYPES.map((type) => {
              const meta = PASS_TYPE_META[type];
              const active = passTypes.includes(type);
              return (
                <button
                  type="button"
                  key={type}
                  data-active={active || undefined}
                  style={{ "--pass-color": meta.color } as CSSProperties}
                  onClick={() => setPassTypes((current) =>
                    current.includes(type)
                      ? current.filter((entry) => entry !== type)
                      : [...current, type])}
                  aria-pressed={active}
                >
                  <i />
                  <span>{meta.label}</span>
                  <strong>{passTypeCounts[type]}</strong>
                </button>
              );
            })}
          </div>
        )}
        <ArenaEventMap
          events={events}
          track={track}
          since={since}
          minute={minute}
          mode={mode}
          player={player || undefined}
          playerId={playerId}
          passTypes={passTypes}
          side={side}
        />
      </section>
    </div>
  );
}

function buildAdvice(live: LiveMatchSnapshot | null, minute: number, userGoals: number, oppGoals: number): {
  title: string;
  description: string;
  preset: QuickTacticKey;
} {
  const user = live?.teamStats.user;
  const opp = live?.teamStats.opp;
  if (minute >= 60 && userGoals < oppGoals) return {
    title: "득점이 필요한 시간입니다",
    description: "공격 숫자를 늘리고 템포를 높여 상대 수비가 정돈되기 전에 슈팅까지 연결하세요.",
    preset: "chaseGoal",
  };
  if ((opp?.shots ?? 0) >= (user?.shots ?? 0) + 3) return {
    title: "상대에게 슈팅을 너무 많이 허용하고 있습니다",
    description: "수비 라인을 내리고 중앙 공간을 압축해 상대의 좋은 슈팅 위치를 제거하세요.",
    preset: "protectLead",
  };
  if ((user?.possession ?? 50) < 43) return {
    title: "중원에서 소유권을 잃고 있습니다",
    description: "짧은 패스와 낮은 템포로 패스 선택지를 확보하면 경기 주도권을 되찾을 수 있습니다.",
    preset: "control",
  };
  if ((user?.interceptions ?? 0) + (user?.tacklesWon ?? 0) < Math.max(2, minute / 12)) return {
    title: "전방 압박이 충분하지 않습니다",
    description: "수비 라인과 압박 강도를 높여 상대 빌드업 단계에서 공을 탈취해보세요.",
    preset: "highPress",
  };
  return {
    title: "현재 경기 흐름은 안정적입니다",
    description: "균형을 유지하되 다음 5분간 슈팅과 점유율 변화를 확인한 뒤 다시 판단하세요.",
    preset: "control",
  };
}
