const MESSAGE_TAG_OPTIONS: Array<{ value: string; label: string; dotClass: string }> = [
    {value: 'important', label: 'Important', dotClass: 'tag-dot-important'},
    {value: 'work', label: 'Work', dotClass: 'tag-dot-work'},
    {value: 'personal', label: 'Personal', dotClass: 'tag-dot-personal'},
    {value: 'todo', label: 'To Do', dotClass: 'tag-dot-todo'},
    {value: 'later', label: 'Later', dotClass: 'tag-dot-later'},
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
    return found?.dotClass || 'tag-dot-later';
}
