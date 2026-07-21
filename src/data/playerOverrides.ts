import type { Position } from "./types";

// The dataset only tags players GK/DEF/MID/FWD, and a few are miscategorised
// (Korea's wingers are tagged MID, Jens Castrop a midfielder is tagged DEF).
// Keyed by the original (English) player_name, applied at load time.
export const POSITION_OVERRIDES: Record<string, Position> = {
  "Hee Chan Hwang": "FWD", // 황희찬 — winger, was MID
  "Hyunjun Yang": "FWD", // 양현준 — winger, was MID
  "Jisung Eom": "FWD", // 엄지성 — winger, was MID
  "Jens Castrop": "MID", // 옌스 카스트로프 — DM, was DEF
};

// Fine-grained role so auto-placement is accurate (wingers wide, strikers central,
// tall defenders at CB, etc.). Overrides the goals/height heuristic.
export const ROLE_OVERRIDES: Record<string, string> = {
  // --- Korea (대한민국) ---
  "Heung Min Son": "W",
  "Hee Chan Hwang": "W",
  "Hyunjun Yang": "W",
  "Jisung Eom": "W",
  "Guesung Cho": "ST",
  "Hyeongyu Oh": "ST",
  "Kangin Lee": "AM",
  "Jae Sung Lee": "AM",
  "Donggyeong Lee": "AM",
  "Inbeom Hwang": "CM",
  "Seungho Paik": "CM",
  "Gihyuk Lee": "CM",
  "Jingyu Kim": "CM",
  "Junho Bae": "AM",
  "Jens Castrop": "DM",
  "Minjae Kim": "CB",
  "Hanbeom Lee": "CB",
  "Wije Cho": "CB",
  "Jinseob Park": "CB",
  "Youngwoo Seol": "FB",
  "Moonhwan Kim": "FB",
  "Taeseok Lee": "FB",
  "Taehyeon Kim": "FB",
  // --- global wingers (already FWD in data, force wide instead of ST) ---
  "Hamed Mahrous Mohamed Salah": "W",
  "José Vinicius": "W",
  "Lamine Yamal Yamal": "W",
  "Bukayo Ayoyinka Saka": "W",
  "Cody Mathès Gakpo": "W",
  "Jeremy Baffour Doku": "W",
  "Michael Akpovie Olise": "W",
  "Alexandre Rafael Leao": "W",
  "Michael Olise": "W",
  // --- global central strikers ---
  "Erling Braut Haaland": "ST",
  "Harry Edward Kane": "ST",
  "Kylian Mbappe": "ST",
};
