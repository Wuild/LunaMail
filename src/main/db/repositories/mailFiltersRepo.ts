import {getDb} from '@main/db/drizzle.js';
import type {
	MailFilter,
	MailFilterAction,
	MailFilterActionType,
	MailFilterCondition,
	MailFilterField,
	MailFilterMatchMode,
	MailFilterOperator,
	UpsertMailFilterPayload,
} from '@/shared/ipcTypes.js';

// Filter CRUD remains intentionally raw SQL for now because it spans parent/child tables with transactional upsert
// semantics. Keep all statements parameterized and scoped to repository functions.
export type {
	MailFilter,
	MailFilterAction,
	MailFilterActionType,
	MailFilterCondition,
	MailFilterField,
	MailFilterMatchMode,
	MailFilterOperator,
	UpsertMailFilterPayload,
} from '@/shared/ipcTypes.js';

export function listMailFilters(accountId: number): MailFilter[] {
	const db = getDb();
	const filters = db
		.prepare(
			`
            SELECT *
            FROM mail_filters
            WHERE account_id = ?
            ORDER BY id ASC
        `,
		)
		.all(accountId) as Array<Omit<MailFilter, 'conditions' | 'actions'>>;
	if (filters.length === 0) return [];

	const conditions = db
		.prepare(
			`
            SELECT *
            FROM mail_filter_conditions
            WHERE filter_id IN (${filters.map(() => '?').join(',')})
            ORDER BY sort_order ASC, id ASC
        `,
		)
		.all(...filters.map((f) => f.id)) as MailFilterCondition[];
	const actions = db
		.prepare(
			`
            SELECT *
            FROM mail_filter_actions
            WHERE filter_id IN (${filters.map(() => '?').join(',')})
            ORDER BY sort_order ASC, id ASC
        `,
		)
		.all(...filters.map((f) => f.id)) as MailFilterAction[];

	return filters.map((filter) => ({
		...filter,
		conditions: conditions.filter((condition) => condition.filter_id === filter.id),
		actions: actions.filter((action) => action.filter_id === filter.id),
	}));
}

export function upsertMailFilter(accountId: number, payload: UpsertMailFilterPayload): MailFilter {
	const db = getDb();
	const name = String(payload.name || '').trim() || 'New filter';
	const enabled = payload.enabled ? 1 : 0;
	const runOnIncoming = payload.run_on_incoming === 0 ? 0 : 1;
	const matchMode = normalizeMatchMode(payload.match_mode);
	const stopProcessing = payload.stop_processing === 0 ? 0 : 1;

	const tx = db.transaction(() => {
		let filterId = Number(payload.id || 0);
		if (filterId > 0) {
			const existing = db
				.prepare('SELECT id FROM mail_filters WHERE id = ? AND account_id = ?')
				.get(filterId, accountId) as {id: number} | undefined;
			if (!existing?.id) throw new Error('Filter not found');
			db.prepare(
				`
                    UPDATE mail_filters
                    SET name            = ?,
                        enabled         = ?,
                        run_on_incoming = ?,
                        match_mode      = ?,
                        stop_processing = ?,
                        updated_at      = CURRENT_TIMESTAMP
                    WHERE id = ?
                      AND account_id = ?
                `,
			).run(name, enabled, runOnIncoming, matchMode, stopProcessing, filterId, accountId);
			db.prepare('DELETE FROM mail_filter_conditions WHERE filter_id = ?').run(filterId);
			db.prepare('DELETE FROM mail_filter_actions WHERE filter_id = ?').run(filterId);
		} else {
			const result = db
				.prepare(
					`
                    INSERT INTO mail_filters (account_id, name, enabled, run_on_incoming, match_mode, stop_processing)
                    VALUES (?, ?, ?, ?, ?, ?)
                `,
				)
				.run(accountId, name, enabled, runOnIncoming, matchMode, stopProcessing);
			filterId = Number(result.lastInsertRowid);
		}

		const conditionInsert = db.prepare(
			`
                INSERT INTO mail_filter_conditions (filter_id, field, operator, value, sort_order)
                VALUES (?, ?, ?, ?, ?)
            `,
		);
		const safeConditions = Array.isArray(payload.conditions) ? payload.conditions : [];
		safeConditions.forEach((condition, index) => {
			conditionInsert.run(
				filterId,
				normalizeConditionField(condition.field),
				normalizeConditionOperator(condition.operator),
				String(condition.value ?? ''),
				index,
			);
		});

		const actionInsert = db.prepare(
			`
                INSERT INTO mail_filter_actions (filter_id, type, value, sort_order)
                VALUES (?, ?, ?, ?)
            `,
		);
		const safeActions = Array.isArray(payload.actions) ? payload.actions : [];
		safeActions.forEach((action, index) => {
			actionInsert.run(filterId, normalizeActionType(action.type), String(action.value ?? ''), index);
		});
	});
	tx();

	const filters = listMailFilters(accountId);
	const targetId = Number(payload.id || 0);
	if (targetId > 0) {
		const updated = filters.find((filter) => filter.id === targetId);
		if (!updated) throw new Error('Filter not found after update');
		return updated;
	}
	const latest = filters[filters.length - 1];
	if (!latest) throw new Error('Filter not found after insert');
	return latest;
}

export function deleteMailFilter(accountId: number, filterId: number): {removed: boolean} {
	const db = getDb();
	const result = db.prepare('DELETE FROM mail_filters WHERE id = ? AND account_id = ?').run(filterId, accountId);
	return {removed: result.changes > 0};
}

function normalizeMatchMode(value?: string): MailFilterMatchMode {
	if (value === 'any') return 'any';
	if (value === 'all_messages') return 'all_messages';
	return 'all';
}

function normalizeConditionField(value?: string): MailFilterField {
	if (value === 'from' || value === 'to' || value === 'body') return value;
	return 'subject';
}

function normalizeConditionOperator(value?: string): MailFilterOperator {
	if (value === 'not_contains' || value === 'equals' || value === 'starts_with' || value === 'ends_with')
		return value;
	return 'contains';
}

function normalizeActionType(value?: string): MailFilterActionType {
	if (value === 'mark_read' || value === 'mark_unread' || value === 'star' || value === 'unstar') return value;
	return 'move_to_folder';
}
