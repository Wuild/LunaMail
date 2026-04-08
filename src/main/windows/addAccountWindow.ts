import {app, BrowserWindow} from "electron";
import path from "path";
import {fileURLToPath} from "url";
import {loadWindowContent} from "./loadWindowContent.js";

const isDev = !app.isPackaged;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let addAccountWin: BrowserWindow | null = null;

export function openAddAccountWindow(parentWindow?: BrowserWindow): void {
    if (addAccountWin && !addAccountWin.isDestroyed()) {
        addAccountWin.focus();
        return;
    }

    const preloadPath = path.join(app.getAppPath(), "preload.cjs");

    const parent = parentWindow && !parentWindow.isDestroyed() ? parentWindow : undefined;
    const parentBounds = parent?.getBounds();

    addAccountWin = new BrowserWindow({
        parent,
        modal: true,
        frame: false,
        titleBarStyle: "hidden",
        width: Math.max(960, parentBounds?.width ?? 960),
        height: Math.max(700, parentBounds?.height ?? 700),
        minWidth: 960,
        minHeight: 700,
        maxWidth: 1400,
        maxHeight: 1000,
        minimizable: false,
        maximizable: false,
        autoHideMenuBar: true,
        resizable: true,
        title: "Add Account",
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    addAccountWin.setMaximizable(false);
    addAccountWin.setMenuBarVisibility(false);
    addAccountWin.removeMenu();
    addAccountWin.webContents.on("before-input-event", (event, input) => {
        if (input.type !== "keyDown") return;
        const key = String(input.key || "").toLowerCase();
        if (key === "escape") {
            event.preventDefault();
            if (addAccountWin && !addAccountWin.isDestroyed()) {
                addAccountWin.close();
            }
            return;
        }
        const isF12 = key === "f12";
        const isCtrlShiftI = input.control && input.shift && key === "i";
        const isCmdAltI = input.meta && input.alt && key === "i";
        if (!isF12 && !isCtrlShiftI && !isCmdAltI) return;
        event.preventDefault();
        if (addAccountWin && !addAccountWin.isDestroyed()) {
            addAccountWin.webContents.openDevTools({mode: "detach"});
        }
    });

    addAccountWin.on("closed", () => {
        addAccountWin = null;
    });

    void loadWindowContent(addAccountWin, {
        isDev,
        devUrls: ["http://127.0.0.1:5174/add-account.html", "http://127.0.0.1:5174/src/renderer/add-account.html"],
        prodFiles: [path.join(__dirname, "..", "..", "renderer/add-account.html")],
        windowName: "add-account",
    }).catch((error) => {
        console.error("Failed to load add-account window:", error);
    });
}

export function getAddAccountWindow(): BrowserWindow | null {
    return addAccountWin;
}
