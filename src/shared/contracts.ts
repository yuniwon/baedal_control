export const appApiKeys = ['menus', 'mappings', 'settings', 'syncRuns', 'sync'] as const

export type AppApiKey = (typeof appApiKeys)[number]
