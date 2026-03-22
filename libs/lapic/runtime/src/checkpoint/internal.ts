export function createCheckpointId(sessionId: string, ordinal: number): string {
  return `${sessionId}:checkpoint:${ordinal}`
}
