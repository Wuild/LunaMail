import {createMailDebugLogger} from '@main/debug/debugLog';
import {getAccountSyncCredentials} from '@main/db/repositories/accountsRepo';
import {resolveImapSecurity} from './security';
import {
	getFolderPositiveUidBounds,
	getMessageBody,
	getMessageContext,
	getMessageIdByFolderAndUid,
	hasMessageByFolderAndUid,
	listFoldersByAccount,
	listMessageAttachments,
	reconcileFolderMessageUids,
	replaceMessageAttachments,
	updateFolderCounts,
	upsertFolder,
	upsertMessage,
	upsertMessageBody,
	upsertThread,
} from '@main/db/repositories/mailRepo';
import {buildThreadId, stringifyReferences} from './threading';
import {providerManager} from './providerManager';
import {
	configureImapMailSyncDependencies,
	downloadMessageAttachment,
	syncAccountMailbox,
	syncAccountMailboxWithCredentials,
	syncMessageBody,
	syncMessageSource,
	type AccountSyncOptions,
	type MessageAttachmentFile,
	type MessageBodyResult,
	type MessageBodySyncOptions,
	type MessageSourceResult,
	type SyncSummary,
} from '@llamamail/providers/custom/mailSyncRuntime';

configureImapMailSyncDependencies({
	createMailDebugLogger: (channel, context) => createMailDebugLogger(channel as any, context),
	resolveImapSecurity: (imapSecure) => resolveImapSecurity(imapSecure),
	resolveImapAuth: async (account) => {
		const driver = await providerManager.resolveDriverForAccount(account.id);
		return driver.resolveImapAuth(account);
	},
	getAccountSyncCredentials: async (accountId) => await getAccountSyncCredentials(accountId),
	getFolderPositiveUidBounds: (folderId) => getFolderPositiveUidBounds(folderId),
	getMessageBody: (messageId) => getMessageBody(messageId),
	getMessageContext: (messageId) => getMessageContext(messageId),
	getMessageIdByFolderAndUid: (folderId, uid) => getMessageIdByFolderAndUid(folderId, uid),
	hasMessageByFolderAndUid: (folderId, uid) => hasMessageByFolderAndUid(folderId, uid),
	listFoldersByAccount: (accountId) => listFoldersByAccount(accountId),
	listMessageAttachments: (messageId) => listMessageAttachments(messageId),
	reconcileFolderMessageUids: (folderId, uids) => reconcileFolderMessageUids(folderId, uids),
	replaceMessageAttachments: (messageId, attachments) => replaceMessageAttachments(messageId, attachments),
	updateFolderCounts: (accountId, path, unreadCount, totalCount) => updateFolderCounts(accountId, path, unreadCount, totalCount),
	upsertFolder: (payload) => upsertFolder(payload),
	upsertMessage: (payload) => upsertMessage(payload),
	upsertMessageBody: (messageId, text, html) => upsertMessageBody(messageId, text, html),
	upsertThread: (threadId, subject, latestDate) => upsertThread(threadId, subject, latestDate),
	buildThreadId: (payload) => buildThreadId(payload),
	stringifyReferences: (references) => stringifyReferences(references),
	resolveDriverForAccount: async (accountId) => await providerManager.resolveDriverForAccount(accountId),
});

export {syncAccountMailbox, syncAccountMailboxWithCredentials, syncMessageBody, syncMessageSource, downloadMessageAttachment};
export type {
	SyncSummary,
	MessageBodyResult,
	MessageSourceResult,
	MessageBodySyncOptions,
	AccountSyncOptions,
	MessageAttachmentFile,
};
