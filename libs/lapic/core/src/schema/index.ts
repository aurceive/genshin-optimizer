export const lapicCorePackageName = 'lapic-core'
export const lapicCoreSchemaVersion = '0.1.0-draft'
export const lapicCompatibilitySignatureSchemaVersion = '0.1.0-draft'

export type LapicSchemaVersion = typeof lapicCoreSchemaVersion
export type LapicCompatibilitySignatureSchemaVersion =
  typeof lapicCompatibilitySignatureSchemaVersion

export interface LapicCoreSkeletonMarker {
  readonly packageName: typeof lapicCorePackageName
  readonly schemaVersion: LapicSchemaVersion
}

export const lapicCoreSkeleton: LapicCoreSkeletonMarker = {
  packageName: lapicCorePackageName,
  schemaVersion: lapicCoreSchemaVersion,
}
