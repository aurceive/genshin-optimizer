# gi-lapic-ui

React hook library for integrating the lapic solver into the Genshin Impact optimizer frontend.

## Scope

This package provides UI-layer hooks for solve orchestration, progress formatting, diagnostics display, and engine selection. It does not contain solver logic or core lapic contracts.

## Public Surface

### Hooks

- `useLapicSolve` — manages a lapic solve lifecycle with state tracking (`idle`, `running`, `completed`, `failed`, `paused`, `cancelled`) and controls (`start`, `pause`, `cancel`, `reset`).
- `useLapicSolveProgress` — formats raw `LapicProgressEvent` into display-ready metrics (`percentText`, `elapsedText`, `etaText`, fraction, ratio).
- `useLapicDiagnostics` — transforms trace events and failure records into structured diagnostic entries with severity levels.
- `useLapicEnginePreference` — reads the current engine selection from React context.
- `useLocalStorageEnginePreference` — persists engine preference to `localStorage` under the key `gi-optimizer-engine`, defaulting to `legacy`.

### Components

- `LapicEngineProvider` — React context provider for engine selection (`legacy` | `lapic`).

### Exported Types

- `LapicSolveState`, `LapicSolveControls`, `LapicSolveStatus`
- `LapicFormattedProgress`
- `LapicEngineKind`, `LapicEngineContextValue`, `LapicEngineProviderProps`
- `LapicDiagnosticDisplaySeverity`, `LapicDiagnosticEntry`, `LapicDiagnosticsState`
