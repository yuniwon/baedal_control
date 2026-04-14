import type { DatabaseConnection } from './connection'

export const migrate = (db: DatabaseConnection) => {
  db.exec(`
    create table if not exists menus (
      menu_id text primary key,
      base_name text not null,
      base_price integer not null,
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
      created_at text not null default current_timestamp
    );

    create table if not exists sync_runs (
      sync_run_id text primary key,
      started_at text not null,
      finished_at text,
      trigger_type text not null,
      result_summary text
    );
  `)

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
    ["menu_items_json", "text not null default '[]'"]
  ].filter(([name]) => !browserInspectionSnapshotColumns.has(name))

  for (const [name, type] of missingBrowserInspectionSnapshotColumns) {
    db.exec(`alter table browser_inspection_snapshots add column ${name} ${type}`)
  }
}
