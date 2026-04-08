import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
    root: path.resolve(__dirname, "src/renderer"),
    plugins: [react()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src/renderer"),
        },
    },
    base: "./",
    build: {
        outDir: path.resolve(__dirname, "build/renderer"),
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: path.resolve(__dirname, "src/renderer/index.html"),
                addAccount: path.resolve(__dirname, "src/renderer/add-account.html"),
                compose: path.resolve(__dirname, "src/renderer/compose.html"),
                message: path.resolve(__dirname, "src/renderer/message.html"),
                splash: path.resolve(__dirname, "src/renderer/splash.html"),
            },
        },
    },
    server: {
        host: "127.0.0.1",
        port: 5174,
        strictPort: true,
    },
});
