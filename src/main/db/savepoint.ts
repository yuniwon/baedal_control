import type { DatabaseConnection } from './connection'

let savepointCounter = 0

export const withSavepoint = <T>(db: DatabaseConnection, work: () => T): T => {
  const savepointName = `sp_${++savepointCounter}`

  db.exec(`savepoint ${savepointName}`)

  try {
    const result = work()
    db.exec(`release savepoint ${savepointName}`)
    return result
  } catch (error) {
    db.exec(`rollback to savepoint ${savepointName}`)
    db.exec(`release savepoint ${savepointName}`)
    throw error
  }
}
