import { useState } from "react";
import type { Player } from "../../data/types";
import { getPlayerPhoto, getPlayerPhotoUrl } from "./playerPhotoData";

interface PlayerPhotoProps {
  player: Player;
  className: string;
}

interface PlayerAvatarProps {
  name: string;
  className: string;
}

export function PlayerAvatar({ name, className }: PlayerAvatarProps) {
  return (
    <span
      className={`${className} player-photo--fallback`}
      role="img"
      aria-label={`${name} 기본 아바타`}
    >
      <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <circle cx="32" cy="22" r="11" />
        <path d="M11 58c1.8-13 9.4-20 21-20s19.2 7 21 20H11Z" />
      </svg>
    </span>
  );
}

export function PlayerPhoto({ player, className }: PlayerPhotoProps) {
  const [failed, setFailed] = useState(false);
  const photo = getPlayerPhoto(player.player_id);

  if (!photo || failed) {
    return <PlayerAvatar name={player.player_name} className={className} />;
  }

  return (
    <img
      className={className}
      src={getPlayerPhotoUrl(photo)}
      alt={`${player.player_name} 선수 사진`}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
