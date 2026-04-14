import { DatabaseSync } from 'node:sqlite'

export type DatabaseConnection = DatabaseSync

const configureConnection = (connection: DatabaseConnection) => {
  connection.exec('pragma busy_timeout = 5000')
  connection.exec('pragma journal_mode = wal')
  return connection
}

export const createConnection = (filename: string) => configureConnection(new DatabaseSync(filename))

export const createInMemoryConnection = () => configureConnection(new DatabaseSync(':memory:'))
