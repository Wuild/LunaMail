import {defineConfig} from 'electron-vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const alias = {
	'@renderer': path.resolve(__dirname, './src/renderer'),
	'@main': path.resolve(__dirname, './src/main'),
	'@resource': path.resolve(__dirname, './src/resources'),
	'@preload': path.resolve(__dirname, './src/preload'),

	'@llamamail/app': path.resolve(__dirname, 'src/packages/app/src'),
	'@llamamail/ui': path.resolve(__dirname, 'src/packages/ui/src'),
	'@llamamail/plugin-sdk': path.resolve(__dirname, 'src/packages/plugin-sdk/src'),
	'@llamamail/providers': path.resolve(__dirname, 'src/packages/providers/src'),
};

function buildWorkspaces() {
	return {
		name: 'build-workspaces',
		apply: 'build' as const,
		async buildStart() {
			const {execSync} = await import('node:child_process');
			execSync('npm run build:packages', {stdio: 'inherit'});
		},
	};
}

export default defineConfig({
	main: {
		resolve: {
			alias,
		},
		plugins: [
			buildWorkspaces(),
		],
		build: {
			outDir: 'build/main',
			sourcemap: true,
			bytecode: true,
			rollupOptions: {
				input: {
					index: 'src/main/index.ts',
					mailSyncWorker: 'src/main/workers/mailSyncWorker.ts',
					ancillarySyncWorker: 'src/main/workers/ancillarySyncWorker.ts',
				},
				external: ['electron', 'better-sqlite3', 'keytar'],
				output: {
					entryFileNames: '[name].js',
					chunkFileNames: 'chunks/[name].js',
				},
			},
		},
	},

	preload: {
		resolve: {
			alias,
		},
		build: {
			outDir: 'build/preload',
			sourcemap: true,
			bytecode: true,
			rollupOptions: {
				external: ['electron'],
				output: {
					entryFileNames: '[name].js',
					chunkFileNames: 'chunks/[name]-[hash].js',
				},
			},
		},
	},

	renderer: {
		root: path.resolve(__dirname, 'src/renderer'),
		plugins: [react()],
		resolve: {
			alias,
		},
		base: './',
		server: {
			host: '127.0.0.1',
			port: 5174,
			strictPort: true,
		},
		build: {
			outDir: path.resolve(__dirname, 'build/renderer'),
			emptyOutDir: true,
			sourcemap: true,
			rollupOptions: {
				input: {
					window: path.resolve(__dirname, 'src/renderer/window.html'),
				},
			},
		},
	},
});
