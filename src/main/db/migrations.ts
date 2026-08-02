import type { DatabaseConnection } from './connection'

export const migrate = (db: DatabaseConnection) => {
  const tableExists = (tableName: string) =>
    Boolean(
      db.prepare(`
        select name
        from sqlite_master
        where type = 'table' and name = ?
      `).get(tableName)
    )
  const hadCatalogWorkspaceTable = tableExists('catalog_workspaces')
  const legacyMenuCount =
    !hadCatalogWorkspaceTable && tableExists('menus')
      ? (db.prepare('select count(*) as count from menus').get() as { count: number }).count
      : 0

  db.exec(`
    create table if not exists menus (
      menu_id text primary key,
      base_name text not null,
      base_price integer not null,
      base_price_variants_json text,
      is_dirty integer not null default 0,
      is_managed integer not null default 1,
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp
    );

    create table if not exists platform_menu_mappings (
      mapping_id text primary key,
      menu_id text not null,
      platform_code text not null,
      platform_menu_id text not null,
      platform_menu_name text not null,
      platform_menu_current_price integer,
      platform_menu_price_count integer,
      platform_menu_price_variants_json text,
      matched_by text not null,
      is_confirmed integer not null default 0,
      last_verified_at text,
      foreign key(menu_id) references menus(menu_id)
    );

    create table if not exists platform_menus (
      platform_code text not null,
      platform_menu_id text not null,
      platform_menu_name text not null,
      platform_menu_current_price integer,
      platform_menu_price_count integer,
      platform_menu_group_name text,
      platform_menu_status text,
      platform_menu_price_summary text,
      platform_menu_price_variants_json text,
      platform_menu_binding_summary text,
      platform_menu_binding_status text,
      last_seen_at text not null default current_timestamp,
      primary key (platform_code, platform_menu_id)
    );

    create table if not exists platform_option_groups (
      platform_code text not null,
      option_group_id text not null,
      option_group_name text not null,
      min_order_quantity integer,
      max_order_quantity integer,
      mapping_menus_count integer,
      options_json text not null,
      menus_json text not null,
      last_seen_at text not null default current_timestamp,
      primary key (platform_code, option_group_id)
    );

    create table if not exists platform_import_runs (
      import_run_id text primary key,
      platform_code text not null,
      started_at text not null default current_timestamp,
      finished_at text,
      status text not null,
      menu_fetch_completed integer not null default 0,
      option_fetch_completed integer not null default 0,
      summary_json text,
      error_message text
    );

    create table if not exists platform_import_changes (
      change_id text primary key,
      import_run_id text not null,
      platform_code text not null,
      entity_type text not null,
      entity_key text not null,
      entity_name text not null,
      change_type text not null,
      presence_status text,
      before_json text,
      after_json text,
      created_at text not null default current_timestamp
    );

    create table if not exists browser_inspection_snapshots (
      snapshot_id text primary key,
      platform_code text not null,
      source text not null,
      page_url text not null,
      page_title text not null,
      page_kind text,
      capture_mode text,
      host text not null,
      captured_at text not null,
      text_snippet text,
      menu_names_json text not null,
      menu_items_json text not null default '[]',
      option_group_names_json text not null,
      button_labels_json text not null,
      input_hints_json text not null,
      fields_json text not null,
      api_events_json text not null,
      screenshot_data_url text,
      visible_password_input_count integer not null default 0,
      login_marker_detected integer not null default 0,
      logout_marker_detected integer not null default 0,
      management_marker_detected integer not null default 0,
      created_at text not null default current_timestamp
    );

    create table if not exists sync_runs (
      sync_run_id text primary key,
      started_at text not null,
      finished_at text,
      trigger_type text not null,
      result_summary text
    );

    create table if not exists catalog_workspaces (
      workspace_id text primary key,
      display_name text not null,
      lifecycle_state text not null,
      seed_mode text,
      seed_platform_code text,
      canonical_version integer not null default 0,
      activated_at text,
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp
    );

    create table if not exists catalog_review_items (
      review_item_id text primary key,
      workspace_id text not null,
      fingerprint text not null,
      kind text not null,
      state text not null,
      confidence real not null,
      title text not null,
      explanation text not null,
      recommendation text,
      evidence_json text not null,
      canonical_menu_id text,
      platform_code text,
      source_entity_id text,
      intent_rule_id text,
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp,
      unique(workspace_id, fingerprint)
    );

    create table if not exists catalog_intent_rules (
      intent_rule_id text primary key,
      workspace_id text not null,
      kind text not null,
      scope text not null,
      resolution text not null,
      platform_code text,
      canonical_menu_id text,
      source_entity_id text,
      field_key text,
      category_key text,
      reason text not null,
      expires_at text,
      is_active integer not null default 1,
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp
    );

    create table if not exists catalog_publication_targets (
      menu_id text not null,
      platform_code text not null,
      intent text not null,
      updated_at text not null default current_timestamp,
      primary key (menu_id, platform_code),
      foreign key(menu_id) references menus(menu_id)
    );

    create table if not exists platform_session_states (
      workspace_id text not null,
      platform_code text not null,
      state text not null,
      detail_code text,
      credential_revision text,
      last_attempt_at text,
      last_ready_at text,
      updated_at text not null default current_timestamp,
      primary key (workspace_id, platform_code)
    );

    create table if not exists platform_auth_preferences (
      workspace_id text not null,
      platform_code text not null,
      auto_click_login_button_consented integer not null default 0,
      consent_updated_at text,
      updated_at text not null default current_timestamp,
      primary key (workspace_id, platform_code)
    );

    create table if not exists platform_login_click_attempts (
      attempt_id text primary key,
      workspace_id text not null,
      platform_code text not null,
      document_key_hash text not null,
      state text not null,
      attempted_at text not null,
      resolved_at text
    );

    create index if not exists idx_catalog_review_items_workspace_state
      on catalog_review_items (workspace_id, state);

    create index if not exists idx_catalog_intent_rules_workspace_active
      on catalog_intent_rules (workspace_id, is_active);

    create index if not exists idx_platform_session_states_workspace
      on platform_session_states (workspace_id, platform_code);

    create index if not exists idx_platform_auth_preferences_workspace
      on platform_auth_preferences (workspace_id, platform_code);

    create unique index if not exists idx_platform_login_click_attempts_unresolved
      on platform_login_click_attempts (workspace_id, platform_code)
      where state in ('claimed', 'submitted', 'handed_off');
  `)

  const intentRuleColumns = new Set(
    (
      db.prepare(`
        select name
        from pragma_table_info('catalog_intent_rules')
      `).all() as Array<{ name: string }>
    ).map((column) => column.name)
  )

  if (!intentRuleColumns.has('category_key')) {
    db.exec('alter table catalog_intent_rules add column category_key text')
  }

  if (!hadCatalogWorkspaceTable) {
    const isLegacyCatalog = legacyMenuCount > 0
    db.prepare(`
      insert into catalog_workspaces (
        workspace_id,
        display_name,
        lifecycle_state,
        seed_mode,
        seed_platform_code,
        canonical_version,
        activated_at
      ) values ('default', '기본 매장', ?, ?, null, ?, ?)
    `).run(
      isLegacyCatalog ? 'active' : 'collecting',
      isLegacyCatalog ? 'legacy' : null,
      isLegacyCatalog ? 1 : 0,
      isLegacyCatalog ? new Date().toISOString() : null
    )
  }

  const mappingColumns = new Set(
    (
      db.prepare(`
        select name
        from pragma_table_info('platform_menu_mappings')
      `).all() as Array<{ name: string }>
    ).map((column) => column.name)
  )

  const missingMappingColumns = [
    ['platform_menu_current_price', 'integer'],
    ['platform_menu_price_count', 'integer'],
    ['platform_menu_group_name', 'text'],
    ['platform_menu_status', 'text'],
    ['platform_menu_price_summary', 'text'],
    ['platform_menu_price_variants_json', 'text'],
    ['platform_menu_binding_summary', 'text'],
    ['platform_menu_binding_status', 'text'],
    ['mapping_status', "text not null default 'active'"]
  ].filter(([name]) => !mappingColumns.has(name))

  for (const [name, type] of missingMappingColumns) {
    db.exec(`alter table platform_menu_mappings add column ${name} ${type}`)
  }

  const menuColumns = new Set(
    (
      db.prepare(`
        select name
        from pragma_table_info('menus')
      `).all() as Array<{ name: string }>
    ).map((column) => column.name)
  )

  if (!menuColumns.has('is_managed')) {
    db.exec('alter table menus add column is_managed integer not null default 1')
  }

  if (!menuColumns.has('base_price_variants_json')) {
    db.exec('alter table menus add column base_price_variants_json text')
  }

  const platformMenuColumns = new Set(
    (
      db.prepare(`
        select name
        from pragma_table_info('platform_menus')
      `).all() as Array<{ name: string }>
    ).map((column) => column.name)
  )

  const missingPlatformMenuColumns = [
    ['platform_menu_current_price', 'integer'],
    ['platform_menu_price_count', 'integer'],
    ['platform_menu_price_variants_json', 'text'],
    ['last_seen_import_id', 'text'],
    ['missing_streak', 'integer not null default 0'],
    ['presence_status', "text not null default 'present'"],
    ['presence_changed_at', 'text']
  ].filter(([name]) => !platformMenuColumns.has(name))

  for (const [name, type] of missingPlatformMenuColumns) {
    db.exec(`alter table platform_menus add column ${name} ${type}`)
  }

  const platformOptionGroupColumns = new Set(
    (
      db.prepare(`
        select name
        from pragma_table_info('platform_option_groups')
      `).all() as Array<{ name: string }>
    ).map((column) => column.name)
  )

  const missingPlatformOptionGroupColumns = [
    ['signature_key', 'text'],
    ['last_seen_import_id', 'text'],
    ['missing_streak', 'integer not null default 0'],
    ['presence_status', "text not null default 'present'"],
    ['presence_changed_at', 'text']
  ].filter(([name]) => !platformOptionGroupColumns.has(name))

  for (const [name, type] of missingPlatformOptionGroupColumns) {
    db.exec(`alter table platform_option_groups add column ${name} ${type}`)
  }

  const platformImportRunColumns = new Set(
    (
      db.prepare(`
        select name
        from pragma_table_info('platform_import_runs')
      `).all() as Array<{ name: string }>
    ).map((column) => column.name)
  )

  const missingPlatformImportRunColumns = [
    ['error_message', 'text']
  ].filter(([name]) => !platformImportRunColumns.has(name))

  for (const [name, type] of missingPlatformImportRunColumns) {
    db.exec(`alter table platform_import_runs add column ${name} ${type}`)
  }

  const browserInspectionSnapshotColumns = new Set(
    (
      db.prepare(`
        select name
        from pragma_table_info('browser_inspection_snapshots')
      `).all() as Array<{ name: string }>
    ).map((column) => column.name)
  )

  const missingBrowserInspectionSnapshotColumns = [
    ['page_kind', 'text'],
    ['capture_mode', 'text'],
    ["menu_items_json", "text not null default '[]'"],
    ['visible_password_input_count', 'integer not null default 0'],
    ['login_marker_detected', 'integer not null default 0'],
    ['logout_marker_detected', 'integer not null default 0'],
    ['management_marker_detected', 'integer not null default 0']
  ].filter(([name]) => !browserInspectionSnapshotColumns.has(name))

  for (const [name, type] of missingBrowserInspectionSnapshotColumns) {
    db.exec(`alter table browser_inspection_snapshots add column ${name} ${type}`)
  }
}
