import {Button} from '../ui/button';
import React, {useEffect, useMemo, useState} from 'react';
import {FormInput, type FormInputProps} from '../ui/FormControls';
import {cn} from '../../lib/utils';

export type AutoCompleteRow = {
    id: string;
    label: string;
    value: string;
    description?: string | null;
};

type AutoCompleteProps = {
    value: string;
    onChange: (next: string) => void;
    rows: AutoCompleteRow[];
    onPickRow: (row: AutoCompleteRow) => void;
    onCommitValue?: (value: string) => void;
    onFocus?: () => void;
    onBlur?: () => void;
    placeholder?: string;
    inputClassName?: string;
    className?: string;
    showRowsOnFocus?: boolean;
    onInputKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
    inputProps?: Omit<FormInputProps, 'value' | 'onChange' | 'placeholder' | 'className' | 'onFocus' | 'onBlur' | 'onKeyDown'>;
};

export default function AutoComplete({
    value,
    onChange,
    rows,
    onPickRow,
    onCommitValue,
    onFocus,
    onBlur,
    placeholder,
    inputClassName,
    className,
    showRowsOnFocus = true,
    onInputKeyDown,
    inputProps,
}: AutoCompleteProps) {
    const [open, setOpen] = useState(false);
    const [activeRowIndex, setActiveRowIndex] = useState(0);

    useEffect(() => {
        if (!open) return;
        if (rows.length === 0) {
            setActiveRowIndex(0);
            return;
        }
        setActiveRowIndex((prev) => Math.min(prev, rows.length - 1));
    }, [open, rows.length]);

    const activeRow = useMemo(
        () => (rows.length > 0 ? rows[Math.max(0, Math.min(activeRowIndex, rows.length - 1))] : null),
        [activeRowIndex, rows],
    );

    return (
        <div className={cn('relative w-full', className)}>
            <FormInput
                {...inputProps}
                value={value}
                onFocus={() => {
                    if (showRowsOnFocus) setOpen(true);
                    onFocus?.();
                }}
                onBlur={() => {
                    setTimeout(() => {
                        setOpen(false);
                        onBlur?.();
                    }, 60);
                }}
                onChange={(event) => {
                    onChange(event.target.value);
                    if (!open) setOpen(true);
                }}
                onKeyDown={(event) => {
                    onInputKeyDown?.(event);
                    if (event.defaultPrevented) return;
                    const trimmed = value.trim();
                    if (open && rows.length > 0) {
                        if (event.key === 'ArrowDown') {
                            event.preventDefault();
                            setActiveRowIndex((prev) => (prev + 1) % rows.length);
                            return;
                        }
                        if (event.key === 'ArrowUp') {
                            event.preventDefault();
                            setActiveRowIndex((prev) => (prev - 1 + rows.length) % rows.length);
                            return;
                        }
                        if ((event.key === 'Enter' || event.key === 'Tab') && trimmed.length > 0 && activeRow) {
                            event.preventDefault();
                            onPickRow(activeRow);
                            setOpen(false);
                            return;
                        }
                    }
                    if (onCommitValue && (event.key === 'Enter' || event.key === 'Tab' || event.key === ',')) {
                        event.preventDefault();
                        onCommitValue(trimmed);
                        setOpen(false);
                    }
                }}
                placeholder={placeholder}
                className={inputClassName}
            />
            {open && rows.length > 0 && (
                <div className="absolute left-0 top-[calc(100%+4px)] z-20 max-h-56 w-full overflow-auto rounded-md border border-slate-300 bg-white py-1 shadow-lg dark:border-[#3a3d44] dark:bg-[#1f2125]">
                    {rows.map((row, index) => (
                        <Button
                            key={row.id}
                            type="button"
                            className={cn(
                                'block w-full px-2 py-1.5 text-left transition-colors',
                                index === activeRowIndex
                                    ? 'bg-sky-100 text-slate-900 dark:bg-[#3d4153] dark:text-slate-100'
                                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#35373c]',
                            )}
                            onMouseDown={(event) => {
                                event.preventDefault();
                                onPickRow(row);
                                setOpen(false);
                            }}
                        >
                            <div className="truncate text-sm">{row.label}</div>
                            {row.description ? (
                                <div className="truncate text-xs text-slate-500 dark:text-slate-400">{row.description}</div>
                            ) : null}
                        </Button>
                    ))}
                </div>
            )}
        </div>
    );
}
