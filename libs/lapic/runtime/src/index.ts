export const lapicRuntimePackageName = 'lapic-runtime'

export interface LapicRuntimeSkeletonMarker {
  readonly packageName: typeof lapicRuntimePackageName
}

export const lapicRuntimeSkeleton: LapicRuntimeSkeletonMarker = {
  packageName: lapicRuntimePackageName,
}
