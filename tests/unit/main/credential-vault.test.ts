import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { beforeEach, describe, expect, it } from 'vitest'
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
})
