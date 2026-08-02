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
      <span className="app-topbar__mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="17" height="17">
          <circle cx="12" cy="12" r="9.4" fill="#fff" />
          <polygon points="12,6.7 17.04,10.36 15.12,16.29 8.89,16.29 6.96,10.36" fill="#00652b" />
          <g stroke="#00652b" strokeWidth="1.3" strokeLinecap="round">
            <line x1="12" y1="6.7" x2="12" y2="2.6" />
            <line x1="17.04" y1="10.36" x2="20.94" y2="9.10" />
            <line x1="15.12" y1="16.29" x2="17.53" y2="19.60" />
            <line x1="8.89" y1="16.29" x2="6.47" y2="19.60" />
            <line x1="6.96" y1="10.36" x2="3.06" y2="9.10" />
          </g>
        </svg>
      </span>
      <span>Matchplan XI</span>
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
