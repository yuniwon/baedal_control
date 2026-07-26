import type {
  PlatformAuthProbe,
  PlatformCode,
  PlatformSessionStateRecord
} from '../../shared/contracts'
import type { PlatformAuthStrategy } from '../../shared/platform-capabilities'
import { PLATFORM_CODES } from '../../shared/platforms'
import type { PlatformPlugin } from '../platforms/base/plugin'
import type { AuthAttemptGuard } from './auth-attempt-guard'
import { validatePlatformSessionStrategyOrder } from './platform-session-strategy'

interface PlatformSessionOrchestratorDependencies {
  plugins: {
    get(platformCode: PlatformCode): PlatformPlugin
  }
  states: {
    get(workspaceId: string, platformCode: PlatformCode): PlatformSessionStateRecord | null
    list(workspaceId: string): PlatformSessionStateRecord[]
    save(record: PlatformSessionStateRecord): void
  }
  credentialVault: {
    get(platformCode: PlatformCode): { username: string; password: string } | null
    getRevision(platformCode: PlatformCode): string | null
  }
  attemptGuard: Pick<AuthAttemptGuard, 'assertAttemptAllowed' | 'markRejected' | 'markReady'>
  passwordManagerLoginCoordinator?: {
    markSessionReady(platformCode: PlatformCode): void
  }
  workspaceId?: string
  now?: () => string
  sleep?: (ms: number) => Promise<void>
  credentialSubmissionPollAttempts?: number
  credentialSubmissionPollIntervalMs?: number
}

const terminalStates = new Set<PlatformAuthProbe['state']>([
  'challenge_required',
  'credential_rejected',
  'locked_out_risk',
  'unsupported'
])

const credentialStrategies = new Set<PlatformAuthStrategy>([
  'embedded_credential_login',
  'managed_credential_login'
])

export class PlatformSessionOrchestrator {
  private readonly workspaceId: string
  private readonly now: () => string
  private readonly sleep: (ms: number) => Promise<void>
  private readonly credentialSubmissionPollAttempts: number
  private readonly credentialSubmissionPollIntervalMs: number

  constructor(private readonly deps: PlatformSessionOrchestratorDependencies) {
    this.workspaceId = deps.workspaceId ?? 'default'
    this.now = deps.now ?? (() => new Date().toISOString())
    this.sleep =
      deps.sleep ??
      ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
    this.credentialSubmissionPollAttempts = deps.credentialSubmissionPollAttempts ?? 20
    this.credentialSubmissionPollIntervalMs =
      deps.credentialSubmissionPollIntervalMs ?? 500
  }

  async connect(platformCode: PlatformCode): Promise<PlatformSessionStateRecord> {
    const plugin = this.deps.plugins.get(platformCode)
    const strategies = validatePlatformSessionStrategyOrder(
      plugin.capabilities.authentication.strategies
    )
    const previous = this.deps.states.get(this.workspaceId, platformCode)
    if (previous?.state !== 'credential_rejected' && previous?.state !== 'locked_out_risk') {
      this.persist(platformCode, { state: 'checking', detailCode: null })
    }

    const initialProbe = await this.safeProbe(plugin)
    if (initialProbe.state === 'ready') {
      return this.persistReady(platformCode, previous?.credentialRevision ?? null)
    }
    if (terminalStates.has(initialProbe.state)) {
      return this.persist(platformCode, initialProbe)
    }

    if (previous?.state === 'challenge_required') {
      if (!plugin.auth.openUserChallenge) {
        return this.persist(platformCode, {
          state: 'unsupported',
          detailCode: 'manual_authentication_unavailable'
        })
      }
      await plugin.auth.openUserChallenge()
      return this.persist(
        platformCode,
        { state: 'challenge_required', detailCode: previous.detailCode ?? 'manual_authentication_required' },
        previous.credentialRevision ?? null
      )
    }

    let credentialSubmitted = false
    for (const strategy of strategies) {
      if (strategy === 'official_api' || strategy.startsWith('reuse_')) {
        continue
      }

      if (credentialStrategies.has(strategy)) {
        if (credentialSubmitted || !plugin.auth.submitCredential) {
          continue
        }
        const credential = this.deps.credentialVault.get(platformCode)
        const credentialRevision = this.deps.credentialVault.getRevision(platformCode)
        if (!credential || !credentialRevision) {
          return this.persist(platformCode, {
            state: 'credential_required',
            detailCode: 'credential_not_found'
          })
        }

        try {
          this.deps.attemptGuard.assertAttemptAllowed(
            this.workspaceId,
            platformCode,
            credentialRevision
          )
        } catch (error) {
          if (error instanceof Error && error.message === `credential_retry_blocked:${platformCode}`) {
            return this.deps.states.get(this.workspaceId, platformCode) ?? this.persist(
              platformCode,
              { state: 'locked_out_risk', detailCode: 'credential_retry_blocked' },
              credentialRevision,
              true
            )
          }
          throw error
        }

        credentialSubmitted = true
        const result = await plugin.auth.submitCredential(credential)
        if (result.state === 'ready') {
          return this.persistReady(platformCode, credentialRevision)
        }
        if (result.state === 'credential_rejected') {
          this.deps.attemptGuard.markRejected(
            this.workspaceId,
            platformCode,
            credentialRevision
          )
          return this.requireState(platformCode)
        }
        if (
          result.state === 'challenge_required' &&
          result.detailCode === 'credential_submitted_check_required'
        ) {
          const recovered = await this.pollSubmittedCredential(
            plugin,
            platformCode,
            credentialRevision
          )
          if (recovered) return recovered
        }
        if (terminalStates.has(result.state)) {
          return this.persist(platformCode, result, credentialRevision, true)
        }
        continue
      }

      if (strategy === 'managed_password_manager_login') {
        if (!plugin.auth.authenticateWithPasswordManager) {
          return this.persist(platformCode, {
            state: 'unsupported',
            detailCode: 'password_manager_login_unsupported'
          })
        }
        const result = await plugin.auth.authenticateWithPasswordManager()
        if (result.state === 'ready') {
          return this.persistReady(platformCode, previous?.credentialRevision ?? null)
        }
        return this.persist(platformCode, result, previous?.credentialRevision ?? null)
      }

      if (strategy === 'manual_authentication') {
        if (!plugin.auth.openUserChallenge) {
          return this.persist(platformCode, {
            state: 'unsupported',
            detailCode: 'manual_authentication_unavailable'
          })
        }
        await plugin.auth.openUserChallenge()
        return this.persist(platformCode, {
          state: 'challenge_required',
          detailCode: 'manual_authentication_required'
        })
      }
    }

    return this.persist(platformCode, {
      state: 'credential_required',
      detailCode: 'no_available_strategy'
    })
  }

  async resumeAfterUserAction(platformCode: PlatformCode): Promise<PlatformSessionStateRecord> {
    return this.check(platformCode)
  }

  list(): PlatformSessionStateRecord[] {
    const stored = new Map(
      this.deps.states
        .list(this.workspaceId)
        .map((record) => [record.platformCode, record] as const)
    )

    return PLATFORM_CODES.map(
      (platformCode) =>
        stored.get(platformCode) ?? {
          workspaceId: this.workspaceId,
          platformCode,
          state: 'unknown' as const,
          detailCode: null,
          credentialRevision: null,
          lastAttemptAt: null,
          lastReadyAt: null
        }
    )
  }

  async check(platformCode: PlatformCode): Promise<PlatformSessionStateRecord> {
    const plugin = this.deps.plugins.get(platformCode)
    const previous = this.deps.states.get(this.workspaceId, platformCode)
    this.persist(platformCode, { state: 'checking', detailCode: null })
    const probe = await this.safeProbe(plugin)
    if (probe.state === 'ready') {
      return this.persistReady(platformCode, previous?.credentialRevision ?? null)
    }
    return this.persist(platformCode, probe, previous?.credentialRevision ?? null)
  }

  private async safeProbe(plugin: PlatformPlugin): Promise<PlatformAuthProbe> {
    try {
      return await plugin.auth.probe()
    } catch {
      return { state: 'error', detailCode: 'session_probe_failed' }
    }
  }

  private async pollSubmittedCredential(
    plugin: PlatformPlugin,
    platformCode: PlatformCode,
    credentialRevision: string
  ) {
    for (let attempt = 0; attempt < this.credentialSubmissionPollAttempts; attempt += 1) {
      await this.sleep(this.credentialSubmissionPollIntervalMs)
      const probe = await this.safeProbe(plugin)
      if (probe.state === 'ready') {
        return this.persistReady(platformCode, credentialRevision)
      }
      if (probe.state === 'credential_rejected') {
        this.deps.attemptGuard.markRejected(
          this.workspaceId,
          platformCode,
          credentialRevision
        )
        return this.requireState(platformCode)
      }
      if (probe.state === 'locked_out_risk' || probe.state === 'unsupported') {
        return this.persist(platformCode, probe, credentialRevision, true)
      }
    }

    return null
  }

  private persistReady(platformCode: PlatformCode, credentialRevision: string | null) {
    this.deps.passwordManagerLoginCoordinator?.markSessionReady(platformCode)
    this.deps.attemptGuard.markReady(this.workspaceId, platformCode, credentialRevision)
    return this.requireState(platformCode)
  }

  private persist(
    platformCode: PlatformCode,
    probe: PlatformAuthProbe,
    credentialRevision?: string | null,
    attempted = false
  ): PlatformSessionStateRecord {
    const current = this.deps.states.get(this.workspaceId, platformCode)
    this.deps.states.save({
      workspaceId: this.workspaceId,
      platformCode,
      state: probe.state,
      detailCode: probe.detailCode ?? null,
      credentialRevision: credentialRevision ?? current?.credentialRevision ?? null,
      lastAttemptAt: attempted ? this.now() : current?.lastAttemptAt ?? null,
      lastReadyAt: current?.lastReadyAt ?? null
    })
    return this.requireState(platformCode)
  }

  private requireState(platformCode: PlatformCode) {
    const state = this.deps.states.get(this.workspaceId, platformCode)
    if (!state) {
      throw new Error(`platform_session_state_missing:${platformCode}`)
    }
    return state
  }
}
