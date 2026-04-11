import {getMessageBody, getMessageById} from '@main/db/repositories/mailRepo.js';
import {
    deleteMailFilter,
    listMailFilters,
    type MailFilter,
    type MailFilterAction,
    type MailFilterCondition,
    upsertMailFilter,
} from '@main/db/repositories/mailFiltersRepo.js';
import {moveServerMessage, setServerMessageFlagged, setServerMessageRead} from './actions.js';

export type FilterRunTrigger = 'incoming' | 'manual';

export interface FilterRunSummary {
    accountId: number;
    trigger: FilterRunTrigger;
    processed: number;
    matched: number;
    actionsApplied: number;
    errors: number;
}

export {deleteMailFilter, listMailFilters, upsertMailFilter};

export async function runMailFiltersForMessages(
    accountId: number,
    messageIds: number[],
    trigger: FilterRunTrigger,
    options?: { filterIds?: number[] },
): Promise<FilterRunSummary> {
    const requestedIds = new Set(Array.isArray(options?.filterIds) ? options!.filterIds! : []);
    const filters = listMailFilters(accountId)
        .filter((filter) => filter.enabled)
        .filter((filter) => trigger === 'manual' || filter.run_on_incoming)
        .filter((filter) => requestedIds.size === 0 || requestedIds.has(filter.id));

    const summary: FilterRunSummary = {
        accountId,
        trigger,
        processed: 0,
        matched: 0,
        actionsApplied: 0,
        errors: 0,
    };

    for (const messageId of messageIds) {
        const message = getMessageById(messageId);
        if (!message || message.account_id !== accountId) continue;
        summary.processed += 1;

        for (const filter of filters) {
            const matched = evaluateFilter(filter, messageId, message);
            if (!matched) continue;
            summary.matched += 1;

            try {
                for (const action of filter.actions) {
                    const applied = await applyFilterAction(messageId, action);
                    if (applied) summary.actionsApplied += 1;
                }
            } catch {
                summary.errors += 1;
            }

            if (filter.stop_processing) break;
        }
    }

    return summary;
}

function evaluateFilter(filter: MailFilter, messageId: number, message: ReturnType<typeof getMessageById>): boolean {
    if (!message) return false;
    if (filter.match_mode === 'all_messages') return true;
    if (filter.conditions.length === 0) return false;

    const checks = filter.conditions.map((condition) => evaluateCondition(condition, messageId, message));
    return filter.match_mode === 'any' ? checks.some(Boolean) : checks.every(Boolean);
}

function evaluateCondition(
    condition: MailFilterCondition,
    messageId: number,
    message: NonNullable<ReturnType<typeof getMessageById>>,
): boolean {
    const fieldValue = readConditionFieldValue(condition.field, messageId, message);
    const expectedValue = String(condition.value || '');
    return compareStrings(fieldValue, expectedValue, condition.operator);
}

function readConditionFieldValue(
    field: MailFilterCondition['field'],
    messageId: number,
    message: NonNullable<ReturnType<typeof getMessageById>>,
): string {
    if (field === 'from') return String(message.from_address || message.from_name || '');
    if (field === 'to') return String(message.to_address || '');
    if (field === 'body') {
        const body = getMessageBody(messageId);
        return String(body?.text_content || body?.html_content || '');
    }
    return String(message.subject || '');
}

function compareStrings(leftRaw: string, rightRaw: string, operator: MailFilterCondition['operator']): boolean {
    const left = leftRaw.toLowerCase();
    const right = rightRaw.toLowerCase();
    if (operator === 'equals') return left === right;
    if (operator === 'starts_with') return left.startsWith(right);
    if (operator === 'ends_with') return left.endsWith(right);
    if (operator === 'not_contains') return !left.includes(right);
    return left.includes(right);
}

async function applyFilterAction(messageId: number, action: MailFilterAction): Promise<boolean> {
    if (action.type === 'mark_read') {
        await setServerMessageRead(messageId, 1);
        return true;
    }
    if (action.type === 'mark_unread') {
        await setServerMessageRead(messageId, 0);
        return true;
    }
    if (action.type === 'star') {
        await setServerMessageFlagged(messageId, 1);
        return true;
    }
    if (action.type === 'unstar') {
        await setServerMessageFlagged(messageId, 0);
        return true;
    }
    const targetFolder = String(action.value || '').trim();
    if (!targetFolder) return false;
    await moveServerMessage(messageId, targetFolder);
    return true;
}
