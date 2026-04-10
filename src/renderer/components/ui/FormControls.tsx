import React, {useEffect, useMemo, useRef, useState} from 'react';
import {cn} from '@renderer/lib/utils';
import {
    composeLocalDateTimeValue,
    formatIsoDateForLocale,
    formatLocalDateTimeValueForLocale,
    getLocaleDatePlaceholder,
    parseLocalDateTimeValue,
    parseLocaleDateInput,
    splitLocalDateTimeValue,
} from '@renderer/lib/date/localeInput';
import {Button} from './button';
import {CalendarDays, ChevronLeft, ChevronRight} from 'lucide-react';

type ControlVariant = 'default' | 'subtle';
type ControlSize = 'sm' | 'md' | 'lg';
type GroupPosition = 'none' | 'first' | 'middle' | 'last';

const fieldBase = 'field w-full transition-all disabled:cursor-not-allowed disabled:opacity-60';

const variantStyles: Record<ControlVariant, string> = {
    default:
        '',
    subtle:
        'field-subtle',
};

const sizeStyles: Record<ControlSize, string> = {
    sm: 'h-10 px-3 text-sm',
    md: 'h-11 px-3.5 text-sm',
    lg: 'h-12 px-4 text-base',
};
const optionSizeStyles: Record<ControlSize, string> = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-3 py-2 text-sm',
    lg: 'px-3.5 py-2.5 text-base',
};

const groupStyles: Record<GroupPosition, string> = {
    none: 'rounded-lg',
    first: 'rounded-l-lg rounded-r-none',
    middle: 'rounded-none',
    last: 'rounded-l-none rounded-r-lg',
};

type InputLikeProps = {
    variant?: ControlVariant;
    size?: ControlSize;
    groupPosition?: GroupPosition;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
};

export type FormInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & InputLikeProps;
export type FormDateInputProps = Omit<FormInputProps, 'type'> & {
    locale?: string;
};
export type FormDateTimeInputProps = Omit<FormInputProps, 'type'> & {
    locale?: string;
    minuteStep?: number;
};
export type FormSelectOption = {
    value: string;
    label: string;
    description?: string | null;
    icon?: React.ReactNode;
    disabled?: boolean;
    selected?: boolean;
};

export type FormSelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> &
    InputLikeProps & {
        options?: FormSelectOption[];
        renderSelectedOption?: (option: FormSelectOption | null) => React.ReactNode;
        renderOption?: (option: FormSelectOption, state: {active: boolean; selected: boolean}) => React.ReactNode;
        dropdownClassName?: string;
    };
export type FormTextareaProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'> &
    Omit<InputLikeProps, 'leftIcon' | 'rightIcon'>;

export const FormInput = React.forwardRef<HTMLInputElement, FormInputProps>(
    ({className, variant = 'subtle', size = 'lg', groupPosition = 'none', leftIcon, rightIcon, ...props}, ref) => (
        <div className="relative">
            {leftIcon ? (
                <span className="ui-text-muted pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2">
                    {leftIcon}
                </span>
            ) : null}
            <input
                ref={ref}
                {...props}
                className={cn(
                    fieldBase,
                    variantStyles[variant],
                    sizeStyles[size],
                    groupStyles[groupPosition],
                    groupPosition !== 'none' && 'relative first:-ml-px',
                    leftIcon && 'pl-9',
                    rightIcon && 'pr-9',
                    className,
                )}
            />
            {rightIcon ? (
                <span className="ui-text-muted pointer-events-none absolute right-3 top-1/2 z-10 -translate-y-1/2">
                    {rightIcon}
                </span>
            ) : null}
        </div>
    ),
);
FormInput.displayName = 'FormInput';

function createSyntheticInputChangeEvent(name: string | undefined, value: string): React.ChangeEvent<HTMLInputElement> {
    return {
        target: {value, name: name || ''},
        currentTarget: {value, name: name || ''},
    } as React.ChangeEvent<HTMLInputElement>;
}

export const FormDateInput = React.forwardRef<HTMLInputElement, FormDateInputProps>(
    (
        {
            locale,
            value,
            onChange,
            onBlur,
            onKeyDown,
            placeholder,
            inputMode,
            autoComplete,
            name,
            ...props
        },
        ref,
    ) => {
        const normalizedValue = typeof value === 'string' ? value : '';
        const displayValue = useMemo(
            () => formatIsoDateForLocale(normalizedValue, locale),
            [locale, normalizedValue],
        );
        const [draft, setDraft] = useState(displayValue);

        useEffect(() => {
            setDraft(displayValue);
        }, [displayValue]);

        const emitChange = (nextValue: string) => {
            onChange?.(createSyntheticInputChangeEvent(name, nextValue));
        };

        return (
            <FormInput
                ref={ref}
                {...props}
                name={name}
                type="text"
                value={draft}
                placeholder={placeholder || getLocaleDatePlaceholder(locale)}
                inputMode={inputMode || 'numeric'}
                autoComplete={autoComplete || 'off'}
                onChange={(event) => {
                    const nextDraft = event.target.value;
                    setDraft(nextDraft);
                    const normalizedDraft = nextDraft.trim();
                    if (!normalizedDraft) {
                        if (normalizedValue) emitChange('');
                        return;
                    }
                    const parsed = parseLocaleDateInput(normalizedDraft, locale);
                    if (parsed && parsed !== normalizedValue) {
                        emitChange(parsed);
                    }
                }}
                onBlur={(event) => {
                    const normalizedDraft = event.target.value.trim();
                    if (!normalizedDraft) {
                        setDraft('');
                        if (normalizedValue) emitChange('');
                        onBlur?.(event);
                        return;
                    }
                    const parsed = parseLocaleDateInput(normalizedDraft, locale);
                    if (!parsed) {
                        setDraft(displayValue);
                        onBlur?.(event);
                        return;
                    }
                    if (parsed !== normalizedValue) {
                        emitChange(parsed);
                    }
                    setDraft(formatIsoDateForLocale(parsed, locale));
                    onBlur?.(event);
                }}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                        (event.currentTarget as HTMLInputElement).blur();
                    }
                    onKeyDown?.(event);
                }}
            />
        );
    },
);
FormDateInput.displayName = 'FormDateInput';

function toIsoDate(date: Date): string {
    const year = `${date.getFullYear()}`.padStart(4, '0');
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function addDays(base: Date, days: number): Date {
    const next = new Date(base);
    next.setDate(next.getDate() + days);
    return next;
}

function isSameCalendarDay(a: Date, b: Date): boolean {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

function buildCalendarGrid(visibleMonth: Date): Date[] {
    const monthStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const mondayFirstOffset = (monthStart.getDay() + 6) % 7;
    const gridStart = addDays(monthStart, -mondayFirstOffset);
    return Array.from({length: 42}, (_, index) => addDays(gridStart, index));
}

export const FormDateTimeInput = React.forwardRef<HTMLInputElement, FormDateTimeInputProps>(
    (
        {
            locale,
            value,
            onChange,
            name,
            id,
            required,
            disabled,
            className,
            minuteStep = 30,
            variant = 'subtle',
            size = 'lg',
            ...props
        },
        ref,
    ) => {
        const rawValue = typeof value === 'string' ? value : '';
        const {date, time} = splitLocalDateTimeValue(rawValue);
        const parsedDateTime = useMemo(() => parseLocalDateTimeValue(rawValue), [rawValue]);
        const [open, setOpen] = useState(false);
        const [visibleMonth, setVisibleMonth] = useState<Date>(() => parsedDateTime || new Date());
        const rootRef = useRef<HTMLDivElement | null>(null);
        const triggerRef = useRef<HTMLInputElement | null>(null);
        const displayValue = formatLocalDateTimeValueForLocale(rawValue, locale);

        useEffect(() => {
            if (!open || !parsedDateTime) return;
            setVisibleMonth(parsedDateTime);
        }, [open, parsedDateTime]);

        useEffect(() => {
            if (!open) return;
            const handlePointerDown = (event: MouseEvent) => {
                const node = rootRef.current;
                if (!node) return;
                if (!node.contains(event.target as Node)) {
                    setOpen(false);
                }
            };
            const handleEscape = (event: KeyboardEvent) => {
                if (event.key !== 'Escape') return;
                setOpen(false);
                triggerRef.current?.focus();
            };
            document.addEventListener('mousedown', handlePointerDown);
            document.addEventListener('keydown', handleEscape);
            return () => {
                document.removeEventListener('mousedown', handlePointerDown);
                document.removeEventListener('keydown', handleEscape);
            };
        }, [open]);

        const emitChange = (nextDate: string, nextTime: string) => {
            const nextValue = composeLocalDateTimeValue(nextDate, nextTime);
            onChange?.(createSyntheticInputChangeEvent(name, nextValue));
        };

        const monthTitle = useMemo(
            () =>
                new Intl.DateTimeFormat(locale || undefined, {
                    month: 'long',
                    year: 'numeric',
                }).format(visibleMonth),
            [locale, visibleMonth],
        );

        const weekdayLabels = useMemo(() => {
            const formatter = new Intl.DateTimeFormat(locale || undefined, {weekday: 'short'});
            const monday = new Date(2026, 0, 5);
            return Array.from({length: 7}, (_, index) => formatter.format(addDays(monday, index)));
        }, [locale]);

        const calendarCells = useMemo(() => buildCalendarGrid(visibleMonth), [visibleMonth]);

        const timeOptions = useMemo(() => {
            const safeStep = Number.isFinite(minuteStep) && minuteStep > 0 ? Math.min(60, Math.max(5, minuteStep)) : 30;
            const formatter = new Intl.DateTimeFormat(locale || undefined, {
                hour: 'numeric',
                minute: '2-digit',
            });
            const output: Array<{ value: string; label: string }> = [];
            for (let hour = 0; hour < 24; hour += 1) {
                for (let minute = 0; minute < 60; minute += safeStep) {
                    const hh = `${hour}`.padStart(2, '0');
                    const mm = `${minute}`.padStart(2, '0');
                    const stamp = new Date(2026, 0, 1, hour, minute, 0, 0);
                    output.push({
                        value: `${hh}:${mm}`,
                        label: formatter.format(stamp),
                    });
                }
            }
            return output;
        }, [locale, minuteStep]);

        const selectedDate = date ? new Date(`${date}T00:00:00`) : null;
        const today = new Date();
        const visibleMonthIndex = visibleMonth.getMonth();

        return (
            <div ref={rootRef} className={cn('relative', className)}>
                <FormInput
                    {...props}
                    ref={(node) => {
                        triggerRef.current = node;
                        if (typeof ref === 'function') {
                            ref(node);
                        } else if (ref) {
                            ref.current = node;
                        }
                    }}
                    id={id}
                    name={name}
                    required={required}
                    disabled={disabled}
                    variant={variant}
                    size={size}
                    value={displayValue}
                    readOnly
                    placeholder={`${getLocaleDatePlaceholder(locale)} 00:00`}
                    rightIcon={<CalendarDays size={15}/>}
                    onClick={() => {
                        if (!disabled) setOpen((prev) => !prev);
                    }}
                    onKeyDown={(event) => {
                        if (disabled) return;
                        if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
                            event.preventDefault();
                            setOpen(true);
                        }
                    }}
                />
                {open ? (
                    <div
                        className="menu date-time-picker-popover absolute left-0 top-[calc(100%+0.35rem)] z-[1100] w-[22rem] rounded-lg border p-3 shadow-lg">
                        <div className="date-time-picker-calendar">
                            <div className="date-time-picker-header mb-2 flex items-center justify-between">
                                <span className="date-time-picker-month text-base font-semibold">{monthTitle}</span>
                                <div className="flex items-center gap-1">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="date-time-picker-nav-button h-8 w-8 rounded-md"
                                        onClick={() =>
                                            setVisibleMonth(
                                                new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1),
                                            )
                                        }
                                        aria-label="Previous month"
                                    >
                                        <ChevronLeft size={14}/>
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="date-time-picker-nav-button h-8 w-8 rounded-md"
                                        onClick={() =>
                                            setVisibleMonth(
                                                new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1),
                                            )
                                        }
                                        aria-label="Next month"
                                    >
                                        <ChevronRight size={14}/>
                                    </Button>
                                </div>
                            </div>
                            <div className="date-time-picker-weekdays mb-1 grid grid-cols-7 gap-1">
                                {weekdayLabels.map((weekday) => (
                                    <span key={weekday}
                                          className="date-time-picker-weekday text-center text-[11px] font-medium">
                                        {weekday}
                                    </span>
                                ))}
                            </div>
                            <div className="date-time-picker-days grid grid-cols-7 gap-1">
                                {calendarCells.map((cellDate) => {
                                    const isOutsideMonth = cellDate.getMonth() !== visibleMonthIndex;
                                    const isToday = isSameCalendarDay(cellDate, today);
                                    const isSelected = selectedDate ? isSameCalendarDay(cellDate, selectedDate) : false;
                                    return (
                                        <Button
                                            key={toIsoDate(cellDate)}
                                            type="button"
                                            variant="ghost"
                                            size="none"
                                            className={cn(
                                                'date-time-picker-day h-8 rounded-md px-0 text-sm',
                                                isOutsideMonth && 'date-time-picker-day-outside',
                                                isToday && !isSelected && 'date-time-picker-day-today',
                                                isSelected && 'date-time-picker-day-selected',
                                            )}
                                            onClick={() => emitChange(toIsoDate(cellDate), time || '09:00')}
                                        >
                                            {cellDate.getDate()}
                                        </Button>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="date-time-picker-footer mt-2 flex items-center gap-2 border-t pt-2">
                            <FormSelect
                                value={time || ''}
                                size="sm"
                                className="flex-1"
                                options={[
                                    {value: '', label: 'Select time'},
                                    ...timeOptions,
                                ]}
                                onChange={(event) => {
                                    const nextTime = event.target.value;
                                    if (!nextTime) return;
                                    const baseDate = date || (() => {
                                        const today = new Date();
                                        const yyyy = `${today.getFullYear()}`.padStart(4, '0');
                                        const mm = `${today.getMonth() + 1}`.padStart(2, '0');
                                        const dd = `${today.getDate()}`.padStart(2, '0');
                                        return `${yyyy}-${mm}-${dd}`;
                                    })();
                                    emitChange(baseDate, nextTime);
                                }}
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    const now = new Date();
                                    const yyyy = `${now.getFullYear()}`.padStart(4, '0');
                                    const mm = `${now.getMonth() + 1}`.padStart(2, '0');
                                    const dd = `${now.getDate()}`.padStart(2, '0');
                                    const hh = `${now.getHours()}`.padStart(2, '0');
                                    const min = `${now.getMinutes()}`.padStart(2, '0');
                                    emitChange(`${yyyy}-${mm}-${dd}`, `${hh}:${min}`);
                                }}
                            >
                                Now
                            </Button>
                            <Button type="button" variant="default" size="sm" onClick={() => setOpen(false)}>
                                Done
                            </Button>
                        </div>
                    </div>
                ) : null}
            </div>
        );
    },
);
FormDateTimeInput.displayName = 'FormDateTimeInput';

export const FormSelect = React.forwardRef<HTMLSelectElement, FormSelectProps>(
    (
        {
            className,
            variant = 'subtle',
            size = 'lg',
            groupPosition = 'none',
            leftIcon,
            rightIcon,
            children,
            value,
            defaultValue,
            onChange,
            onFocus,
            onBlur,
            onKeyDown,
            disabled,
            name,
            id,
            required,
            tabIndex,
            options,
            renderSelectedOption,
            renderOption,
            dropdownClassName,
            ...props
        },
        ref,
    ) => {
        const optionItems = useMemo(
            () =>
                options
                    ? options.map((item) => ({
                          value: item.value,
                          label: item.label,
                          disabled: Boolean(item.disabled),
                          selected: Boolean(item.selected),
                          description: item.description ?? null,
                          icon: item.icon,
                      }))
                    : flattenSelectOptions(children),
            [children, options],
        );
        const isControlled = value !== undefined;
        const [internalValue, setInternalValue] = useState<string>(() => {
            if (defaultValue != null) return String(defaultValue);
            const explicitSelected = optionItems.find((item) => item.selected);
            if (explicitSelected) return explicitSelected.value;
            return optionItems[0]?.value ?? '';
        });
        const selectedValue = isControlled ? String(value ?? '') : internalValue;
        const selectedIndex = useMemo(
            () => optionItems.findIndex((item) => item.value === selectedValue),
            [optionItems, selectedValue],
        );
        const [open, setOpen] = useState(false);
        const [activeIndex, setActiveIndex] = useState<number>(() =>
            selectedIndex >= 0 ? selectedIndex : findNextEnabledOptionIndex(optionItems, -1, 1),
        );
        const rootRef = useRef<HTMLDivElement | null>(null);
        const triggerRef = useRef<HTMLButtonElement | null>(null);
        const hiddenSelectRef = useRef<HTMLSelectElement | null>(null);

        useEffect(() => {
            if (isControlled) return;
            if (!optionItems.some((item) => item.value === internalValue)) {
                setInternalValue(optionItems[0]?.value ?? '');
            }
        }, [internalValue, isControlled, optionItems]);

        useEffect(() => {
            if (!open) return;
            const fallbackIndex = findNextEnabledOptionIndex(optionItems, -1, 1);
            setActiveIndex(selectedIndex >= 0 ? selectedIndex : fallbackIndex);
        }, [open, optionItems, selectedIndex]);

        useEffect(() => {
            const handlePointerDown = (event: MouseEvent) => {
                const node = rootRef.current;
                if (!node) return;
                if (!node.contains(event.target as Node)) {
                    setOpen(false);
                }
            };
            document.addEventListener('mousedown', handlePointerDown);
            return () => document.removeEventListener('mousedown', handlePointerDown);
        }, []);

        const selectedOption = optionItems[selectedIndex >= 0 ? selectedIndex : 0] ?? null;
        const displayLabel = selectedOption?.label ?? '';

        const emitChange = (nextValue: string) => {
            if (!isControlled) {
                setInternalValue(nextValue);
            }
            if (hiddenSelectRef.current) {
                hiddenSelectRef.current.value = nextValue;
            }
            if (onChange) {
                const syntheticEvent = {
                    target: {value: nextValue, name: name ?? ''},
                    currentTarget: {value: nextValue, name: name ?? ''},
                } as React.ChangeEvent<HTMLSelectElement>;
                onChange(syntheticEvent);
            }
        };

        const selectByIndex = (index: number) => {
            const target = optionItems[index];
            if (!target || target.disabled) return;
            emitChange(target.value);
        };

        return (
            <div ref={rootRef} className="relative">
                <select
                    ref={(node) => {
                        hiddenSelectRef.current = node;
                        if (typeof ref === 'function') {
                            ref(node);
                        } else if (ref) {
                            ref.current = node;
                        }
                    }}
                    name={name}
                    id={id}
                    required={required}
                    value={selectedValue}
                    onChange={(event) => emitChange(event.target.value)}
                    onFocus={(event) => {
                        onFocus?.(event);
                        if (disabled) return;
                        setOpen(true);
                        requestAnimationFrame(() => {
                            triggerRef.current?.focus();
                        });
                    }}
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden
                >
                    {options
                        ? options.map((item) => (
                              <option key={item.value} value={item.value} disabled={item.disabled}>
                                  {item.label}
                              </option>
                          ))
                        : children}
                </select>
                {leftIcon ? (
                    <span className="ui-text-muted pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2">
                        {leftIcon}
                    </span>
                ) : null}
                <button
                    ref={triggerRef}
                    type="button"
                    name={name}
                    id={id ? `${id}__trigger` : undefined}
                    disabled={disabled}
                    tabIndex={tabIndex}
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    className={cn(
                        fieldBase,
                        'flex items-center justify-between text-left',
                        variantStyles[variant],
                        sizeStyles[size],
                        groupStyles[groupPosition],
                        groupPosition !== 'none' && 'relative first:-ml-px',
                        leftIcon && 'pl-9',
                        'pr-9',
                        className,
                    )}
                    onFocus={(event) => {
                        onFocus?.(event as unknown as React.FocusEvent<HTMLSelectElement>);
                    }}
                    onBlur={(event) => {
                        onBlur?.(event as unknown as React.FocusEvent<HTMLSelectElement>);
                    }}
                    onClick={() => {
                        if (disabled) return;
                        setOpen((prev) => !prev);
                    }}
                    onKeyDown={(event) => {
                        onKeyDown?.(event as unknown as React.KeyboardEvent<HTMLSelectElement>);
                        if (event.defaultPrevented || disabled) return;
                        const key = event.key;
                        if (key === 'ArrowDown' || key === 'ArrowUp') {
                            event.preventDefault();
                            const direction = key === 'ArrowDown' ? 1 : -1;
                            if (!open) {
                                setOpen(true);
                                setActiveIndex((prev) =>
                                    findNextEnabledOptionIndex(optionItems, prev < 0 ? selectedIndex : prev, direction),
                                );
                                return;
                            }
                            setActiveIndex((prev) => findNextEnabledOptionIndex(optionItems, prev, direction));
                            return;
                        }
                        if (key === 'Enter' || key === ' ') {
                            event.preventDefault();
                            if (!open) {
                                setOpen(true);
                                return;
                            }
                            if (activeIndex >= 0) {
                                selectByIndex(activeIndex);
                            }
                            setOpen(false);
                            return;
                        }
                        if (key === 'Escape') {
                            if (!open) return;
                            event.preventDefault();
                            setOpen(false);
                            return;
                        }
                        if (key === 'Tab' && open) {
                            if (activeIndex >= 0) {
                                selectByIndex(activeIndex);
                            }
                            setOpen(false);
                        }
                    }}
                >
                    <span className="block min-w-0 truncate">
                        {renderSelectedOption ? (
                            renderSelectedOption(selectedOption)
                        ) : (
                            <span className="truncate">{displayLabel}</span>
                        )}
                    </span>
                    <span className="ui-text-muted pointer-events-none absolute right-3 top-1/2 z-10 -translate-y-1/2">
                        {rightIcon ?? <span aria-hidden>{open ? '▴' : '▾'}</span>}
                    </span>
                </button>
                {open ? (
                    <div
                        role="listbox"
                        className={cn(
                            'field absolute z-40 mt-1 max-h-64 w-full overflow-auto rounded-lg border p-1 shadow-lg',
                            variantStyles[variant],
                            dropdownClassName,
                        )}
                    >
                        {optionItems.map((item, index) => {
                            const isActive = index === activeIndex;
                            const isSelected = item.value === selectedValue;
                            return (
                                <button
                                    key={`${item.value}:${index}`}
                                    type="button"
                                    role="option"
                                    aria-selected={isSelected}
                                    disabled={item.disabled}
                                    className={cn(
                                        'block w-full rounded-md text-left transition-colors',
                                        optionSizeStyles[size],
                                        item.disabled
                                            ? 'cursor-not-allowed ui-text-muted opacity-60'
                                            : isActive
                                                ? 'ui-surface-active ui-text-primary'
                                                : 'ui-surface-hover ui-text-primary',
                                        isSelected && !item.disabled && 'font-semibold',
                                    )}
                                    onMouseEnter={() => {
                                        if (!item.disabled) setActiveIndex(index);
                                    }}
                                    onMouseDown={(event) => {
                                        event.preventDefault();
                                        if (item.disabled) return;
                                        selectByIndex(index);
                                        setOpen(false);
                                        triggerRef.current?.focus();
                                    }}
                                >
                                    {renderOption ? (
                                        renderOption(item, {active: isActive, selected: isSelected})
                                    ) : (
                                        <div className="flex min-w-0 items-center gap-2">
                                            {item.icon ? <span className="shrink-0">{item.icon}</span> : null}
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate">{item.label}</span>
                                                {item.description ? (
                                                    <span className="ui-text-muted block truncate text-[11px]">
                                                        {item.description}
                                                    </span>
                                                ) : null}
                                            </span>
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                ) : null}
            </div>
        );
    },
);
FormSelect.displayName = 'FormSelect';

type SelectOptionItem = {
    value: string;
    label: string;
    disabled: boolean;
    selected: boolean;
    description?: string | null;
    icon?: React.ReactNode;
};

function flattenSelectOptions(children: React.ReactNode): SelectOptionItem[] {
    const out: SelectOptionItem[] = [];
    const walk = (nodes: React.ReactNode) => {
        React.Children.forEach(nodes, (child) => {
            if (!React.isValidElement(child)) return;
            const element = child as React.ReactElement<any>;
            if (element.type === 'option') {
                const value = element.props.value != null ? String(element.props.value) : getNodeText(element.props.children);
                out.push({
                    value,
                    label: getNodeText(element.props.children),
                    disabled: Boolean(element.props.disabled),
                    selected: Boolean(element.props.selected),
                });
                return;
            }
            if (element.type === 'optgroup') {
                walk(element.props.children);
            }
        });
    };
    walk(children);
    return out;
}

function getNodeText(node: React.ReactNode): string {
    if (node == null) return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map((entry) => getNodeText(entry)).join('');
    if (React.isValidElement(node)) {
        const element = node as React.ReactElement<any>;
        return getNodeText(element.props.children);
    }
    return '';
}

function findNextEnabledOptionIndex(options: SelectOptionItem[], startIndex: number, direction: 1 | -1): number {
    if (options.length === 0) return -1;
    for (let step = 1; step <= options.length; step += 1) {
        const index = (startIndex + direction * step + options.length) % options.length;
        if (!options[index]?.disabled) return index;
    }
    return -1;
}

export const FormTextarea = React.forwardRef<HTMLTextAreaElement, FormTextareaProps>(
    ({className, variant = 'subtle', size = 'lg', groupPosition = 'none', ...props}, ref) => (
        <textarea
            ref={ref}
            {...props}
            className={cn(
                fieldBase,
                variantStyles[variant],
                size === 'sm' ? 'min-h-[96px] py-2.5 text-sm px-3' : size === 'lg' ? 'min-h-[136px] py-3.5 text-base px-4' : 'min-h-[116px] py-3 text-sm px-3.5',
                groupStyles[groupPosition],
                groupPosition !== 'none' && 'relative first:-ml-px',
                className,
            )}
        />
    ),
);
FormTextarea.displayName = 'FormTextarea';

export const FormCheckbox = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & {size?: 'sm' | 'md'}>(
    ({className, size = 'md', ...props}, ref) => (
        <input
            ref={ref}
            type="checkbox"
            {...props}
            className={cn(
                size === 'sm'
                    ? 'h-5 w-9 before:left-[2px] before:h-4 before:w-4 checked:before:translate-x-4'
                    : 'h-6 w-11 before:left-[2px] before:h-[18px] before:w-[18px] checked:before:translate-x-[22px]',
                'relative  flex-shrink-0 appearance-none rounded-full border outline-none transition-all duration-200',
                'field-toggle',
                'before:absolute before:top-1/2 before:-translate-y-1/2 before:rounded-full before:shadow before:transition-all before:duration-200 before:content-[\'\']',
                'focus-ring',
                'disabled:cursor-not-allowed disabled:opacity-50',
                className,
            )}
        />
    ),
);
FormCheckbox.displayName = 'FormCheckbox';

export function FormControlGroup({
    className,
    children,
}: {
    className?: string;
    children: React.ReactNode;
}) {
    return <div className={cn('inline-flex items-stretch', className)}>{children}</div>;
}
