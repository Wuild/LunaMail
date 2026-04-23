import {
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
} from './mailSyncRuntime';
import type {OAuthSession} from '@llamamail/app/ipcTypes';

export type ImapEmailCredentials = {
	id: number;
	imap_host: string;
	imap_port: number;
	imap_secure: number;
	user: string;
	auth_method: 'password' | 'app_password' | 'oauth2';
	password: string | null;
	oauth_session: OAuthSession | null;
};

export class ImapEmailProvider {
	async sync(accountId: number, options?: AccountSyncOptions): Promise<SyncSummary> {
		return await syncAccountMailbox(accountId, options);
	}

	async syncWithCredentials(credentials: ImapEmailCredentials, options?: AccountSyncOptions): Promise<SyncSummary> {
		return await syncAccountMailboxWithCredentials(credentials, options);
	}

	async syncMessageBody(messageId: number, options?: MessageBodySyncOptions): Promise<MessageBodyResult> {
		return await syncMessageBody(messageId, options);
	}

	async syncMessageSource(messageId: number, options?: MessageBodySyncOptions): Promise<MessageSourceResult> {
		return await syncMessageSource(messageId, options);
	}

	async downloadAttachment(
		messageId: number,
		attachmentIndex: number,
		options?: MessageBodySyncOptions,
	): Promise<MessageAttachmentFile> {
		return await downloadMessageAttachment(messageId, attachmentIndex, options);
	}
}
