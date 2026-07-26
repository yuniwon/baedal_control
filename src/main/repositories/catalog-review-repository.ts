import type { CatalogReviewItem } from '../../shared/contracts'
import type { DatabaseConnection } from '../db/connection'
import { withSavepoint } from '../db/savepoint'

export class CatalogReviewRepository {
  constructor(private readonly db: DatabaseConnection) {}

  replaceOpen(workspaceId: string, items: CatalogReviewItem[]) {
    const uniqueItems = [...new Map(items.map((item) => [item.fingerprint, item])).values()]

    withSavepoint(this.db, () => {
      if (uniqueItems.length === 0) {
        this.db.prepare(`
          update catalog_review_items
          set state = 'resolved', updated_at = current_timestamp
          where workspace_id = ? and state != 'resolved'
        `).run(workspaceId)
      } else {
        const placeholders = uniqueItems.map(() => '?').join(', ')
        this.db.prepare(`
          update catalog_review_items
          set state = 'resolved', updated_at = current_timestamp
          where workspace_id = ?
            and state != 'resolved'
            and fingerprint not in (${placeholders})
        `).run(workspaceId, ...uniqueItems.map((item) => item.fingerprint))
      }

      for (const item of uniqueItems) {
        this.db.prepare(`
          insert into catalog_review_items (
            review_item_id,
            workspace_id,
            fingerprint,
            kind,
            state,
            confidence,
            title,
            explanation,
            recommendation,
            evidence_json,
            canonical_menu_id,
            platform_code,
            source_entity_id,
            intent_rule_id
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          on conflict(workspace_id, fingerprint) do update set
            review_item_id = excluded.review_item_id,
            kind = excluded.kind,
            state = case
              when catalog_review_items.state = 'resolved' then 'resolved'
              else excluded.state
            end,
            confidence = excluded.confidence,
            title = excluded.title,
            explanation = excluded.explanation,
            recommendation = excluded.recommendation,
            evidence_json = excluded.evidence_json,
            canonical_menu_id = excluded.canonical_menu_id,
            platform_code = excluded.platform_code,
            source_entity_id = excluded.source_entity_id,
            intent_rule_id = excluded.intent_rule_id,
            updated_at = current_timestamp
        `).run(
          item.reviewItemId,
          workspaceId,
          item.fingerprint,
          item.kind,
          item.state,
          item.confidence,
          item.title,
          item.explanation,
          item.recommendation,
          item.evidenceJson,
          item.canonicalMenuId ?? null,
          item.platformCode ?? null,
          item.sourceEntityId ?? null,
          item.intentRuleId ?? null
        )
      }
    })
  }

  listOpen(workspaceId: string): CatalogReviewItem[] {
    return this.db.prepare(`
      select
        review_item_id as reviewItemId,
        workspace_id as workspaceId,
        fingerprint,
        kind,
        state,
        confidence,
        title,
        explanation,
        recommendation,
        evidence_json as evidenceJson,
        canonical_menu_id as canonicalMenuId,
        platform_code as platformCode,
        source_entity_id as sourceEntityId,
        intent_rule_id as intentRuleId,
        created_at as createdAt,
        updated_at as updatedAt
      from catalog_review_items
      where workspace_id = ? and state != 'resolved'
      order by confidence desc, created_at asc, review_item_id asc
    `).all(workspaceId) as unknown as CatalogReviewItem[]
  }

  resolve(reviewItemIds: string[], intentRuleId?: string | null) {
    this.setState(reviewItemIds, 'resolved', intentRuleId)
  }

  setState(
    reviewItemIds: string[],
    state: Extract<CatalogReviewItem['state'], 'resolved' | 'deferred'>,
    intentRuleId?: string | null
  ) {
    if (reviewItemIds.length === 0) {
      return
    }

    const placeholders = reviewItemIds.map(() => '?').join(', ')
    this.db.prepare(`
      update catalog_review_items
      set
        state = ?,
        intent_rule_id = coalesce(?, intent_rule_id),
        updated_at = current_timestamp
      where review_item_id in (${placeholders})
    `).run(state, intentRuleId ?? null, ...reviewItemIds)
  }
}
