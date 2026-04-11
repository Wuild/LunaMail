import {APP_NAME, APP_PROTOCOL, APP_URL} from '@/shared/appConfig.js';
import {ONEDRIVE_DEFAULT_CLIENT_ID, ONEDRIVE_DEFAULT_TENANT_ID} from '@/shared/cloudConfig.js';

export {APP_NAME, APP_PROTOCOL, APP_URL};
export const APP_VERSION = '0.0.1';

/**
 * OneDrive
 */
export const ONEDRIVE_APP_ID = ONEDRIVE_DEFAULT_CLIENT_ID;
export const ONEDRIVE_TENANT_ID = ONEDRIVE_DEFAULT_TENANT_ID;
export const ONEDRIVE_SCOPES = ['Files.ReadWrite', 'Files.ReadWrite.All', 'Sites.ReadWrite.All'];
export const ONEDRIVE_REDIRECT_URI = `${APP_PROTOCOL}://azure/auth`;
export const ONEDRIVE_AUTHORITY = `https://login.microsoftonline.com/${ONEDRIVE_TENANT_ID}`;
export const ONEDRIVE_RESOURCE = 'https://graph.microsoft.com';
