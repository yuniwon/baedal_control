import type { DatabaseConnection } from './connection'

export const migrate = (db: DatabaseConnection) => {
  db.exec(`
    create table if not exists menus (
      menu_id text primary key,
      base_name text not null,
      base_price integer not null,
      is_dirty integer not null default 0,
      created_at text not null default current_timestamp,
      updated_at text not null default current_timestamp
    );

    create table if not exists platform_menu_mappings (
      mapping_id text primary key,
      menu_id text not null,
      platform_code text not null,
      platform_menu_id text not null,
      platform_menu_name text not null,
      matched_by text not null,
      is_confirmed integer not null default 0,
      last_verified_at text,
      foreign key(menu_id) references menus(menu_id)
    );

    create table if not exists sync_runs (
      sync_run_id text primary key,
      started_at text not null,
      finished_at text,
      trigger_type text not null,
      result_summary text
    );
  `)
}
