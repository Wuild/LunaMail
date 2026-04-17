import {APP_PROTOCOL} from './appConfig.js';

export const ONEDRIVE_DEFAULT_CLIENT_ID = 'e063ebfa-cd51-47fd-8a97-6a73fe65f26c';
export const ONEDRIVE_DEFAULT_TENANT_ID = 'common';

export const ONEDRIVE_APP_ID = ONEDRIVE_DEFAULT_CLIENT_ID;
export const ONEDRIVE_TENANT_ID = ONEDRIVE_DEFAULT_TENANT_ID;
export const ONEDRIVE_SCOPES = ['Files.ReadWrite', 'Files.ReadWrite.All', 'Sites.ReadWrite.All'];
export const ONEDRIVE_REDIRECT_URI = `${APP_PROTOCOL}://azure/auth`;
export const ONEDRIVE_AUTHORITY = `https://login.microsoftonline.com/${ONEDRIVE_TENANT_ID}`;
export const ONEDRIVE_RESOURCE = 'https://graph.microsoft.com';
