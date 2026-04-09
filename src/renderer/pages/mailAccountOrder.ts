import type {PublicAccount} from "../../preload";

export const ACCOUNT_ORDER_STORAGE_KEY = "llamamail.mail.accountOrder.v1";

function arraysEqual(a: number[], b: number[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i += 1) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

export function normalizeAccountOrder(order: number[], accounts: PublicAccount[]): number[] {
	const availableIds = new Set(accounts.map((account) => account.id));
	const ordered: number[] = [];
	for (const id of order) {
		if (!availableIds.has(id)) continue;
		if (ordered.includes(id)) continue;
		ordered.push(id);
	}
	for (const account of accounts) {
		if (!ordered.includes(account.id)) {
			ordered.push(account.id);
		}
	}
	return ordered;
}

export function readPersistedAccountOrder(): number[] {
	if (typeof window === "undefined") return [];
	try {
		const raw = window.localStorage.getItem(ACCOUNT_ORDER_STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		const next = parsed.map((value) => Number(value)).filter((value) => Number.isFinite(value));
		return Array.from(new Set(next));
	} catch {
		return [];
	}
}

export function sortAccountsByOrder(accounts: PublicAccount[], order: number[]): PublicAccount[] {
	if (accounts.length <= 1) return accounts;
	const normalizedOrder = normalizeAccountOrder(order, accounts);
	const positionById = new Map<number, number>(normalizedOrder.map((id, index) => [id, index]));
	return [...accounts].sort((left, right) => {
		const leftPos = positionById.get(left.id) ?? Number.MAX_SAFE_INTEGER;
		const rightPos = positionById.get(right.id) ?? Number.MAX_SAFE_INTEGER;
		return leftPos - rightPos;
	});
}

export function writePersistedAccountOrder(order: number[]): void {
	try {
		window.localStorage.setItem(ACCOUNT_ORDER_STORAGE_KEY, JSON.stringify(order));
	} catch {
		// Ignore storage write errors.
	}
}

export function hasAccountOrderChanged(prev: number[], next: number[]): boolean {
	return !arraysEqual(prev, next);
}
