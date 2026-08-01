import photoManifest from "../../assets/player-photos/manifest.json";

export interface PlayerPhotoRecord {
  playerId: number;
  playerName: string;
  teamCode: string;
  wikidataQid: string;
  commonsFile: string;
  fileName: string;
  sourcePageUrl: string;
  author: string;
  credit: string;
  license: string;
  licenseUrl: string;
  attributionRequired: boolean;
  changes: string;
}

const photosByPlayerId = new Map(
  (photoManifest as PlayerPhotoRecord[]).map((photo) => [photo.playerId, photo])
);

export function getPlayerPhoto(playerId: number): PlayerPhotoRecord | undefined {
  return photosByPlayerId.get(playerId);
}

export function getPlayerPhotoUrl(photo: PlayerPhotoRecord): string {
  return `${import.meta.env.BASE_URL}player-photos/${photo.fileName}`;
}
