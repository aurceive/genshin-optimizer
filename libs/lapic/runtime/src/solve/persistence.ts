import type {
  LapicArtifactKind,
  LapicArtifactRef,
} from '@genshin-optimizer/lapic/storage'
import {
  createLapicArtifactWriteRequest,
  createLapicStorageEnvelope,
} from '@genshin-optimizer/lapic/storage'
import type { LapicBoundedExactSolveOptions } from './types'

export async function persistArtifact(
  options: LapicBoundedExactSolveOptions,
  artifactKind: LapicArtifactKind,
  contentHash: string,
  payloadDigest: string,
  payload: unknown,
  dependencies: readonly string[]
): Promise<LapicArtifactRef> {
  const serializedPayload = JSON.stringify(payload)
  const commit = await options.artifactStore.write(
    createLapicArtifactWriteRequest(
      createLapicStorageEnvelope({
        artifactKind,
        schemaVersion: '0.1.0-draft',
        payloadEncoding: 'json',
        payloadLength: serializedPayload.length,
        contentHash,
        checksum: {
          algorithm: 'sha256',
          checksum: contentHash,
        },
        compressionCodec: 'none',
        creationEngineVersion: options.problem.engineVersion,
        arithmeticPolicyId: options.problem.arithmeticPolicyId,
        dependencyDigestSet: dependencies,
      }),
      payloadDigest
    )
  )
  options.controller.publishArtifact(commit.artifactRef)
  return commit.artifactRef
}
