import { TeamFlag } from "./TeamFlag";

interface Props {
  active: "squad" | "tactics" | "schedule" | "standings";
  teamCode?: string;
  onBrandClick?: () => void;
}

const ITEMS = [
  ["squad", "SQUAD"],
  ["tactics", "TACTICS"],
  ["schedule", "SCHEDULE"],
  ["standings", "STANDINGS"],
] as const;

export function AppTopbar({ active, teamCode, onBrandClick }: Props) {
  const brand = (
    <>
      <span className="app-topbar__mark" aria-hidden="true">▲</span>
      <span>ALTITUDE TACTICS</span>
    </>
  );

  return (
    <header className="app-topbar">
      {onBrandClick ? (
        <button type="button" className="app-topbar__brand" onClick={onBrandClick}>
          {brand}
        </button>
      ) : (
        <div className="app-topbar__brand">{brand}</div>
      )}
      <nav className="app-topbar__nav" aria-label="현재 진행 단계">
        {ITEMS.map(([key, label]) => (
          <span key={key} data-active={key === active || undefined}>{label}</span>
        ))}
      </nav>
      <div className="app-topbar__context">
        <span className="app-topbar__season">WORLD CUP 2026</span>
        {teamCode && (
          <strong>
            <TeamFlag fifaCode={teamCode} className="app-topbar__flag" />
            <span>{teamCode}</span>
          </strong>
        )}
      </div>
    </header>
  );
}
