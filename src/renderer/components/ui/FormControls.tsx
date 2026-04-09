import React, {useEffect, useMemo, useRef, useState} from 'react';
import {cn} from '../../lib/utils';

type ControlVariant = 'default' | 'subtle';
type ControlSize = 'sm' | 'md' | 'lg';
type GroupPosition = 'none' | 'first' | 'middle' | 'last';

const fieldBase = 'w-full lm-input transition-all disabled:cursor-not-allowed disabled:opacity-60';

const variantStyles: Record<ControlVariant, string> = {
    default:
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]',
    subtle:
        'lm-input-subtle',
};

const sizeStyles: Record<ControlSize, string> = {
    sm: 'h-10 px-3 text-sm',
    md: 'h-11 px-3.5 text-sm',
    lg: 'h-12 px-4 text-base',
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
    ({className, variant = 'default', size = 'md', groupPosition = 'none', leftIcon, rightIcon, ...props}, ref) => (
        <div className="relative">
            {leftIcon ? (
                <span className="lm-text-muted pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2">
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
                <span className="lm-text-muted pointer-events-none absolute right-3 top-1/2 z-10 -translate-y-1/2">
                    {rightIcon}
                </span>
            ) : null}
        </div>
    ),
);
FormInput.displayName = 'FormInput';

export const FormSelect = React.forwardRef<HTMLSelectElement, FormSelectProps>(
    (
        {
            className,
            variant = 'default',
            size = 'md',
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
                    <span className="lm-text-muted pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2">
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
                    <span className="lm-text-muted pointer-events-none absolute right-3 top-1/2 z-10 -translate-y-1/2">
                        {rightIcon ?? <span aria-hidden>{open ? '▴' : '▾'}</span>}
                    </span>
                </button>
                {open ? (
                    <div
                        role="listbox"
                        className={cn(
                            'absolute z-40 mt-1 max-h-64 w-full overflow-auto rounded-md py-1 shadow-lg',
                            'lm-context-menu',
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
                                        'block w-full px-3 py-2 text-left text-sm',
                                        item.disabled
                                            ? 'cursor-not-allowed lm-text-muted opacity-60'
                                            : isActive
                                                ? 'lm-bg-active lm-text-primary'
                                                : 'lm-menu-item',
                                        isSelected && !item.disabled && 'font-medium',
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
                                                    <span className="lm-text-muted block truncate text-[11px]">
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
    ({className, variant = 'default', size = 'md', groupPosition = 'none', ...props}, ref) => (
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
                'relative appearance-none rounded-full border outline-none transition-all duration-200',
                'lm-border-default',
                'bg-[var(--surface-hover)]',
                'before:absolute before:top-1/2 before:-translate-y-1/2 before:rounded-full before:bg-[var(--surface-card)] before:shadow before:transition-all before:duration-200 before:content-[\'\']',
                'checked:border-[var(--color-primary)] checked:bg-[var(--color-primary)]',
                'lm-focus-ring',
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
