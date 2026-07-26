import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { PlatformCode } from '../../shared/contracts'

type CredentialMap = Partial<Record<PlatformCode, string>>

interface SafeStorageLike {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
}

export class CredentialVault {
  constructor(
    private readonly filePath: string,
    private readonly cipher: SafeStorageLike
  ) {}

  get(platformCode: PlatformCode) {
    const encrypted = this.readAll()[platformCode]
    if (!encrypted) {
      return null
    }

    return JSON.parse(this.cipher.decryptString(Buffer.from(encrypted, 'base64'))) as {
      username: string
      password: string
    }
  }

  getRevision(platformCode: PlatformCode): string | null {
    const credential = this.get(platformCode)
    if (!credential) {
      return null
    }

    return createHash('sha256')
      .update(`${platformCode}\u0000${credential.username}\u0000${credential.password}`)
      .digest('hex')
  }

  set(platformCode: PlatformCode, username: string, password: string) {
    if (!this.cipher.isEncryptionAvailable()) {
      throw new Error('encryption_unavailable')
    }

    const payload = JSON.stringify({ username, password })
    const encrypted = this.cipher.encryptString(payload).toString('base64')
    const current = this.readAll()
    current[platformCode] = encrypted
    this.writeAll(current)
  }

  hasStoredEntry(platformCode: PlatformCode) {
    return Boolean(this.readAll()[platformCode])
  }

  clear(platformCode: PlatformCode) {
    const current = this.readAll()
    delete current[platformCode]
    this.writeAll(current)
  }

  private readAll(): CredentialMap {
    if (!existsSync(this.filePath)) {
      return {}
    }

    return JSON.parse(readFileSync(this.filePath, 'utf8')) as CredentialMap
  }

  private writeAll(credentials: CredentialMap) {
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(credentials, null, 2), 'utf8')
  }
}
