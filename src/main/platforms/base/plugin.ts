import type {
  CanonicalMenuProjectionInput,
  PlatformAuthProbe,
  PlatformProjectionResult,
  PlatformWriteVerification,
  SyncPreviewItem
} from '../../../shared/contracts'
import type { PlatformCapabilityManifest } from '../../../shared/platform-capabilities'
import type { PlatformCode, PlatformMetadata } from '../../../shared/platforms'
import type { PlatformMenuFetchResult } from './types'

export interface PlatformCredential {
  username: string
  password: string
}

export interface PlatformAuthDriver {
  probe(): Promise<PlatformAuthProbe>
  submitCredential?(credential: PlatformCredential): Promise<PlatformAuthProbe>
  authenticateWithPasswordManager?(): Promise<PlatformAuthProbe>
  openUserChallenge?(): Promise<void>
}

export interface PlatformCatalogReader {
  fetchCatalog(): Promise<PlatformMenuFetchResult>
}

export interface PlatformCatalogProjector {
  plan(item: CanonicalMenuProjectionInput): Promise<PlatformProjectionResult>
}

export interface PlatformCatalogWriter {
  apply(item: SyncPreviewItem): Promise<void>
}

export interface PlatformWriteVerifier {
  verify(item: SyncPreviewItem): Promise<PlatformWriteVerification>
}

export interface PlatformPlugin {
  metadata: PlatformMetadata & { code: PlatformCode }
  capabilities: PlatformCapabilityManifest
  auth: PlatformAuthDriver
  reader?: PlatformCatalogReader
  projector?: PlatformCatalogProjector
  writer?: PlatformCatalogWriter
  verifier?: PlatformWriteVerifier
}
