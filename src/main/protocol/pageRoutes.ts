import {APP_PROTOCOL} from '@/shared/appConfig.js';

type ProtocolPageRouteResolver = string | ((url: URL) => string | null);

const protocolPageRoutes = new Map<string, ProtocolPageRouteResolver>();

function normalizeRouteKey(value: string): string {
	return String(value || '')
		.trim()
		.toLowerCase()
		.replace(/^\/+|\/+$/g, '');
}

function normalizeAppRoute(value: string | null | undefined): string | null {
	const route = String(value || '').trim();
	if (!route.startsWith('/')) return null;
	return route;
}

export function registerProtocolPageRoute(key: string, route: ProtocolPageRouteResolver): void {
	const normalizedKey = normalizeRouteKey(key);
	if (!normalizedKey) throw new Error('Protocol page key is required.');
	protocolPageRoutes.set(normalizedKey, route);
}

export function registerProtocolPageRoutes(entries: Array<{key: string; route: ProtocolPageRouteResolver}>): void {
	for (const entry of entries) {
		registerProtocolPageRoute(entry.key, entry.route);
	}
}

export function registerDefaultProtocolPageRoutes(): void {
	registerProtocolPageRoutes([
		{key: 'email', route: '/email'},
		{key: 'contacts', route: '/contacts'},
		{key: 'calendar', route: '/calendar'},
		{key: 'cloud', route: '/cloud'},
		{key: 'settings', route: '/settings/application'},
		{key: 'debug', route: '/debug'},
		{key: 'help', route: '/about'},
		{key: 'about', route: '/about'},
	]);
}

function resolvePageKey(url: URL): string | null {
	if (url.protocol.toLowerCase() !== `${APP_PROTOCOL.toLowerCase()}:`) return null;
	const hostKey = normalizeRouteKey(url.hostname || '');
	if (hostKey === 'page') {
		const routeKey = normalizeRouteKey(url.pathname.split('/').filter(Boolean)[0] || '');
		if (routeKey) return routeKey;
		return protocolPageRoutes.has('page') ? 'page' : null;
	}
	if (hostKey) return hostKey;
	const pathKey = normalizeRouteKey(url.pathname.split('/').filter(Boolean)[0] || '');
	return pathKey || null;
}

export function resolveProtocolPageRoute(urlText: string): string | null {
	try {
		const url = new URL(urlText);
		const key = resolvePageKey(url);
		if (!key) return null;
		const routeResolver = protocolPageRoutes.get(key);
		if (!routeResolver) return null;
		if (typeof routeResolver === 'function') {
			return normalizeAppRoute(routeResolver(url));
		}
		return normalizeAppRoute(routeResolver);
	} catch {
		return null;
	}
}
