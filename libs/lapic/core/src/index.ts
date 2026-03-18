export const lapicCorePackageName = 'lapic-core'

export interface LapicCoreSkeletonMarker {
  readonly packageName: typeof lapicCorePackageName
}

export const lapicCoreSkeleton: LapicCoreSkeletonMarker = {
  packageName: lapicCorePackageName,
}
