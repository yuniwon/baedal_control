import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CredentialVault } from '../../../src/main/services/credential-vault'

const cipher = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(`enc:${value}`, 'utf8'),
  decryptString: (value: Buffer) => value.toString('utf8').replace(/^enc:/, '')
}

describe('CredentialVault', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'delivery-menu-sync-'))
  })

  it('stores and reads platform credentials by platform code', () => {
    const vault = new CredentialVault(join(tempDir, 'credentials.json'), cipher)

    vault.set('baemin', 'owner', 'pw')

    expect(vault.get('baemin')).toEqual({ username: 'owner', password: 'pw' })

    rmSync(tempDir, { recursive: true, force: true })
  })

  it('returns a stable non-secret revision that changes with credentials', () => {
    const vault = new CredentialVault(join(tempDir, 'credentials.json'), cipher)
    vault.set('baemin', 'owner', 'first-password')
    const firstRevision = vault.getRevision('baemin')

    vault.set('baemin', 'owner', 'second-password')
    const secondRevision = vault.getRevision('baemin')

    expect(firstRevision).toMatch(/^[a-f0-9]{64}$/)
    expect(secondRevision).toMatch(/^[a-f0-9]{64}$/)
    expect(secondRevision).not.toBe(firstRevision)
    expect(firstRevision).not.toContain('first-password')
    expect(new CredentialVault(join(tempDir, 'empty.json'), cipher).getRevision('baemin')).toBeNull()

    rmSync(tempDir, { recursive: true, force: true })
  })

  it('detects and clears a legacy encrypted entry without decrypting it', () => {
    const decryptString = vi.fn(cipher.decryptString)
    const vault = new CredentialVault(join(tempDir, 'credentials.json'), {
      ...cipher,
      decryptString
    })
    vault.set('coupangeats', 'legacy-owner', 'legacy-password')

    expect(vault.hasStoredEntry('coupangeats')).toBe(true)
    expect(decryptString).not.toHaveBeenCalled()

    vault.clear('coupangeats')
    expect(vault.hasStoredEntry('coupangeats')).toBe(false)
    expect(decryptString).not.toHaveBeenCalled()
    rmSync(tempDir, { recursive: true, force: true })
  })
})
