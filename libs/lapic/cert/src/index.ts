export const lapicCertPackageName = 'lapic-cert'

export interface LapicCertSkeletonMarker {
  readonly packageName: typeof lapicCertPackageName
}

export const lapicCertSkeleton: LapicCertSkeletonMarker = {
  packageName: lapicCertPackageName,
}
