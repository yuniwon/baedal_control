import type {
  BrowserInspectionApiEvent,
  BrowserInspectionField,
  BrowserInspectionMenuItem,
  BrowserInspectionSnapshot
} from '../../shared/contracts'
import type { DatabaseConnection } from '../db/connection'

const parseStringArray = (value: unknown): string[] => {
  if (typeof value !== 'string') {
    return []
  }

  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

const parseObjectArray = <T,>(value: unknown): T[] => {
  if (typeof value !== 'string') {
    return []
  }

  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

export class BrowserInspectionSnapshotRepository {
  constructor(private readonly db: DatabaseConnection) {}

  save(snapshot: BrowserInspectionSnapshot) {
    this.db
      .prepare(
        `
          insert into browser_inspection_snapshots (
            snapshot_id,
            platform_code,
            source,
            page_url,
            page_title,
            page_kind,
            capture_mode,
            host,
            captured_at,
            text_snippet,
            menu_names_json,
            menu_items_json,
            option_group_names_json,
            button_labels_json,
            input_hints_json,
            fields_json,
            api_events_json,
            screenshot_data_url,
            visible_password_input_count,
            login_marker_detected,
            logout_marker_detected,
            management_marker_detected
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          on conflict(snapshot_id) do update set
            platform_code = excluded.platform_code,
            source = excluded.source,
            page_url = excluded.page_url,
            page_title = excluded.page_title,
            page_kind = excluded.page_kind,
            capture_mode = excluded.capture_mode,
            host = excluded.host,
            captured_at = excluded.captured_at,
            text_snippet = excluded.text_snippet,
            menu_names_json = excluded.menu_names_json,
            menu_items_json = excluded.menu_items_json,
            option_group_names_json = excluded.option_group_names_json,
            button_labels_json = excluded.button_labels_json,
            input_hints_json = excluded.input_hints_json,
            fields_json = excluded.fields_json,
            api_events_json = excluded.api_events_json,
            screenshot_data_url = excluded.screenshot_data_url,
            visible_password_input_count = excluded.visible_password_input_count,
            login_marker_detected = excluded.login_marker_detected,
            logout_marker_detected = excluded.logout_marker_detected,
            management_marker_detected = excluded.management_marker_detected
        `
      )
      .run(
        snapshot.snapshotId,
        snapshot.platformCode,
        snapshot.source,
        snapshot.pageUrl,
        snapshot.pageTitle,
        snapshot.pageKind ?? 'unknown',
        snapshot.captureMode ?? 'viewport',
        snapshot.host,
        snapshot.capturedAt,
        snapshot.textSnippet ?? null,
        JSON.stringify(snapshot.menuNames ?? []),
        JSON.stringify(snapshot.menuItems ?? []),
        JSON.stringify(snapshot.optionGroupNames ?? []),
        JSON.stringify(snapshot.buttonLabels ?? []),
        JSON.stringify(snapshot.inputHints ?? []),
        JSON.stringify(snapshot.fields ?? []),
        JSON.stringify(snapshot.apiEvents ?? []),
        snapshot.screenshotDataUrl ?? null,
        snapshot.visiblePasswordInputCount ?? 0,
        snapshot.loginMarkerDetected ? 1 : 0,
        snapshot.logoutMarkerDetected ? 1 : 0,
        snapshot.managementMarkerDetected ? 1 : 0
      )
  }

  listLatest(limit = 20): BrowserInspectionSnapshot[] {
    const rows = this.db
      .prepare(
        `
          select
            snapshot_id as snapshotId,
            platform_code as platformCode,
            source,
            page_url as pageUrl,
            page_title as pageTitle,
            page_kind as pageKind,
            capture_mode as captureMode,
            host,
            captured_at as capturedAt,
            text_snippet as textSnippet,
            menu_names_json as menuNamesJson,
            menu_items_json as menuItemsJson,
            option_group_names_json as optionGroupNamesJson,
            button_labels_json as buttonLabelsJson,
            input_hints_json as inputHintsJson,
            fields_json as fieldsJson,
            api_events_json as apiEventsJson,
            screenshot_data_url as screenshotDataUrl,
            visible_password_input_count as visiblePasswordInputCount,
            login_marker_detected as loginMarkerDetected,
            logout_marker_detected as logoutMarkerDetected,
            management_marker_detected as managementMarkerDetected
          from browser_inspection_snapshots
          order by captured_at desc, rowid desc
          limit ?
        `
      )
      .all(limit) as Array<{
        snapshotId: string
        platformCode: BrowserInspectionSnapshot['platformCode']
        source: BrowserInspectionSnapshot['source']
        pageUrl: string
        pageTitle: string
        pageKind?: BrowserInspectionSnapshot['pageKind']
        captureMode?: BrowserInspectionSnapshot['captureMode']
        host: string
        capturedAt: string
        textSnippet?: string | null
        menuNamesJson: string
        menuItemsJson: string
        optionGroupNamesJson: string
        buttonLabelsJson: string
        inputHintsJson: string
        fieldsJson: string
        apiEventsJson: string
        screenshotDataUrl?: string | null
        visiblePasswordInputCount: number
        loginMarkerDetected: number
        logoutMarkerDetected: number
        managementMarkerDetected: number
      }>

    return rows.map((row) => ({
      snapshotId: row.snapshotId,
      platformCode: row.platformCode,
      source: row.source,
      pageUrl: row.pageUrl,
      pageTitle: row.pageTitle,
      pageKind: row.pageKind ?? 'unknown',
      captureMode: row.captureMode ?? 'viewport',
      host: row.host,
      capturedAt: row.capturedAt,
      textSnippet: row.textSnippet ?? null,
      menuNames: parseStringArray(row.menuNamesJson),
      menuItems: parseObjectArray<BrowserInspectionMenuItem>(row.menuItemsJson),
      optionGroupNames: parseStringArray(row.optionGroupNamesJson),
      buttonLabels: parseStringArray(row.buttonLabelsJson),
      inputHints: parseStringArray(row.inputHintsJson),
      fields: parseObjectArray<BrowserInspectionField>(row.fieldsJson),
      apiEvents: parseObjectArray<BrowserInspectionApiEvent>(row.apiEventsJson),
      screenshotDataUrl: row.screenshotDataUrl ?? null,
      visiblePasswordInputCount: row.visiblePasswordInputCount,
      loginMarkerDetected: Boolean(row.loginMarkerDetected),
      logoutMarkerDetected: Boolean(row.logoutMarkerDetected),
      managementMarkerDetected: Boolean(row.managementMarkerDetected)
    }))
  }
}
