import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { createConnection } from '../../../src/main/db/connection'

describe('createConnection', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    while (tempDirs.length > 0) {
      const directory = tempDirs.pop()
      if (directory) {
        rmSync(directory, { recursive: true, force: true })
      }
    }
  })

  it('configures file databases for WAL journal mode and a busy timeout', () => {
    const directory = mkdtempSync(join(tmpdir(), 'delivery-menu-sync-'))
    tempDirs.push(directory)
    const dbPath = join(directory, 'test.db')
    const db = createConnection(dbPath)

    const journalMode = db.prepare('pragma journal_mode').get() as { journal_mode: string }
    const busyTimeout = db.prepare('pragma busy_timeout').get() as { timeout: number }

    expect(journalMode.journal_mode).toBe('wal')
    expect(busyTimeout.timeout).toBe(5000)

    db.close()
  })
})
