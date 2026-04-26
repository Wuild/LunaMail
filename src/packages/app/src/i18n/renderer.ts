import {useSyncExternalStore} from 'react';
import {
	type I18nCatalogByNamespace,
	type TranslationParams,
	translateCatalog,
	type SupportedAppLocale,
	resolveSupportedLocale,
} from './types';

type I18nState = {
	locale: SupportedAppLocale;
	catalog: I18nCatalogByNamespace;
};

const defaultState: I18nState = {
	locale: 'en-US',
	catalog: {},
};

let state: I18nState = defaultState;
const listeners = new Set<() => void>();

function emit(): void {
	for (const listener of listeners) {
		try {
			listener();
		} catch {
			// ignore subscriber errors
		}
	}
}

function setState(next: I18nState): void {
	state = next;
	emit();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

function getSnapshot(): I18nState {
	return state;
}

export function initRendererI18n(payload: {locale?: string | null; catalog?: I18nCatalogByNamespace | null}): void {
	setState({
		locale: resolveSupportedLocale(payload.locale),
		catalog: payload.catalog || {},
	});
}

export function setRendererI18nLocale(payload: {locale?: string | null; catalog?: I18nCatalogByNamespace | null}): void {
	setState({
		locale: resolveSupportedLocale(payload.locale),
		catalog: payload.catalog || {},
	});
}

export function t(key: string, params?: TranslationParams): string {
	return translateCatalog(state.catalog, key, params);
}

export function useI18n(): {locale: SupportedAppLocale; t: (key: string, params?: TranslationParams) => string} {
	const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
	return {
		locale: snapshot.locale,
		t: (key: string, params?: TranslationParams) => translateCatalog(snapshot.catalog, key, params),
	};
}
