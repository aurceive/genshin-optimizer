import type {
  LapicDiagnostic,
  LapicDiagnosticSeverity,
  LapicErrorCode,
  LapicFailure,
  LapicSuccess,
} from '../types'

export function createLapicDiagnostic(
  severity: LapicDiagnosticSeverity,
  code: LapicErrorCode | string,
  message: string,
  path?: readonly string[],
  details?: Readonly<Record<string, string | number | boolean | null>>
): LapicDiagnostic {
  return {
    severity,
    code,
    message,
    path,
    details,
  }
}

export function createLapicSuccessResult<T>(
  value: T,
  diagnostics: readonly LapicDiagnostic[] = []
): LapicSuccess<T> {
  return {
    ok: true,
    value,
    diagnostics,
  }
}

export function createLapicFailureResult(
  diagnostics: readonly LapicDiagnostic[]
): LapicFailure {
  return {
    ok: false,
    diagnostics,
  }
}
