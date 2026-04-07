const MESSAGE_TAG_OPTIONS: Array<{ value: string; label: string; dotClass: string }> = [
    {value: 'important', label: 'Important', dotClass: 'bg-red-500'},
    {value: 'work', label: 'Work', dotClass: 'bg-blue-500'},
    {value: 'personal', label: 'Personal', dotClass: 'bg-emerald-500'},
    {value: 'todo', label: 'To Do', dotClass: 'bg-amber-500'},
    {value: 'later', label: 'Later', dotClass: 'bg-violet-500'},
];

export function getTagLabel(tag: string | null): string {
    const normalized = String(tag || '')
        .trim()
        .toLowerCase();
    if (!normalized) return '';
    const found = MESSAGE_TAG_OPTIONS.find((item) => item.value === normalized);
    return found?.label || normalized;
}

export function getTagDotClass(tag: string | null): string {
    const normalized = String(tag || '')
        .trim()
        .toLowerCase();
    const found = MESSAGE_TAG_OPTIONS.find((item) => item.value === normalized);
    return found?.dotClass || 'bg-slate-400';
}
