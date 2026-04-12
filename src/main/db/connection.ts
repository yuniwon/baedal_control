import { DatabaseSync } from 'node:sqlite'

export type DatabaseConnection = DatabaseSync

export const createConnection = (filename: string) => new DatabaseSync(filename)

export const createInMemoryConnection = () => new DatabaseSync(':memory:')
