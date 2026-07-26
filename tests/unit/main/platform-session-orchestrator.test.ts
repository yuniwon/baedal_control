import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createInMemoryConnection } from '../../../src/main/db/connection'
import { migrate } from '../../../src/main/db/migrations'
import type { PlatformPlugin } from '../../../src/main/platforms/base/plugin'
import { PlatformSessionStateRepository } from '../../../src/main/repositories/platform-session-state-repository'
import { AuthAttemptGuard } from '../../../src/main/services/auth-attempt-guard'
import { PlatformSessionOrchestrator } from '../../../src/main/services/platform-session-orchestrator'
import { PLATFORM_CAPABILITIES } from '../../../src/shared/platform-capabilities'
import { PLATFORM_METADATA } from '../../../src/shared/platforms'

describe('PlatformSessionOrchestrator', () => {
  let states: PlatformSessionStateRepository
  let auth: {
    probe: ReturnType<typeof vi.fn>
    submitCredential: ReturnType<typeof vi.fn>
    authenticateWithPasswordManager: ReturnType<typeof vi.fn>
    openUserChallenge: ReturnType<typeof vi.fn>
  }
  let credentialVault: {
    get: ReturnType<typeof vi.fn>
    getRevision: ReturnType<typeof vi.fn>
  }
  let plugin: PlatformPlugin
  let orchestrator: PlatformSessionOrchestrator

  beforeEach(() => {
    const db = createInMemoryConnection()
    migrate(db)
    states = new PlatformSessionStateRepository(db)
    auth = {
      probe: vi.fn(),
      submitCredential: vi.fn(),
      authenticateWithPasswordManager: vi.fn(),
      openUserChallenge: vi.fn().mockResolvedValue(undefined)
    }
    credentialVault = {
      get: vi.fn().mockReturnValue({ username: 'owner', password: 'secret' }),
      getRevision: vi.fn().mockReturnValue('revision-a')
    }
    plugin = {
      metadata: { code: 'baemin', ...PLATFORM_METADATA.baemin },
      capabilities: PLATFORM_CAPABILITIES.baemin,
      auth,
      reader: { fetchCatalog: async () => ({ menus: [] }) }
    }
    orchestrator = new PlatformSessionOrchestrator({
      plugins: { get: () => plugin },
      states,
      credentialVault,
      attemptGuard: new AuthAttemptGuard(states, () => '2026-07-25T02:00:00.000Z'),
      now: () => '2026-07-25T02:00:00.000Z'
    })
  })

  it('returns ready from a reused session without reading credentials', async () => {
    auth.probe.mockResolvedValue({ state: 'ready' })

    await expect(orchestrator.connect('baemin')).resolves.toMatchObject({ state: 'ready' })
    expect(credentialVault.get).not.toHaveBeenCalled()
    expect(credentialVault.getRevision).not.toHaveBeenCalled()
    expect(auth.submitCredential).not.toHaveBeenCalled()
  })

  it('stops at a user challenge after one credential submission', async () => {
    auth.probe.mockResolvedValue({ state: 'expired' })
    auth.submitCredential.mockResolvedValue({
      state: 'challenge_required',
      detailCode: 'otp_required'
    })

    await expect(orchestrator.connect('baemin')).resolves.toMatchObject({
      state: 'challenge_required',
      detailCode: 'otp_required'
    })
    expect(auth.submitCredential).toHaveBeenCalledTimes(1)
  })

  it('polls a credential-submitted managed browser until the session becomes ready', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined)
    orchestrator = new PlatformSessionOrchestrator({
      plugins: { get: () => plugin },
      states,
      credentialVault,
      attemptGuard: new AuthAttemptGuard(states, () => '2026-07-25T02:00:00.000Z'),
      now: () => '2026-07-25T02:00:00.000Z',
      sleep,
      credentialSubmissionPollAttempts: 3
    })
    auth.probe
      .mockResolvedValueOnce({ state: 'expired' })
      .mockResolvedValueOnce({ state: 'expired' })
      .mockResolvedValueOnce({ state: 'ready' })
    auth.submitCredential.mockResolvedValue({
      state: 'challenge_required',
      detailCode: 'credential_submitted_check_required'
    })

    await expect(orchestrator.connect('baemin')).resolves.toMatchObject({ state: 'ready' })
    expect(sleep).toHaveBeenCalledTimes(2)
    expect(auth.submitCredential).toHaveBeenCalledTimes(1)
  })

  it('does not replay credentials after the user completes a challenge', async () => {
    auth.probe
      .mockResolvedValueOnce({ state: 'expired' })
      .mockResolvedValueOnce({ state: 'ready' })
    auth.submitCredential.mockResolvedValue({
      state: 'challenge_required',
      detailCode: 'otp_required'
    })

    await orchestrator.connect('baemin')
    await expect(orchestrator.resumeAfterUserAction('baemin')).resolves.toMatchObject({ state: 'ready' })
    expect(auth.submitCredential).toHaveBeenCalledTimes(1)
  })

  it('checks a session without submitting credentials', async () => {
    auth.probe.mockResolvedValue({ state: 'expired', detailCode: 'login_page_visible' })

    await expect(orchestrator.check('baemin')).resolves.toMatchObject({
      state: 'expired',
      detailCode: 'login_page_visible'
    })
    expect(credentialVault.get).not.toHaveBeenCalled()
    expect(auth.submitCredential).not.toHaveBeenCalled()
  })

  it('reopens an existing challenge without resubmitting credentials', async () => {
    auth.probe.mockResolvedValue({ state: 'expired' })
    states.save({
      workspaceId: 'default',
      platformCode: 'baemin',
      state: 'challenge_required',
      detailCode: 'otp_required'
    })

    await expect(orchestrator.connect('baemin')).resolves.toMatchObject({
      state: 'challenge_required',
      detailCode: 'otp_required'
    })
    expect(auth.openUserChallenge).toHaveBeenCalledTimes(1)
    expect(auth.submitCredential).not.toHaveBeenCalled()
  })

  it('lists unknown defaults alongside stored platform states', () => {
    states.save({
      workspaceId: 'default',
      platformCode: 'baemin',
      state: 'ready',
      detailCode: null
    })

    expect(orchestrator.list()).toEqual([
      expect.objectContaining({ platformCode: 'baemin', state: 'ready' }),
      expect.objectContaining({ platformCode: 'yogiyo', state: 'unknown' }),
      expect.objectContaining({ platformCode: 'coupangeats', state: 'unknown' }),
      expect.objectContaining({ platformCode: 'ddangyo', state: 'unknown' }),
      expect.objectContaining({ platformCode: 'deliveryspecial', state: 'unknown' }),
      expect.objectContaining({ platformCode: 'naverorder', state: 'unknown' })
    ])
  })

  it('returns the recorded rejection instead of resubmitting the same revision', async () => {
    const guard = new AuthAttemptGuard(states, () => '2026-07-25T02:00:00.000Z')
    guard.markRejected('default', 'baemin', 'revision-a')
    auth.probe.mockResolvedValue({ state: 'expired' })

    await expect(orchestrator.connect('baemin')).resolves.toMatchObject({
      state: 'credential_rejected',
      credentialRevision: 'revision-a'
    })
    expect(auth.submitCredential).not.toHaveBeenCalled()
  })

  it('opens manual authentication for a session-only platform', async () => {
    plugin = {
      ...plugin,
      metadata: { code: 'coupangeats', ...PLATFORM_METADATA.coupangeats },
      capabilities: PLATFORM_CAPABILITIES.coupangeats
    }
    auth.probe.mockResolvedValue({ state: 'expired' })
    auth.authenticateWithPasswordManager.mockResolvedValue({
      state: 'ready',
      detailCode: 'password_manager_login_verified'
    })

    await expect(orchestrator.connect('coupangeats')).resolves.toMatchObject({
      state: 'ready',
      detailCode: null
    })
    expect(auth.authenticateWithPasswordManager).toHaveBeenCalledTimes(1)
    expect(auth.openUserChallenge).not.toHaveBeenCalled()
    expect(auth.submitCredential).not.toHaveBeenCalled()
    expect(credentialVault.get).not.toHaveBeenCalled()
    expect(credentialVault.getRevision).not.toHaveBeenCalled()
  })

  it('latches a password-manager challenge without calling it again', async () => {
    plugin = {
      ...plugin,
      metadata: { code: 'coupangeats', ...PLATFORM_METADATA.coupangeats },
      capabilities: PLATFORM_CAPABILITIES.coupangeats
    }
    auth.probe.mockResolvedValue({ state: 'expired' })
    auth.authenticateWithPasswordManager.mockResolvedValue({
      state: 'challenge_required',
      detailCode: 'captcha_required'
    })

    await orchestrator.connect('coupangeats')
    await expect(orchestrator.connect('coupangeats')).resolves.toMatchObject({
      state: 'challenge_required',
      detailCode: 'captcha_required'
    })
    expect(auth.authenticateWithPasswordManager).toHaveBeenCalledTimes(1)
    expect(auth.openUserChallenge).toHaveBeenCalledTimes(1)
  })

  it('keeps missing consent retryable without falling through to manual authentication', async () => {
    plugin = {
      ...plugin,
      metadata: { code: 'coupangeats', ...PLATFORM_METADATA.coupangeats },
      capabilities: PLATFORM_CAPABILITIES.coupangeats
    }
    auth.probe.mockResolvedValue({ state: 'expired' })
    auth.authenticateWithPasswordManager
      .mockResolvedValueOnce({
        state: 'expired',
        detailCode: 'password_manager_auto_click_consent_required'
      })
      .mockResolvedValueOnce({ state: 'ready' })

    await expect(orchestrator.connect('coupangeats')).resolves.toMatchObject({
      state: 'expired',
      detailCode: 'password_manager_auto_click_consent_required'
    })
    await expect(orchestrator.connect('coupangeats')).resolves.toMatchObject({ state: 'ready' })
    expect(auth.authenticateWithPasswordManager).toHaveBeenCalledTimes(2)
    expect(auth.openUserChallenge).not.toHaveBeenCalled()
  })
})
