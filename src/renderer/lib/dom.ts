export function isEditableTarget(target: HTMLElement | null): boolean {
    if (!target) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (target.closest('[contenteditable="true"]')) return true;
    if (target.closest('input,textarea,select')) return true;
    return false;
}
