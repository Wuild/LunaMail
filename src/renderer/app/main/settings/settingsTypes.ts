import type {UpdateAccountPayload} from '@preload';

export type AccountEditor = UpdateAccountPayload & {id: number};
export type AccountPanelSection = 'identity' | 'email' | 'carddav' | 'caldav' | 'filters';
