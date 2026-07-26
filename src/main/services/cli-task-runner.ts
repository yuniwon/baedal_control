import type {
  AgentActionPlanReport,
  AgentMenuReport,
  AgentOptionsReport,
  AgentOverviewReport,
  AgentPlatformReport,
  AgentReportEnvelope,
  AgentReportFilterInput,
  AgentReviewQueueReport,
  PlatformCode,
  PlatformImportSummary,
  PlatformInspectionReport,
  SyncPreviewItem,
  SyncPreviewNeedsReview,
  SyncPreviewResult
} from '../../shared/contracts'
import { isPlatformCode } from '../../shared/platforms'

interface CliTaskRunnerDependencies {
  getSyncPreview: () => Promise<SyncPreviewResult> | SyncPreviewResult
  agentOperationsReportService?: {
    getNextActionPlan?: (
      filters: AgentReportFilterInput
    ) => Promise<AgentReportEnvelope<AgentActionPlanReport>>
    getOverviewReport: (
      filters: AgentReportFilterInput
    ) => Promise<AgentReportEnvelope<AgentOverviewReport>>
    getReviewQueueReport: (
      filters: AgentReportFilterInput
    ) => Promise<AgentReportEnvelope<AgentReviewQueueReport>>
    getMenuReport: (
      menuId: string,
      filters: AgentReportFilterInput
    ) => Promise<AgentReportEnvelope<AgentMenuReport>>
    getOptionsReport: (
      filters: AgentReportFilterInput
    ) => Promise<AgentReportEnvelope<AgentOptionsReport>>
    getPlatformReport: (
      platformCode: PlatformCode,
      filters: AgentReportFilterInput
    ) => Promise<AgentReportEnvelope<AgentPlatformReport>>
  }
  syncEngine?: {
    run: (items: SyncPreviewItem[]) => Promise<{ syncRunId: string | null; summary: string }>
  }
  platformMenuImporter?: {
    importPlatform: (platformCode: PlatformCode) => Promise<{ summary: PlatformImportSummary }>
  }
  platformSessionOrchestrator?: {
    connect: (platformCode: PlatformCode) => Promise<{ state: string }>
  }
  platformFlowInspector?: {
    inspectCreateMenuFlow: (
      platformCode: PlatformCode
    ) => Promise<PlatformInspectionReport> | PlatformInspectionReport
  }
  hasCredential?: (platformCode: PlatformCode) => boolean
  requiresApplicationCredential?: (platformCode: PlatformCode) => boolean
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
  reason: SyncPreviewNeedsReview['reason'] | null
  limit: number | null
}

const isNeedsReviewReason = (
  value: string | null
): value is SyncPreviewNeedsReview['reason'] =>
  value === 'missing_mapping' ||
  value === 'binding_review' ||
  value === 'price_variant_review' ||
  value === 'source_missing_review' ||
  value === 'managed_session_write_review'

const parseLimit = (value?: string | null) => {
  if (!value) {
    return null
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

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
  const rawReason = values.get('reason') ?? null

  return {
    task: values.get('task') ?? null,
    platformCode: isPlatformCode(rawPlatformCode) ? rawPlatformCode : null,
    menuId: values.get('menuId')?.trim() || null,
    platformMenuId: values.get('platformMenuId')?.trim() || null,
    reason: isNeedsReviewReason(rawReason) ? rawReason : null,
    limit: parseLimit(values.get('limit') ?? null)
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
    const reportFilters: AgentReportFilterInput = {
      platformCode: parsed.platformCode,
      menuId: parsed.menuId,
      platformMenuId: parsed.platformMenuId,
      reason: parsed.reason,
      limit: parsed.limit
    }

    if (!parsed.task) {
      return null
    }

    if (parsed.task === 'agent-plan-next-actions') {
      if (
        !this.dependencies.agentOperationsReportService ||
        !this.dependencies.agentOperationsReportService.getNextActionPlan
      ) {
        return {
          exitCode: 1,
          payload: { task: parsed.task, error: 'agent_report_service_unavailable' }
        }
      }

      return {
        exitCode: 0,
        payload: await this.dependencies.agentOperationsReportService.getNextActionPlan(
          reportFilters
        )
      }
    }

    if (parsed.task === 'agent-report-overview') {
      if (!this.dependencies.agentOperationsReportService) {
        return {
          exitCode: 1,
          payload: { task: parsed.task, error: 'agent_report_service_unavailable' }
        }
      }

      return {
        exitCode: 0,
        payload: await this.dependencies.agentOperationsReportService.getOverviewReport(reportFilters)
      }
    }

    if (parsed.task === 'agent-report-review-queue') {
      if (!this.dependencies.agentOperationsReportService) {
        return {
          exitCode: 1,
          payload: { task: parsed.task, error: 'agent_report_service_unavailable' }
        }
      }

      return {
        exitCode: 0,
        payload: await this.dependencies.agentOperationsReportService.getReviewQueueReport(
          reportFilters
        )
      }
    }

    if (parsed.task === 'agent-report-menu') {
      if (!this.dependencies.agentOperationsReportService) {
        return {
          exitCode: 1,
          payload: { task: parsed.task, error: 'agent_report_service_unavailable' }
        }
      }

      if (!parsed.menuId) {
        return {
          exitCode: 1,
          payload: { task: parsed.task, error: 'menu_id_required' }
        }
      }

      return {
        exitCode: 0,
        payload: await this.dependencies.agentOperationsReportService.getMenuReport(
          parsed.menuId,
          reportFilters
        )
      }
    }

    if (parsed.task === 'agent-report-options') {
      if (!this.dependencies.agentOperationsReportService) {
        return {
          exitCode: 1,
          payload: { task: parsed.task, error: 'agent_report_service_unavailable' }
        }
      }

      return {
        exitCode: 0,
        payload: await this.dependencies.agentOperationsReportService.getOptionsReport(reportFilters)
      }
    }

    if (parsed.task === 'agent-report-platform') {
      if (!this.dependencies.agentOperationsReportService) {
        return {
          exitCode: 1,
          payload: { task: parsed.task, error: 'agent_report_service_unavailable' }
        }
      }

      if (!parsed.platformCode) {
        return {
          exitCode: 1,
          payload: { task: parsed.task, error: 'platform_code_required' }
        }
      }

      return {
        exitCode: 0,
        payload: await this.dependencies.agentOperationsReportService.getPlatformReport(
          parsed.platformCode,
          reportFilters
        )
      }
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

      const requiresCredential =
        this.dependencies.requiresApplicationCredential?.(parsed.platformCode) ??
        Boolean(this.dependencies.hasCredential)
      if (
        requiresCredential &&
        this.dependencies.hasCredential &&
        !this.dependencies.hasCredential(parsed.platformCode)
      ) {
        return {
          exitCode: 1,
          payload: { task: parsed.task, error: 'credential_not_found' }
        }
      }

      try {
        const sessionState = await this.dependencies.platformSessionOrchestrator?.connect(
          parsed.platformCode
        )
        if (sessionState && sessionState.state !== 'ready') {
          return {
            exitCode: 1,
            payload: {
              task: parsed.task,
              platformCode: parsed.platformCode,
              error: `platform_session_not_ready:${sessionState.state}`
            }
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
      } catch (error) {
        return {
          exitCode: 1,
          payload: {
            task: parsed.task,
            platformCode: parsed.platformCode,
            error: error instanceof Error ? error.message : 'unknown_error'
          }
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
