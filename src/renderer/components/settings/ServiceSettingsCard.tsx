import React from "react";

export type ServiceSecurityMode = "ssl" | "starttls" | "none";

type ServiceSettingsCardProps = {
    title: string;
    host: string;
    port: number;
    security: ServiceSecurityMode;
    onHostChange: (value: string) => void;
    onPortChange: (value: number) => void;
    onSecurityChange: (value: ServiceSecurityMode) => void;
    allowNone?: boolean;
    tone?: "neutral" | "muted" | "sky" | "cyan";
};

const toneClasses: Record<NonNullable<ServiceSettingsCardProps["tone"]>, string> = {
    neutral: "border-slate-200 bg-white dark:border-[#3a3d44] dark:bg-[#1e1f22]",
    muted: "border-slate-200 bg-slate-50 dark:border-[#3a3d44] dark:bg-[#2b2d31]",
    sky: "border-sky-200 bg-sky-50/40 dark:border-[#30455a] dark:bg-[#243240]",
    cyan: "border-cyan-200 bg-cyan-50/40 dark:border-[#2a4e57] dark:bg-[#24373d]",
};

export default function ServiceSettingsCard({
                                                title,
                                                host,
                                                port,
                                                security,
                                                onHostChange,
                                                onPortChange,
                                                onSecurityChange,
                                                allowNone = false,
                                                tone = "neutral",
                                            }: ServiceSettingsCardProps) {
    return (
        <div className={`rounded-lg border p-4 ${toneClasses[tone]}`}>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
            <div className="mt-3 grid grid-cols-1 gap-3">
                <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Host</span>
                    <input
                        type="text"
                        value={host}
                        onChange={(event) => onHostChange(event.target.value)}
                        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                    />
                </label>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="block text-sm">
                        <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Port</span>
                        <input
                            type="number"
                            value={String(port || 0)}
                            onChange={(event) => onPortChange(Number(event.target.value || 0))}
                            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                        />
                    </label>
                    <label className="block text-sm">
                        <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Security</span>
                        <select
                            value={security}
                            onChange={(event) => onSecurityChange(event.target.value as ServiceSecurityMode)}
                            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                        >
                            <option value="ssl">SSL/TLS</option>
                            <option value="starttls">STARTTLS</option>
                            {allowNone && <option value="none">None</option>}
                        </select>
                    </label>
                </div>
            </div>
        </div>
    );
}
