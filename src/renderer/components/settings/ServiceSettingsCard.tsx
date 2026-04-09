import React from "react";
import {FormInput, FormSelect} from "../ui/FormControls";

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
    neutral: "lm-card",
    muted: "border-slate-200 bg-slate-50 dark:border-[var(--lm-border-default-dark)] dark:bg-[var(--lm-surface-sidebar-dark)]",
    sky: "border-sky-200 bg-sky-50/40 dark:border-[var(--lm-border-info-dark)] dark:bg-[var(--lm-surface-info-dark)]",
    cyan: "border-cyan-200 bg-cyan-50/40 dark:border-[var(--lm-border-cyan-dark)] dark:bg-[var(--lm-surface-cyan-dark)]",
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
                    <FormInput
                        type="text"
                        value={host}
                        onChange={(event) => onHostChange(event.target.value)}
                    />
                </label>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="block text-sm">
                        <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Port</span>
                        <FormInput
                            type="number"
                            value={String(port || 0)}
                            onChange={(event) => onPortChange(Number(event.target.value || 0))}
                        />
                    </label>
                    <label className="block text-sm">
                        <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Security</span>
                        <FormSelect
                            value={security}
                            onChange={(event) => onSecurityChange(event.target.value as ServiceSecurityMode)}
                        >
                            <option value="ssl">SSL/TLS</option>
                            <option value="starttls">STARTTLS</option>
                            {allowNone && <option value="none">None</option>}
                        </FormSelect>
                    </label>
                </div>
            </div>
        </div>
    );
}
