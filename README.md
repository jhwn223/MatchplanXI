# MatchplanXI

**내가 감독이라면? 고도와 체력이 승부를 바꾸는 전술 시뮬레이터**

**Live: https://matchplanxi.vercel.app/**

2026 월드컵 실제 데이터를 활용한 드래그 앤 드롭 전술보드입니다. 경기장 고도, 팀 휴식일, 최근 출전 시간, 국가대표 경험(caps)을 반영해 실시간으로 "고지대 컨디션 지수"를 계산하고, 실제 대진을 따라 조별리그부터 결승까지 플레이할 수 있습니다.

---

## 실행 방법

**요구 사항**: Node.js 20 이상 (개발 환경 v24.18.0), npm

```bash
git clone https://github.com/jhwn223/MatchplanXI.git
cd MatchplanXI
npm install
npm run dev            # 개발 서버 (http://localhost:5173)
```

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 실행 |
| `npm run build` | 타입 검사 후 프로덕션 빌드 (`tsc -b && vite build`) |
| `npm run preview` | 빌드 결과 로컬 확인 |
| `npm run lint` | oxlint 정적 분석 |
| `npm test` | 전체 테스트 (vitest, 23개 파일 / 122개 케이스) |
| `npm run test:match` | 경기 엔진 보정 테스트만 실행 |
| `npm run sync:player-photos` | Wikimedia Commons에서 선수 사진·출처 갱신 |
| `npm run sync:player-photos -- --team=KOR` | 특정 대표팀만 갱신 |

`main` 브랜치가 갱신되면 Vercel에서 프로덕션 빌드를 배포합니다.

---

## 사용 기술

| 분류 | 기술 |
|---|---|
| 프레임워크 | React 19, TypeScript 6 |
| 빌드 | Vite 8 |
| 드래그 앤 드롭 | @dnd-kit/core |
| 애니메이션 | Framer Motion |
| 데이터 파싱 | PapaParse (CSV) |
| 테스트 | Vitest |
| 정적 분석 | oxlint |

외부 게임 엔진이나 물리 라이브러리 없이, 경기 시뮬레이션·선수 움직임·2D 렌더링을 모두 직접 구현했습니다.

---

## 프로젝트 구조

```
src/
├─ data/                       도메인 로직 (UI 의존성 없음)
│  ├─ match/                   ★ 경기 시뮬레이션 엔진
│  │  ├─ eventEngine.ts          경기 진행 루프 — 점유·패스·슈팅·파울 판정
│  │  ├─ world/                  선수 위치 기반 공간 모델
│  │  │  ├─ movementEngine.ts      22명의 매 틱 이동
│  │  │  ├─ formationShape.ts      포메이션을 하나의 블록으로 이동
│  │  │  ├─ perception.ts          공간 인지 (압박 거리, 수적 우위, 오프사이드)
│  │  │  ├─ setPieceShape.ts       코너·프리킥·페널티 시 배치
│  │  │  └─ worldTrack.ts          분석용 위치 기록 (공 0.5초 / 선수 1초)
│  │  ├─ result.ts               전·후반 결과 합산, 연장·승부차기
│  │  ├─ quickSim.ts             다른 조 경기 일괄 시뮬레이션
│  │  └─ invariants.ts           결과 무결성 검증
│  ├─ conditionEngine.ts       고도·이동·휴식 기반 컨디션 지수
│  ├─ formation.ts             포메이션 정의 및 드래그 형태 자동 감지
│  ├─ playerRoles.ts           24개 선수 역할과 행동 수정치
│  ├─ tournamentEngine.ts      조별리그 → 토너먼트 진행
│  └─ loadData.ts              CSV 로딩 및 선수 능력치 결합
├─ components/
│  ├─ MatchBoard.tsx           경기 전 라인업·전술 화면
│  ├─ MatchArena.tsx           경기 중 화면 (2D 진행 + 실시간 지시)
│  ├─ match-arena/             경기 중 패널 (전술·스쿼드·분석·상대)
│  └─ match-board/             경기 전 패널 (상대 분석·드래그 처리)
├─ hooks/
└─ styles/

public/data/                   대회 원본 데이터 (CSV 6종)
scripts/                       사진 동기화 스크립트
```

**핵심 파일부터 보시려면**: [`eventEngine.ts`](src/data/match/eventEngine.ts)(경기 판정) → [`movementEngine.ts`](src/data/match/world/movementEngine.ts)(선수 이동) → [`MatchArena.tsx`](src/components/MatchArena.tsx)(화면)

---

## 핵심 기능

- **국가 선택 → 조별리그 → 토너먼트**: 48개 팀 중 하나를 골라 실제 2026 월드컵 대진을 그대로 플레이. 조별리그 3경기를 마치면 다른 11개 조도 자동 시뮬레이션되고, 32강 토너먼트 대진표가 열립니다.
- **팀 컨디션 지수**: 경기장 고도(0~2200m), 팀 간 이동 거리·시차, 직전 경기 이후 휴식일, 최근 출전 분, A매치 caps를 조합해 선수별 컨디션 점수를 계산.
- **역할 기반 자동 배치**: 실제 선수 데이터(득점, 신장, caps)로부터 ST/윙/DM/CB 등 세부 역할을 추정해 포지션에 맞는 최적 선발을 자동 구성.
- **11가지 포메이션** + 전술 프리셋, 포메이션을 바꿔도 선수는 유지됩니다. 선수를 직접 드래그하면 형태를 자동 인식합니다(4-3-3 → 4-2-4).
- **2D 애니메이션 경기 진행**: 22명이 역할별로 다르게 움직이는 2D 경기가 실시간으로 진행됩니다.
- **하프타임 & 교체**: 전반 종료 후 포메이션·전술을 다시 짜고 벤치 선수를 투입할 수 있습니다. 교체 카드 5장.
- **경기 분석**: 실제 위치 기록 기반 히트맵(볼 체류 시간, 선수 포지셔닝), 패스·슈팅·탈취 지도.
- **실제 결과와 비교**: 조별리그 경기는 실제 2026 대회 결과와 스코어·전술을 비교해줍니다.

---

## 경기 엔진에 대해

승패를 확률로 굴리지 않고, **선수 22명의 위치를 시간 단위로 계산해 그 위에서 판정**합니다. 패스 성공률은 공을 가진 선수의 실제 여유 공간과 패스 경로의 수비수를 읽고, 슈팅은 자기 진영에 남은 수비 인원을 읽습니다. 그래서 포메이션과 선수 역할이 결과에 실제로 반영됩니다.

실축 통계 범위 안에 있는지 테스트로 고정해 두었습니다.

| 지표 | 시뮬레이션 | 실제 축구 |
|---|---|---|
| 합산 슈팅 | 24 | 24~26 |
| 합산 득점 | 2.5 | 2.6~2.8 |
| 코너킥 | 10.5 | 9~11 |
| 파울 | 18 | 20~22 |
| 인터셉트 | 45 | 40~50 |
| 퇴장 | 0.09 (11경기당 1회) | 약 0.1 |

`src/data/match/matchEngine.test.ts`, `scoreDistribution.test.ts`, `possessionAndRoles.test.ts`에서 검증합니다.

> 참고: `scoreDistribution.test.ts`의 극단 전술 시나리오 2건이 현재 실패 상태입니다(엔진 보정 진행 중).

---

## 데이터 출처

| 데이터 | 출처 | 라이선스 |
|---|---|---|
| 대회 일정·팀·선수 명단 | [FIFA World Cup 2026 Dataset](https://github.com/mominullptr/FIFA-World-Cup-2026-Dataset) | **CC0** (퍼블릭 도메인) |
| 선수 사진 | Wikimedia Commons | **CC BY / CC BY-SA** (출처 표기 필요) |
| 선수 능력치 | `api.msmc.cc/api/fc26` (비공식 공개 API) | ⚠️ **라이선스 미확인** |

**선수 사진**은 Wikidata의 선수 식별자와 생년월일을 대조한 뒤, Commons에서 공개 라이선스가 확인된 파일만 사용합니다. 사진별 작가·라이선스·원본 링크는 [`public/player-photos/ATTRIBUTION.md`](public/player-photos/ATTRIBUTION.md)와 앱 내 선수 상세 화면에서 확인할 수 있습니다. 사진이 없거나 라이선스를 확인할 수 없는 선수는 이니셜 아바타로 표시합니다.

**선수 능력치**는 비공식 공개 API에서 EA Sports FC 26 수치를 가져와 시뮬레이션 입력값으로만 사용합니다. 해당 API는 이용 약관이나 라이선스를 명시하지 않으며, 원 데이터의 권리는 EA에 있습니다. 이 프로젝트는 비상업 개인 프로젝트로서 [EA 팬 콘텐츠 정책](https://help.ea.com/en/articles/security-and-rules/ea-content-policy/) 범위 안에서 사용합니다. 상업적 이용 시에는 공개 데이터(openfootball, Wikidata 등) 기반 자체 산출값으로 교체해야 합니다.

라이선스 매칭이 되지 않는 선수(전체의 약 33%)는 시장가치·A매치 출전·득점 기록으로 능력치를 추정해 채웁니다. EA가 라이선스하지 않은 리그(브라질 세리에 A, 카타르 스타스리그 등) 소속 선수가 여기 해당합니다.
