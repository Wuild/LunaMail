import {ImapFlow} from 'imapflow';
import {createMailDebugLogger} from '../debug/debugLog.js';
import {getAccountSyncCredentials} from '../db/repositories/accountsRepo.js';
import {resolveImapSecurity} from './security.js';
import {
    getMessageContext,
    listFoldersByAccount,
    type MoveMessageResult,
    moveMessageToFolder,
    setMessageFlagged,
    setMessageRead,
    type SetMessageReadResult,
} from '../db/repositories/mailRepo.js';

interface ActionResult {
    accountId: number;
}

interface MessageServerContext {
    accountId: number;
    folderPath: string;
    uid: number;
}

export interface CreateFolderResult {
    accountId: number;
    path: string;
}

export interface DeleteFolderResult {
    accountId: number;
    path: string;
}

export async function setServerMessageRead(messageId: number, isRead: number): Promise<SetMessageReadResult> {
    const ctx = getMessageContext(messageId);
    if (!ctx) throw new Error(`Message ${messageId} not found`);

    await withImapLock(ctx.accountId, ctx.folderPath, async (client) => {
        if (isRead) {
            await (client as any).messageFlagsAdd(ctx.uid, ['\\Seen'], {uid: true});
        } else {
            await (client as any).messageFlagsRemove(ctx.uid, ['\\Seen'], {uid: true});
        }
    });

    return setMessageRead(messageId, isRead);
}

export async function setServerMessageFlagged(messageId: number, isFlagged: number): Promise<ActionResult> {
    const ctx = getMessageContext(messageId);
    if (!ctx) throw new Error(`Message ${messageId} not found`);

    await withImapLock(ctx.accountId, ctx.folderPath, async (client) => {
        if (isFlagged) {
            await (client as any).messageFlagsAdd(ctx.uid, ['\\Flagged'], {uid: true});
        } else {
            await (client as any).messageFlagsRemove(ctx.uid, ['\\Flagged'], {uid: true});
        }
    });

    setMessageFlagged(messageId, isFlagged);
    return {accountId: ctx.accountId};
}

export async function moveServerMessage(messageId: number, targetFolderPath: string): Promise<MoveMessageResult> {
    const ctx = getMessageContext(messageId);
    if (!ctx) throw new Error(`Message ${messageId} not found`);
    if (!targetFolderPath) throw new Error('Target folder path is required');
    if (ctx.folderPath === targetFolderPath) return moveMessageToFolder(messageId, targetFolderPath);

    let movedUid: number | undefined;
    await withImapLock(ctx.accountId, ctx.folderPath, async (client) => {
        const result = await (client as any).messageMove(ctx.uid, targetFolderPath, {uid: true});
        const uidMap =
            result && typeof result === 'object'
                ? (
                    result as {
                        uidMap?: Map<number, number>;
                    }
                ).uidMap
                : undefined;
        if (uidMap?.has(ctx.uid)) {
            movedUid = uidMap.get(ctx.uid);
        }
    });

    return moveMessageToFolder(messageId, targetFolderPath, movedUid);
}

export async function deleteServerMessage(messageId: number): Promise<ActionResult> {
    const ctx = getMessageContext(messageId);
    if (!ctx) throw new Error(`Message ${messageId} not found`);
    await deleteServerMessageByContext({
        accountId: ctx.accountId,
        folderPath: ctx.folderPath,
        uid: ctx.uid,
    });
    return {accountId: ctx.accountId};
}

export async function deleteServerMessageByContext(ctx: MessageServerContext): Promise<void> {
    const folders = listFoldersByAccount(ctx.accountId);
    const trash =
        folders.find((f) => (f.type ?? '').toLowerCase() === 'trash') ??
        folders.find((f) => /trash|deleted/i.test(f.path));

    await withImapLock(ctx.accountId, ctx.folderPath, async (client) => {
        if (trash && trash.path !== ctx.folderPath) {
            await (client as any).messageMove(ctx.uid, trash.path, {uid: true});
            return;
        }
        await (client as any).messageDelete(ctx.uid, {uid: true});
    });
}

export async function createServerFolder(accountId: number, folderPath: string): Promise<CreateFolderResult> {
    const path = (folderPath || '').trim();
    if (!accountId) throw new Error('Account is required');
    if (!path) throw new Error('Folder name is required');

    const account = await getAccountSyncCredentials(accountId);
    const client = new ImapFlow({
        host: account.imap_host,
        port: account.imap_port,
        ...resolveImapSecurity(account.imap_secure),
        auth: {user: account.user, pass: account.password},
        logger: createMailDebugLogger('imap', `folder:create:${accountId}`),
    });

    try {
        await client.connect();
        await client.mailboxCreate(path);
    } finally {
        try {
            await client.logout();
        } catch {
            // ignore
        }
    }

    return {accountId, path};
}

export async function deleteServerFolder(accountId: number, folderPath: string): Promise<DeleteFolderResult> {
    const path = (folderPath || '').trim();
    if (!accountId) throw new Error('Account is required');
    if (!path) throw new Error('Folder path is required');
    if (isProtectedFolderPath(path)) {
        throw new Error('System folders cannot be deleted');
    }

    const account = await getAccountSyncCredentials(accountId);
    const client = new ImapFlow({
        host: account.imap_host,
        port: account.imap_port,
        ...resolveImapSecurity(account.imap_secure),
        auth: {user: account.user, pass: account.password},
        logger: createMailDebugLogger('imap', `folder:delete:${accountId}`),
    });

    try {
        await client.connect();
        await client.mailboxDelete(path);
    } finally {
        try {
            await client.logout();
        } catch {
            // ignore
        }
    }

    return {accountId, path};
}

async function withImapLock(
    accountId: number,
    folderPath: string,
    fn: (client: ImapFlow) => Promise<void>,
): Promise<void> {
    const account = await getAccountSyncCredentials(accountId);
    const client = new ImapFlow({
        host: account.imap_host,
        port: account.imap_port,
        ...resolveImapSecurity(account.imap_secure),
        auth: {user: account.user, pass: account.password},
        logger: createMailDebugLogger('imap', `message:action:${accountId}:${folderPath}`),
    });

    try {
        await client.connect();
        const lock = await client.getMailboxLock(folderPath);
        try {
            await fn(client);
        } finally {
            lock.release();
        }
    } finally {
        try {
            await client.logout();
        } catch {
            // ignore
        }
    }
}

function isProtectedFolderPath(path: string): boolean {
    const normalized = path.trim().toLowerCase();
    if (normalized === 'inbox') return true;
    if (/(^|[\/._ -])sent($|[\/._ -])/.test(normalized)) return true;
    if (/(^|[\/._ -])drafts?($|[\/._ -])/.test(normalized)) return true;
    if (/(^|[\/._ -])trash($|[\/._ -])|deleted/.test(normalized)) return true;
    if (/(^|[\/._ -])junk($|[\/._ -])|spam/.test(normalized)) return true;
    if (/(^|[\/._ -])archive($|[\/._ -])/.test(normalized)) return true;
    return false;
}
