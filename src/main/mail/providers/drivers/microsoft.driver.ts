import type {ProviderDriverRegistration} from '../contracts.js';
import {ImapProviderDriver} from '../imapProviderDriver.js';
import {ImapWorkerEmailSyncService} from '../syncServices.js';
import {OAuthApiAncillarySyncService} from '../ancillarySyncServices.js';

export const microsoftProviderDriverRegistration: ProviderDriverRegistration = {
	key: 'microsoft',
	label: 'Microsoft',
	logo: 'microsoft',
	enabled: true,
	capabilities: {
		emails: true,
		contacts: true,
		calendar: true,
		files: false,
	},
	sync: {
		canRunInitialSync: true,
		canRunIncrementalSync: true,
		supportsRealtimeEvents: true,
		supportsPushNotifications: true,
	},
	recommendedAuthMethod: 'oauth2',
	supportedAuthMethods: ['oauth2', 'app_password'],
	createDriver: () =>
		new ImapProviderDriver({
			key: 'microsoft',
			label: 'Microsoft (IMAP)',
			capabilities: ['emails', 'contacts', 'calendar'],
		}),
	createEmailSyncService: (driver) => new ImapWorkerEmailSyncService(driver),
	createAncillarySyncService: (driver) => new OAuthApiAncillarySyncService(driver, 'microsoft'),
};
