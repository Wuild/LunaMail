import React from "react";

export default function ToolboxButton({
                                          label,
                                          icon,
                                          onClick,
                                          primary = false,
                                          danger = false,
                                      }: {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    primary?: boolean;
    danger?: boolean;
}) {
    const className = primary
        ? "bg-sky-600 text-white hover:bg-sky-700 dark:bg-[#5865f2] dark:hover:bg-[#4f5bd5]"
        : danger
            ? "text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-900/30"
            : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#3a3d44]";

    return (
        <button
            type="button"
            onClick={onClick}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors ${className}`}
        >
            {icon}
            <span>{label}</span>
        </button>
    );
}
