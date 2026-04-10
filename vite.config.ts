import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    root: path.resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            '@renderer': path.resolve(__dirname, './src/renderer'),
            '@main': path.resolve(__dirname, './src/main'),
            '@resource': path.resolve(__dirname, './src/resources'),
        },
    },
    base: './',
    build: {
        outDir: path.resolve(__dirname, 'build/renderer'),
        emptyOutDir: true,
        rollupOptions: {
            input: {
                window: path.resolve(__dirname, 'src/renderer/window.html'),
            },
        },
    },
    server: {
        host: '127.0.0.1',
        port: 5174,
        strictPort: true,
    },
});
