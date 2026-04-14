import type {
  PlatformCode,
  PlatformImportSummary,
  PlatformInspectionReport,
  SyncPreviewItem,
  SyncPreviewNeedsReview,
  SyncPreviewResult
} from '../../shared/contracts'

interface CliTaskRunnerDependencies {
  getSyncPreview: () => Promise<SyncPreviewResult> | SyncPreviewResult
  syncEngine?: {
    run: (items: SyncPreviewItem[]) => Promise<{ syncRunId: string | null; summary: string }>
  }
  platformMenuImporter?: {
    importPlatform: (platformCode: PlatformCode) => Promise<{ summary: PlatformImportSummary }>
  }
  platformFlowInspector?: {
    inspectCreateMenuFlow: (
      platformCode: PlatformCode
    ) => Promise<PlatformInspectionReport> | PlatformInspectionReport
  }
  hasCredential?: (platformCode: PlatformCode) => boolean
}

interface CliTaskRunnerResult {
  exitCode: number
  payload: unknown
}

interface ParsedCliArgs {
  task: string | null
  platformCode: PlatformCode | null
  menuId: string | null
  platformMenuId: string | null
}

const isPlatformCode = (value: string | null): value is PlatformCode =>
  value === 'baemin' || value === 'coupangeats' || value === 'ddangyo'

const parseCliArgs = (argv: string[]): ParsedCliArgs => {
  const values = new Map<string, string>()

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) {
      continue
    }

    const equalIndex = arg.indexOf('=')
    if (equalIndex >= 0) {
      values.set(arg.slice(2, equalIndex), arg.slice(equalIndex + 1))
      continue
    }

    const nextArg = argv[index + 1]
    if (nextArg && !nextArg.startsWith('--')) {
      values.set(arg.slice(2), nextArg)
      index += 1
      continue
    }

    values.set(arg.slice(2), 'true')
  }

  const rawPlatformCode = values.get('platformCode') ?? null

  return {
    task: values.get('task') ?? null,
    platformCode: isPlatformCode(rawPlatformCode) ? rawPlatformCode : null,
    menuId: values.get('menuId')?.trim() || null,
    platformMenuId: values.get('platformMenuId')?.trim() || null
  }
}

const matchesExecutableItem = (
  item: SyncPreviewItem,
  filters: Pick<ParsedCliArgs, 'platformCode' | 'menuId' | 'platformMenuId'>
) => {
  if (filters.platformCode && item.platformCode !== filters.platformCode) {
    return false
  }

  if (filters.menuId && item.menuId !== filters.menuId) {
    return false
  }

  if (filters.platformMenuId && item.platformMenuId !== filters.platformMenuId) {
    return false
  }

  return true
}

const matchesNeedsReviewItem = (
  item: SyncPreviewNeedsReview,
  filters: Pick<ParsedCliArgs, 'platformCode' | 'menuId' | 'platformMenuId'>
) => {
  if (filters.platformCode && item.platformCode !== filters.platformCode) {
    return false
  }

  if (filters.menuId && item.menuId !== filters.menuId) {
    return false
  }

  if (filters.platformMenuId && item.platformMenuId !== filters.platformMenuId) {
    return false
  }

  return true
}

export class CliTaskRunner {
  constructor(private readonly dependencies: CliTaskRunnerDependencies) {}

  async run(argv: string[]): Promise<CliTaskRunnerResult | null> {
    const parsed = parseCliArgs(argv)

    if (!parsed.task) {
      return null
    }

    if (parsed.task === 'sync-preview') {
      const preview = await this.dependencies.getSyncPreview()
      return {
        exitCode: 0,
        payload: {
          task: parsed.task,
          items: preview.items.filter((item) => matchesExecutableItem(item, parsed)),
          needsReview: preview.needsReview.filter((item) => matchesNeedsReviewItem(item, parsed))
        }
      }
    }

    if (parsed.task === 'sync-run-item') {
      if (!this.dependencies.syncEngine) {
        return {
          exitCode: 1,
          payload: { task: parsed.task, error: 'sync_engine_unavailable' }
        }
      }

      const preview = await this.dependencies.getSyncPreview()
      const items = preview.items.filter((item) => matchesExecutableItem(item, parsed))
      const needsReview = preview.needsReview.filter((item) => matchesNeedsReviewItem(item, parsed))

      if (items.length === 0) {
        return {
          exitCode: 0,
          payload: {
            task: parsed.task,
            executedCount: 0,
            needsReview,
            summary: '실행 가능한 항목이 없습니다.'
          }
        }
      }

      const result = await this.dependencies.syncEngine.run(items)
      return {
        exitCode: 0,
        payload: {
          task: parsed.task,
          executedCount: items.length,
          needsReview,
          result
        }
      }
    }

    if (parsed.task === 'import-platform') {
      if (!parsed.platformCode) {
        return {
          exitCode: 1,
          payload: { task: parsed.task, error: 'platform_code_required' }
        }
      }

      if (!this.dependencies.platformMenuImporter) {
        return {
          exitCode: 1,
          payload: { task: parsed.task, error: 'platform_importer_unavailable' }
        }
      }

      if (this.dependencies.hasCredential && !this.dependencies.hasCredential(parsed.platformCode)) {
        return {
          exitCode: 1,
          payload: { task: parsed.task, error: 'credential_not_found' }
        }
      }

      const result = await this.dependencies.platformMenuImporter.importPlatform(parsed.platformCode)
      return {
        exitCode: 0,
        payload: {
          task: parsed.task,
          platformCode: parsed.platformCode,
          summary: result.summary
        }
      }
    }

    if (parsed.task === 'inspect-create-menu-flow') {
      if (!parsed.platformCode) {
        return {
          exitCode: 1,
          payload: { task: parsed.task, error: 'platform_code_required' }
        }
      }

      if (!this.dependencies.platformFlowInspector) {
        return {
          exitCode: 1,
          payload: { task: parsed.task, error: 'platform_flow_inspector_unavailable' }
        }
      }

      if (this.dependencies.hasCredential && !this.dependencies.hasCredential(parsed.platformCode)) {
        return {
          exitCode: 1,
          payload: { task: parsed.task, error: 'credential_not_found' }
        }
      }

      const inspection = await this.dependencies.platformFlowInspector.inspectCreateMenuFlow(
        parsed.platformCode
      )

      return {
        exitCode: 0,
        payload: {
          task: parsed.task,
          platformCode: parsed.platformCode,
          inspection
        }
      }
    }

    return {
      exitCode: 1,
      payload: {
        task: parsed.task,
        error: 'unsupported_task'
      }
    }
  }
}
