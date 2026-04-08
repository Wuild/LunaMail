import type {OpenDialogOptions} from "electron";
import {BrowserWindow, dialog, ipcMain} from "electron";
import path from "node:path";
import {clearDebugLogs, createAppLogger, getDebugLogs} from "../debug/debugLog.js";
import {type ComposeDraftPayload, getComposeDraft, openComposeWindow} from "../windows/composeWindow.js";
import {getMessageWindowTargetId, openMessageWindow} from "../windows/messageWindow.js";
import {openAddAccountWindow} from "../windows/addAccountWindow.js";

const logger = createAppLogger("ipc:windows");

export function registerWindowIpc(): void {
    ipcMain.handle("open-add-account-window", async (event) => {
        logger.info("IPC open-add-account-window");
        const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
        openAddAccountWindow(parentWindow);
        return {ok: true} as const;
    });

    ipcMain.handle("open-compose-window", async (event, draft?: ComposeDraftPayload | null) => {
        logger.info("IPC open-compose-window hasDraft=%s", Boolean(draft));
        const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
        openComposeWindow(parentWindow, draft ?? null);
        return {ok: true} as const;
    });

    ipcMain.handle("get-compose-draft", async () => {
        logger.debug("IPC get-compose-draft");
        return getComposeDraft();
    });

    ipcMain.handle("get-debug-logs", async (_event, limit?: number) => {
        logger.debug("IPC get-debug-logs limit=%s", limit ?? "");
        return getDebugLogs(limit);
    });

    ipcMain.handle("clear-debug-logs", async () => {
        logger.warn("IPC clear-debug-logs");
        clearDebugLogs();
        return {ok: true} as const;
    });

    ipcMain.handle("open-message-window", async (event, messageId?: number | null) => {
        logger.info("IPC open-message-window messageId=%s", messageId ?? "");
        const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
        openMessageWindow(parentWindow, messageId ?? null);
        return {ok: true} as const;
    });

    ipcMain.handle("get-message-window-target", async () => {
        logger.debug("IPC get-message-window-target");
        return getMessageWindowTargetId();
    });

    ipcMain.handle("pick-compose-attachments", async (event) => {
        logger.info("IPC pick-compose-attachments");
        const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
        const dialogOptions: OpenDialogOptions = {
            title: "Select attachments",
            properties: ["openFile", "multiSelections"],
        };
        const result = parentWindow
            ? await dialog.showOpenDialog(parentWindow, dialogOptions)
            : await dialog.showOpenDialog(dialogOptions);
        if (result.canceled || !result.filePaths.length) return [];

        return result.filePaths.map((filePath) => ({
            path: filePath,
            filename: path.basename(filePath),
            contentType: null,
        }));
    });

    ipcMain.handle("window-minimize", async (event) => {
        logger.debug("IPC window-minimize");
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win && !win.isDestroyed()) {
            win.minimize();
        }
        return {ok: true} as const;
    });

    ipcMain.handle("window-toggle-maximize", async (event) => {
        logger.debug("IPC window-toggle-maximize");
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win && !win.isDestroyed()) {
            if (win.isMaximized()) win.unmaximize();
            else win.maximize();
            return {ok: true as const, isMaximized: win.isMaximized()};
        }
        return {ok: true as const, isMaximized: false};
    });

    ipcMain.handle("window-close", async (event) => {
        logger.debug("IPC window-close");
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win && !win.isDestroyed()) {
            win.close();
        }
        return {ok: true} as const;
    });

    ipcMain.handle("window-is-maximized", async (event) => {
        logger.debug("IPC window-is-maximized");
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win || win.isDestroyed()) return false;
        return win.isMaximized();
    });

    ipcMain.handle("window-open-dev-tools", async (event) => {
        logger.info("IPC window-open-dev-tools");
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win && !win.isDestroyed()) {
            win.webContents.openDevTools({mode: "detach"});
        }
        return {ok: true} as const;
    });
}
