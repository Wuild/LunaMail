import React, {useEffect, useState} from "react";
import type {AutoUpdateState} from "../../preload";
import lunaLogo from "../../resources/luna.png";
import {useAppTheme} from "../hooks/useAppTheme";

const defaultState: AutoUpdateState = {
    enabled: false,
    phase: "disabled",
    currentVersion: "unknown",
    latestVersion: null,
    downloadedVersion: null,
    percent: null,
    transferred: null,
    total: null,
    message: "Preparing startup...",
};

export default function SplashScreenPage() {
    useAppTheme("system");
    const [state, setState] = useState<AutoUpdateState>(defaultState);

    useEffect(() => {
        window.electronAPI
            .getAutoUpdateState?.()
            .then((next) => setState(next))
            .catch(() => undefined);
        const off = window.electronAPI.onAutoUpdateStatus?.((next) => {
            setState(next);
        });
        return () => {
            if (typeof off === "function") off();
        };
    }, []);

    const progressText = getProgressText(state);
    const isDownloading = state.phase === "downloading";

    return (
        <div
            className="h-screen w-screen overflow-hidden bg-slate-100 text-slate-900 dark:bg-[#0b0c10] dark:text-slate-100">
            <div className="relative flex h-full items-center justify-center overflow-hidden p-8">
                <div
                    className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(15,23,42,0.08),transparent_42%),radial-gradient(circle_at_75%_78%,rgba(71,85,105,0.1),transparent_48%)] dark:bg-[radial-gradient(circle_at_20%_18%,rgba(148,163,184,0.18),transparent_42%),radial-gradient(circle_at_75%_78%,rgba(71,85,105,0.16),transparent_48%)]"/>
                <div
                    className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.34),transparent_34%,rgba(15,23,42,0.06))] dark:bg-[linear-gradient(180deg,rgba(2,6,23,0.2),transparent_34%,rgba(2,6,23,0.35))]"/>
                <div className="mx-auto flex w-full max-w-[360px] flex-col items-center">
                    <img src={lunaLogo} alt="" className="h-24 w-24 object-contain opacity-95" draggable={false}/>
                    <p className="mt-5 text-center text-[22px] font-semibold tracking-wide text-slate-900 dark:text-white/90">
                        LunaMail
                    </p>
                    <p className="mt-2 text-center text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {progressText}
                    </p>
                    {isDownloading && (
                        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-[#171a20]">
                            <div
                                className="h-full rounded-full bg-gradient-to-r from-sky-400 via-blue-400 to-sky-400 bg-[length:200%_100%] transition-all duration-300 animate-pulse"
                                style={{width: `${resolveProgress(state)}%`}}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function getProgressText(state: AutoUpdateState): string {
    if (state.phase === "downloading") {
        return `Downloading update ${Math.round(state.percent ?? 0)}%`;
    }
    if (state.phase === "checking") return "Checking for updates";
    if (state.phase === "available") return "Update found";
    if (state.phase === "downloaded") return "Download complete";
    if (state.phase === "not-available") return "You are up to date";
    if (state.phase === "disabled") return "Updater disabled";
    if (state.phase === "error") return "Update failed, continuing startup";
    return state.message || "Preparing application";
}

function resolveProgress(state: AutoUpdateState): number {
    if (state.phase === "downloading") return Math.max(8, Math.min(99, Math.round(state.percent ?? 0)));
    if (state.phase === "checking") return 30;
    if (state.phase === "available") return 45;
    if (state.phase === "downloaded") return 100;
    if (state.phase === "not-available") return 100;
    if (state.phase === "disabled") return 100;
    if (state.phase === "error") return 100;
    return 20;
}
