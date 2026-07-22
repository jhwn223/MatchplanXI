import { useState } from "react";
import type { Player } from "../../data/types";
import { getPlayerPhoto, getPlayerPhotoUrl, playerInitials } from "./playerPhotoData";

interface PlayerPhotoProps {
  player: Player;
  className: string;
}

export function PlayerPhoto({ player, className }: PlayerPhotoProps) {
  const [failed, setFailed] = useState(false);
  const photo = getPlayerPhoto(player.player_id);

  if (!photo || failed) {
    return (
      <span className={`${className} player-photo--fallback`} aria-hidden="true">
        {playerInitials(player.player_name)}
      </span>
    );
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
