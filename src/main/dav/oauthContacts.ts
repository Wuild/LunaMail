import {getAccountSyncCredentials} from '@main/db/repositories/accountsRepo';
import {listContacts, upsertContacts, type ContactRow} from '@main/db/repositories/davRepo';
import {refreshMailOAuthSessionWithOptions} from '@main/auth/authServerClient';
import {getMicrosoftGraphOAuthScopes} from '@main/mail/oauth';
import type {OAuthProvider} from '@llamamail/app/ipcTypes';
import {
	configureOauthContactsDependencies,
	createOauthContact,
	deleteOauthContactForAccount,
	isOauthProviderContactSource,
	resolveOauthContactContext,
	updateOauthContactForAccount,
	type ContactMutationPayload,
	type OAuthProviderContactContext,
} from './oauthContactsRuntime';

configureOauthContactsDependencies({
	getAccountSyncCredentials: async (accountId) => await getAccountSyncCredentials(accountId),
	refreshMailOAuthSessionWithOptions: async (session, options) =>
		await refreshMailOAuthSessionWithOptions(session, options),
	getMicrosoftGraphOAuthScopes: () => getMicrosoftGraphOAuthScopes(),
	listContacts: (accountId, query, limit) => listContacts(accountId, query, limit),
	upsertContacts: (accountId, rows, source) => upsertContacts(accountId, rows, source),
});

export {
	createOauthContact,
	deleteOauthContactForAccount,
	isOauthProviderContactSource,
	resolveOauthContactContext,
	updateOauthContactForAccount,
};

export type {ContactRow, ContactMutationPayload, OAuthProviderContactContext, OAuthProvider};
