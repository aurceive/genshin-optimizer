export const lapicDebugPackageName = 'lapic-debug'

export interface LapicDebugSkeletonMarker {
  readonly packageName: typeof lapicDebugPackageName
}

export const lapicDebugSkeleton: LapicDebugSkeletonMarker = {
  packageName: lapicDebugPackageName,
}
