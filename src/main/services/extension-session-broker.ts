import type {
  BrowserInspectionSnapshot,
  PlatformAuthProbe,
  PlatformCode
} from '../../shared/contracts'
import { inferPlatformCodeFromHost } from '../../shared/platforms'

const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000

interface ExtensionSessionBrokerOptions {
  now?: () => Date
  maxAgeMs?: number
}

export class ExtensionSessionBroker {
  private readonly now: () => Date
  private readonly maxAgeMs: number

  constructor(options: ExtensionSessionBrokerOptions = {}) {
    this.now = options.now ?? (() => new Date())
    this.maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS
  }

  probe(
    platformCode: PlatformCode,
    snapshot: BrowserInspectionSnapshot | null | undefined
  ): PlatformAuthProbe {
    if (!snapshot || snapshot.source !== 'browser_extension') {
      return { state: 'unknown', detailCode: 'extension_snapshot_missing' }
    }

    if (
      snapshot.platformCode !== platformCode ||
      inferPlatformCodeFromHost(snapshot.host) !== platformCode
    ) {
      return { state: 'unknown', detailCode: 'extension_host_mismatch' }
    }

    const capturedAtMs = Date.parse(snapshot.capturedAt)
    const ageMs = this.now().getTime() - capturedAtMs
    if (!Number.isFinite(capturedAtMs) || ageMs < 0 || ageMs > this.maxAgeMs) {
      return { state: 'unknown', detailCode: 'extension_snapshot_stale' }
    }

    if ((snapshot.visiblePasswordInputCount ?? 0) > 0 || snapshot.loginMarkerDetected) {
      return { state: 'expired', detailCode: 'extension_login_page' }
    }

    if (snapshot.logoutMarkerDetected || snapshot.managementMarkerDetected) {
      return { state: 'ready', detailCode: 'extension_session_ready' }
    }

    return { state: 'unknown', detailCode: 'extension_auth_evidence_missing' }
  }
}
