import { useState } from "react";
import type { Position } from "../../data/types";

export interface PenaltyTakerCandidate {
  playerId: number;
  name: string;
  position: Position;
  overall: number;
  composure: number;
  penalties: number;
}

interface Props {
  userTeamName: string;
  candidates: PenaltyTakerCandidate[];
  onConfirm: (order: number[]) => void;
}

function tierLabel(overall: number): string {
  if (overall >= 85) return "월드클래스";
  if (overall >= 80) return "스타 선수";
  if (overall >= 75) return "중요한 선수";
  if (overall >= 70) return "정규 선발";
  return "팀 선수";
}

function defaultOrder(candidates: PenaltyTakerCandidate[]): number[] {
  return [...candidates]
    .sort((a, b) => b.penalties - a.penalties || b.composure - a.composure)
    .map((player) => player.playerId);
}

export function PenaltyTakerSelect({ userTeamName, candidates, onConfirm }: Props) {
  const [order, setOrder] = useState<number[]>(() => defaultOrder(candidates));
  const [addPick, setAddPick] = useState("");

  const byId = new Map(candidates.map((player) => [player.playerId, player]));
  const taken = new Set(order);
  const bench = candidates.filter((player) => !taken.has(player.playerId));

  function move(index: number, delta: number) {
    setOrder((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function remove(playerId: number) {
    setOrder((current) => current.filter((id) => id !== playerId));
  }

  function add(playerId: number) {
    setOrder((current) => (current.includes(playerId) ? current : [...current, playerId]));
    setAddPick("");
  }

  return (
    <section className="pk-taker-select">
      <header className="pk-taker-select__header">
        <nav className="pk-taker-select__crumbs">선수단 <span>›</span> 전술 계획표 <span>›</span> 승부차기</nav>
        <div className="pk-taker-select__title">
          <span aria-hidden="true">📋</span>
          <h3>승부차기 키커</h3>
        </div>
        {bench.length > 0 && (
          <select
            className="pk-taker-select__add"
            value={addPick}
            onChange={(event) => {
              const id = Number(event.target.value);
              if (id) add(id);
            }}
          >
            <option value="">선수 추가</option>
            {bench.map((player) => (
              <option key={player.playerId} value={player.playerId}>
                {player.name} ({player.position})
              </option>
            ))}
          </select>
        )}
      </header>

      <div className="pk-taker-select__table">
        <div className="pk-taker-select__row pk-taker-select__row--head">
          <span>순서</span>
          <span>선수</span>
          <span>침착성</span>
          <span>페널티킥</span>
          <span />
        </div>
        {order.length === 0 && <p className="pk-taker-select__empty">키커가 없습니다. 위에서 선수를 추가하세요.</p>}
        {order.map((playerId, index) => {
          const player = byId.get(playerId);
          if (!player) return null;
          return (
            <div className="pk-taker-select__row" key={playerId}>
              <span className="pk-taker-select__order">
                {index + 1}
                <span className="pk-taker-select__reorder">
                  <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="순서 위로">▲</button>
                  <button type="button" onClick={() => move(index, 1)} disabled={index === order.length - 1} aria-label="순서 아래로">▼</button>
                </span>
              </span>
              <span className="pk-taker-select__player">
                <strong>{player.name}</strong>
                <small>{tierLabel(player.overall)}</small>
              </span>
              <span className="pk-taker-select__stat" data-high={player.composure >= 15 || undefined}>{player.composure}</span>
              <span className="pk-taker-select__stat" data-high={player.penalties >= 15 || undefined}>{player.penalties}</span>
              <button type="button" className="pk-taker-select__remove" onClick={() => remove(playerId)} aria-label={`${player.name} 제외`}>―</button>
            </div>
          );
        })}
      </div>

      <footer className="pk-taker-select__footer">
        <p>{userTeamName}의 승부차기 순서를 정하세요. 페널티킥 능력이 높은 순으로 미리 정렬해두었습니다.</p>
        <button type="button" className="sim-btn sim-btn--accent" disabled={order.length === 0} onClick={() => onConfirm(order)}>
          승부차기 시작 →
        </button>
      </footer>
    </section>
  );
}
