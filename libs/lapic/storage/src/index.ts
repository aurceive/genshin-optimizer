export const lapicStoragePackageName = 'lapic-storage'

export interface LapicStorageSkeletonMarker {
  readonly packageName: typeof lapicStoragePackageName
}

export const lapicStorageSkeleton: LapicStorageSkeletonMarker = {
  packageName: lapicStoragePackageName,
}
