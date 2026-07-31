# Frontend module boundaries

This document records the ownership boundaries introduced to keep parallel feature work from converging on the same files.

## Stable entry points

- `data/matchSim.ts` is a public barrel. Consumers should import simulation APIs from it; engine work belongs under `data/match/`.
- `components/MatchBoard.tsx` coordinates match setup state. New panels and interactions belong under `components/match-board/`.
- `components/MatchArena.tsx` composes the live match screen. Runtime, canvas, and panel work belongs under `components/match-arena/`.
- `App.css` only defines stylesheet order. Add rules to the matching file under `styles/`.

## Match simulation (`data/match/`)

- `types.ts`: public simulation contracts
- `random.ts`: seeded random number generation
- `playerRuntime.ts`: per-player runtime state and weighted player selection
- `stats.ts`: match and player statistic mutation
- `penalties.ts`: shootout resolution
- `quickSim.ts`: lightweight score-only simulation
- `eventEngine.ts`: possession and event generation for each half
- `result.ts`: half aggregation and extra-time result construction
- `invariants.ts`: team/player/event statistic consistency checks
- `world/createWorld.ts`: authoritative player and ball state creation
- `world/movementEngine.ts`: ability, fatigue, and tactics-aware movement
- `world/perception.ts`: current-position distance, pressure, and pass-option evaluation
- `world/eventBridge.ts`: world state to event coordinates, heat samples, and public snapshots

Changes to probability/event rules should normally touch `eventEngine.ts`; changes to output contracts belong in `types.ts`.

The simulation owner exposes `MatchWorldSnapshot` through `data/matchSim.ts`.
The live-match owner may render and interpolate that snapshot, but must not
recalculate pass, duel, shot, or movement outcomes in UI code.

`quickSimScore` remains backward compatible with ELO-only callers. Tournament
code should pass `QuickSimOptions` with both teams' ability, condition, tactics,
and elevation whenever those values are available.

## Match setup (`components/match-board/`)

- `types.ts`: screen props, lineup, phase, and substitution limits
- `simInput.ts`: UI state to simulation input conversion
- `arenaSegments.ts`: half/result conversion for the live arena
- `useLineupDrag.ts`: drag, free positioning, bench, and substitution behavior
- `MatchBoardScreen.tsx`: setup-screen composition
- `MatchArenaOverlays.tsx`: phase-based live-match overlays

Keep tournament state and simulation rules out of presentation components.

## Live match (`components/match-arena/`)

- `types.ts`: external arena contract
- `runtimeTypes.ts`: internal canvas/runtime state
- `runtimeMath.ts`: coordinate and interpolation helpers
- `tactics.ts`: tactical controls and intensity calculation
- `names.ts`: display-name helpers
- `arenaEventProjector.ts`: simulation events to pitch positions
- `arenaRenderer.ts`: canvas drawing only
- `useArenaLoop.ts`: clock, movement, and playback lifecycle
- `ArenaTacticsPanel.tsx`: in-match tactical controls
- `ArenaEventFeed.tsx`: recent-event presentation
- `ArenaResultPanel.tsx`: completed-match presentation

Canvas appearance belongs in `arenaRenderer.ts`; movement behavior belongs in `useArenaLoop.ts`; tactical effects belong in `tactics.ts` or the simulation engine.

## Styles (`styles/`)

`App.css` imports these files in cascade order:

1. shared shell and reusable primitives
2. feature styles (`country-hub`, `match-board`, `match-arena`, and results)
3. `light-theme.css` for theme overrides
4. `dashboard-layouts.css` for the latest page-level layouts

Do not add feature rules directly to `App.css`, and avoid moving imports without checking the visual cascade.

## Suggested parallel ownership

- Simulation owner: `data/match/`
- Squad and setup owner: `components/match-board/` plus `styles/match-board.css`
- Live match owner: `components/match-arena/` plus `styles/match-arena.css`
- Tournament/dashboard owner: tournament modules, hub components, and their matching style files
- Design-system owner: `styles/app-shell.css`, shared player/pitch primitives, and theme files

When a change crosses boundaries, keep the coordinating edit small and put the implementation in the owning module.
