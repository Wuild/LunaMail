import {app} from 'electron';
import path from 'path';
import {APP_PROTOCOL} from '@llamamail/app/appConfig';
import {registerDefaultProtocolPageRoutes, resolveProtocolPageRoute} from './pageRoutes';

type AppLogger = {
	info: (...args: any[]) => void;
	warn: (...args: any[]) => void;
};

type ProtocolHandlerDeps = {
	logger: AppLogger;
	queueMailOAuthCallbackUrl: (url: string) => boolean;
	queueCloudOAuthCallbackUrl: (url: string) => boolean;
	handleFallbackProtocolUrl: (url: string) => boolean;
	openMainWindowEntryPoint: () => void;
	navigateMainWindowToRoute: (route: string) => void;
	openComposeQuickAction: () => void;
	showMainWindow: () => void;
	isMainWindowActionsEnabled: () => boolean;
	openComposeFromMailtoUrl: (mailtoUrl: string) => void;
};

type LaunchIntent = {
	action: 'compose' | null;
	route: string | null;
	protocolUrl: string | null;
	mailtoUrl: string | null;
};

export function createProtocolHandler(deps: ProtocolHandlerDeps) {
	registerDefaultProtocolPageRoutes();
	const pendingMailtoUrls: string[] = [];

	function handleProtocolPageUrl(url: string): boolean {
		const route = resolveProtocolPageRoute(url);
		if (!route) return false;
		deps.logger.info('Resolved app protocol page route url=%s route=%s', url, route);
		if (!deps.isMainWindowActionsEnabled()) {
			deps.openMainWindowEntryPoint();
			return true;
		}
		deps.navigateMainWindowToRoute(route);
		return true;
	}

	function queueMailtoUrl(url: string): void {
		if (!/^mailto:/i.test(url)) return;
		deps.logger.info('Queueing mailto url=%s', url);
		pendingMailtoUrls.push(url);
		flushPendingMailtoUrls();
	}

	function flushPendingMailtoUrls(): void {
		if (!app.isReady()) return;
		while (pendingMailtoUrls.length > 0) {
			const next = pendingMailtoUrls.shift();
			if (!next) continue;
			deps.openComposeFromMailtoUrl(next);
		}
	}

	function resolveLaunchIntent(argv: string[]): LaunchIntent {
		return {
			action: findActionArg(argv),
			route: findRouteArg(argv),
			protocolUrl: findCustomProtocolArg(argv),
			mailtoUrl: findMailtoArg(argv),
		};
	}

	function handleProtocolUrl(url: string): boolean {
		if (deps.queueMailOAuthCallbackUrl(url)) return true;
		if (deps.queueCloudOAuthCallbackUrl(url)) return true;
		if (handleProtocolPageUrl(url)) return true;
		return deps.handleFallbackProtocolUrl(url);
	}

	function registerEventHandlers(): void {
		app.on('open-url', (event, url) => {
			event.preventDefault();
			deps.logger.info('Received open-url event url=%s', url);
			if (handleProtocolUrl(url)) return;
			queueMailtoUrl(url);
		});

		app.on('second-instance', (_event, argv) => {
			deps.logger.info('Received second-instance event args=%d', argv.length);
			const intent = resolveLaunchIntent(argv);
			if (intent.action === 'compose') {
				if (!deps.isMainWindowActionsEnabled()) {
					deps.openMainWindowEntryPoint();
					return;
				}
				deps.openComposeQuickAction();
				return;
			}
			if (intent.route) {
				if (!deps.isMainWindowActionsEnabled()) {
					deps.openMainWindowEntryPoint();
					return;
				}
				deps.navigateMainWindowToRoute(intent.route);
				return;
			}
			if (intent.protocolUrl && handleProtocolUrl(intent.protocolUrl)) {
				deps.showMainWindow();
				return;
			}
			if (intent.mailtoUrl) {
				queueMailtoUrl(intent.mailtoUrl);
				return;
			}
			deps.showMainWindow();
		});
	}

	function handleInitialLaunchArgs(argv: string[]): LaunchIntent {
		const intent = resolveLaunchIntent(argv);
		if (intent.mailtoUrl) {
			queueMailtoUrl(intent.mailtoUrl);
		}
		if (intent.protocolUrl && handleProtocolUrl(intent.protocolUrl)) {
			deps.showMainWindow();
		}
		return intent;
	}

	function registerProtocolClients(): void {
		registerMailtoProtocolClient(deps.logger);
		registerAppProtocolClient(deps.logger);
	}

	return {
		registerEventHandlers,
		registerProtocolClients,
		handleInitialLaunchArgs,
		resolveLaunchIntent,
		queueMailtoUrl,
		flushPendingMailtoUrls,
	};
}

function registerMailtoProtocolClient(logger: AppLogger): void {
	try {
		logger.info('Registering mailto protocol client');
		if (process.defaultApp) {
			if (process.argv.length >= 2) {
				app.setAsDefaultProtocolClient('mailto', process.execPath, [path.resolve(process.argv[1])]);
			}
			return;
		}
		app.setAsDefaultProtocolClient('mailto');
	} catch (error) {
		logger.warn('Failed to register mailto protocol: %s', (error as any)?.message || String(error));
		console.warn('Failed to register mailto protocol:', error);
	}
}

function registerAppProtocolClient(logger: AppLogger): void {
	try {
		logger.info('Registering %s protocol client', APP_PROTOCOL);
		if (process.defaultApp) {
			if (process.argv.length >= 2) {
				app.setAsDefaultProtocolClient(APP_PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
			}
			return;
		}
		app.setAsDefaultProtocolClient(APP_PROTOCOL);
	} catch (error) {
		logger.warn('Failed to register %s protocol: %s', APP_PROTOCOL, (error as any)?.message || String(error));
		console.warn(`Failed to register ${APP_PROTOCOL} protocol:`, error);
	}
}

function findMailtoArg(argv: string[]): string | null {
	for (const arg of argv) {
		if (/^mailto:/i.test(arg)) return arg;
	}
	return null;
}

function findCustomProtocolArg(argv: string[]): string | null {
	for (const arg of argv) {
		if (new RegExp(`^${APP_PROTOCOL}:\\/\\/`, 'i').test(arg)) return arg;
	}
	return null;
}

function findRouteArg(argv: string[]): string | null {
	for (const arg of argv) {
		if (!arg.startsWith('--route=')) continue;
		const route = arg.slice('--route='.length).trim();
		if (!route.startsWith('/')) continue;
		return route;
	}
	return null;
}

function findActionArg(argv: string[]): 'compose' | null {
	for (const arg of argv) {
		if (arg === '--action=compose') return 'compose';
	}
	return null;
}
