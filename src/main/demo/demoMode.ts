import {eq} from 'drizzle-orm';
import {getDrizzle} from '@main/db/drizzle';
import {deleteAccount} from '@main/db/repositories/accountsRepo';
import {accounts} from '@main/db/schema';
import {
	getMessageIdByFolderAndUid,
	getTotalUnreadCount,
	replaceMessageAttachments,
	upsertFolder,
	upsertMessage,
	upsertMessageBody,
	upsertThread,
} from '@main/db/repositories/mailRepo';

const DEMO_PROVIDER = 'demo';

type DemoAccountSeed = {
	email: string;
	displayName: string;
	user: string;
	signatureText: string;
};

type DemoSeedResult = {
	createdAccounts: Array<{id: number; email: string}>;
	deletedAccounts: Array<{id: number; email: string}>;
	touchedAccountIds: number[];
	unreadCount: number;
};

const DEMO_ACCOUNTS: DemoAccountSeed[] = [
	{
		email: 'alex.rivera@demo.llamamail',
		displayName: 'Alex Rivera',
		user: 'alex.rivera',
		signatureText: 'Alex Rivera\nProduct Design',
	},
	{
		email: 'sam.chen@demo.llamamail',
		displayName: 'Sam Chen',
		user: 'sam.chen',
		signatureText: 'Sam Chen\nOperations',
	},
];

type DemoMessageSeed = {
	folderPath: string;
	folderType: string;
	uid: number;
	subject: string;
	fromName: string;
	fromAddress: string;
	toAddress: string;
	isRead: number;
	isFlagged?: number;
	tag?: string | null;
	daysAgo: number;
	threadKey: string;
	text: string;
	html: string;
	attachments?: Array<{filename: string; contentType: string; size: number}>;
};

function buildIsoDate(daysAgo: number): string {
	const date = new Date();
	date.setUTCDate(date.getUTCDate() - Math.max(0, daysAgo));
	return date.toISOString();
}

function getDemoMessages(account: DemoAccountSeed): DemoMessageSeed[] {
	return [
		{
			folderPath: 'INBOX',
			folderType: 'inbox',
			uid: 2001,
			subject: 'Welcome to LunaMail demo mode',
			fromName: 'LunaMail Team',
			fromAddress: 'hello@luna.demo',
			toAddress: account.email,
			isRead: 0,
			isFlagged: 1,
			threadKey: 'welcome',
			daysAgo: 0,
			text: `Hi ${account.displayName}, this workspace was generated for screenshots.`,
			html: `<p>Hi ${account.displayName}, this workspace was generated for screenshots.</p>`,
		},
		{
			folderPath: 'INBOX',
			folderType: 'inbox',
			uid: 2002,
			subject: 'Design review moved to 14:30',
			fromName: 'Nora Patel',
			fromAddress: 'nora@studio.demo',
			toAddress: account.email,
			isRead: 0,
			threadKey: 'design-review',
			daysAgo: 0,
			text: 'Quick update: design review starts at 14:30 in the Atlas room.',
			html: '<p>Quick update: design review starts at <b>14:30</b> in the Atlas room.</p>',
		},
		{
			folderPath: 'INBOX',
			folderType: 'inbox',
			uid: 2003,
			subject: 'Q2 launch checklist',
			fromName: 'Project Ops',
			fromAddress: 'ops@launch.demo',
			toAddress: account.email,
			isRead: 1,
			tag: 'work',
			threadKey: 'launch-checklist',
			daysAgo: 1,
			text: 'Attached is the latest launch checklist. Please review by Friday.',
			html: '<p>Attached is the latest launch checklist. Please review by Friday.</p>',
			attachments: [{filename: 'launch-checklist.pdf', contentType: 'application/pdf', size: 218742}],
		},
		{
			folderPath: 'INBOX',
			folderType: 'inbox',
			uid: 2004,
			subject: 'Lunch tomorrow?',
			fromName: 'Jamie Wong',
			fromAddress: 'jamie@friends.demo',
			toAddress: account.email,
			isRead: 1,
			threadKey: 'lunch',
			daysAgo: 2,
			text: 'Do you want to try the new ramen place at 12:00?',
			html: '<p>Do you want to try the new ramen place at 12:00?</p>',
		},
		{
			folderPath: 'Sent',
			folderType: 'sent',
			uid: 3101,
			subject: 'Re: Design review moved to 14:30',
			fromName: account.displayName,
			fromAddress: account.email,
			toAddress: 'nora@studio.demo',
			isRead: 1,
			threadKey: 'design-review',
			daysAgo: 0,
			text: 'Thanks, I will be there.',
			html: '<p>Thanks, I will be there.</p>',
		},
		{
			folderPath: 'Archive',
			folderType: 'archive',
			uid: 4101,
			subject: 'Invoice INV-2038',
			fromName: 'Billing',
			fromAddress: 'billing@vendors.demo',
			toAddress: account.email,
			isRead: 1,
			threadKey: 'invoice-2038',
			daysAgo: 8,
			text: 'Invoice attached for your records.',
			html: '<p>Invoice attached for your records.</p>',
			attachments: [{filename: 'INV-2038.pdf', contentType: 'application/pdf', size: 145321}],
		},
	];
}

function ensureSeedFolders(accountId: number, messages: DemoMessageSeed[]): Map<string, number> {
	const stats = new Map<string, {name: string; type: string; unreadCount: number; totalCount: number}>();
	const defaults = [
		{name: 'Inbox', path: 'INBOX', type: 'inbox'},
		{name: 'Sent', path: 'Sent', type: 'sent'},
		{name: 'Drafts', path: 'Drafts', type: 'drafts'},
		{name: 'Archive', path: 'Archive', type: 'archive'},
		{name: 'Trash', path: 'Trash', type: 'trash'},
	];
	for (const folder of defaults) {
		stats.set(folder.path, {name: folder.name, type: folder.type, unreadCount: 0, totalCount: 0});
	}
	for (const item of messages) {
		const existing = stats.get(item.folderPath) ?? {
			name: item.folderPath,
			type: item.folderType,
			unreadCount: 0,
			totalCount: 0,
		};
		existing.totalCount += 1;
		if (!item.isRead) existing.unreadCount += 1;
		stats.set(item.folderPath, existing);
	}
	const folderIds = new Map<string, number>();
	for (const [folderPath, value] of stats) {
		const id = upsertFolder({
			accountId,
			name: value.name,
			path: folderPath,
			type: value.type,
			unreadCount: value.unreadCount,
			totalCount: value.totalCount,
		});
		folderIds.set(folderPath, id);
	}
	return folderIds;
}

function seedMessages(accountId: number, account: DemoAccountSeed): void {
	const messageSeeds = getDemoMessages(account);
	const folderIds = ensureSeedFolders(accountId, messageSeeds);
	for (const seed of messageSeeds) {
		const folderId = folderIds.get(seed.folderPath);
		if (!folderId) continue;
		const isoDate = buildIsoDate(seed.daysAgo);
		const messageIdHeader = `<demo-${accountId}-${seed.uid}@llamamail.local>`;
		const threadId = `demo-thread-${accountId}-${seed.threadKey}`;
		upsertThread(threadId, seed.subject, isoDate);
		upsertMessage({
			accountId,
			folderId,
			uid: seed.uid,
			seq: seed.uid,
			threadId,
			messageId: messageIdHeader,
			subject: seed.subject,
			fromName: seed.fromName,
			fromAddress: seed.fromAddress,
			toAddress: seed.toAddress,
			date: isoDate,
			isRead: seed.isRead,
			isFlagged: seed.isFlagged ?? 0,
			tag: seed.tag ?? null,
			size: seed.text.length + seed.html.length,
		});
		const messageId = getMessageIdByFolderAndUid(folderId, seed.uid);
		if (!messageId) continue;
		upsertMessageBody(messageId, seed.text, seed.html);
		replaceMessageAttachments(messageId, seed.attachments ?? []);
	}
}

export async function reconcileDemoData(enabled: boolean): Promise<DemoSeedResult> {
	const db = getDrizzle();
	const existingDemoAccounts = await db
		.select({id: accounts.id, email: accounts.email})
		.from(accounts)
		.where(eq(accounts.provider, DEMO_PROVIDER))
		.execute();

	const createdAccounts: Array<{id: number; email: string}> = [];
	const deletedAccounts: Array<{id: number; email: string}> = [];
	const touchedAccountIds = new Set<number>();
	const keepEmails = new Set(DEMO_ACCOUNTS.map((item) => item.email.toLowerCase()));

	for (const account of existingDemoAccounts) {
		if (enabled && keepEmails.has(account.email.toLowerCase())) continue;
		const deleted = await deleteAccount(account.id);
		deletedAccounts.push(deleted);
	}

	if (enabled) {
		const currentRows = await db
			.select({
				id: accounts.id,
				email: accounts.email,
				provider: accounts.provider,
			})
			.from(accounts)
			.where(eq(accounts.provider, DEMO_PROVIDER))
			.execute();
		const byEmail = new Map(currentRows.map((row) => [row.email.toLowerCase(), row]));
		for (const seed of DEMO_ACCOUNTS) {
			const existing = byEmail.get(seed.email.toLowerCase());
			let accountId = existing?.id ?? 0;
			if (!accountId) {
				const inserted = await db
					.insert(accounts)
					.values({
						email: seed.email,
						provider: DEMO_PROVIDER,
						displayName: seed.displayName,
						signatureText: seed.signatureText,
						imapHost: 'demo.invalid',
						imapPort: 993,
						imapSecure: 1,
						smtpHost: 'demo.invalid',
						smtpPort: 465,
						smtpSecure: 1,
						user: seed.user,
					})
					.returning({id: accounts.id, email: accounts.email})
					.get();
				if (!inserted?.id) continue;
				accountId = inserted.id;
				createdAccounts.push({id: inserted.id, email: inserted.email});
			}
			touchedAccountIds.add(accountId);
			seedMessages(accountId, seed);
		}
	}

	return {
		createdAccounts,
		deletedAccounts,
		touchedAccountIds: Array.from(touchedAccountIds),
		unreadCount: getTotalUnreadCount(),
	};
}

export function isDemoProvider(value: string | null | undefined): boolean {
	return (
		String(value || '')
			.trim()
			.toLowerCase() === DEMO_PROVIDER
	);
}
