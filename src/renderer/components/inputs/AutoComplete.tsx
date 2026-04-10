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
                variant={inputProps?.variant ?? 'subtle'}
                size={inputProps?.size ?? 'lg'}
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
                <div className="autocomplete-menu">
                    {rows.map((row, index) => (
                        <Button
                            key={row.id}
                            type="button"
                            className={cn(
                                'autocomplete-option block justify-start text-left',
                                index === activeRowIndex && 'is-active',
                            )}
                            onMouseDown={(event) => {
                                event.preventDefault();
                                onPickRow(row);
                                setOpen(false);
                            }}
                        >
                            <div className="truncate text-sm">{row.label}</div>
                            {row.description ? (
                                <div className="autocomplete-option-description">{row.description}</div>
                            ) : null}
                        </Button>
                    ))}
                </div>
            )}
        </div>
    );
}
