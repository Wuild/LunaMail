type ActivePan = {
    element: HTMLElement;
    anchorX: number;
    anchorY: number;
    originScrollLeft: number;
    originScrollTop: number;
    previousCursor: string;
    previousBodyCursor: string;
};

function isEditableTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    if (el.closest('input, textarea, select, [contenteditable="true"]')) return true;
    return false;
}

function isScrollableElement(element: HTMLElement): boolean {
    const style = window.getComputedStyle(element);
    const overflowX = style.overflowX;
    const overflowY = style.overflowY;
    const canScrollX =
        (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay') &&
        element.scrollWidth > element.clientWidth;
    const canScrollY =
        (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
        element.scrollHeight > element.clientHeight;
    return canScrollX || canScrollY;
}

function findScrollableAncestor(target: EventTarget | null): HTMLElement | null {
    let current = target as HTMLElement | null;
    while (current) {
        if (isScrollableElement(current)) return current;
        current = current.parentElement;
    }
    return null;
}

export function installMiddleMousePan(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if ((window as any).__lunaMiddleMousePanInstalled) return;
    (window as any).__lunaMiddleMousePanInstalled = true;

    let active: ActivePan | null = null;

    const stopPan = () => {
        if (!active) return;
        active.element.style.cursor = active.previousCursor;
        document.body.style.cursor = active.previousBodyCursor;
        active = null;
    };

    const startPan = (event: MouseEvent, scrollable: HTMLElement) => {
        const previousCursor = scrollable.style.cursor;
        const previousBodyCursor = document.body.style.cursor;
        scrollable.style.cursor = 'all-scroll';
        document.body.style.cursor = 'all-scroll';
        active = {
            element: scrollable,
            anchorX: event.clientX,
            anchorY: event.clientY,
            originScrollLeft: scrollable.scrollLeft,
            originScrollTop: scrollable.scrollTop,
            previousCursor,
            previousBodyCursor,
        };
    };

    const onMouseDown = (event: MouseEvent) => {
        if (event.button === 1) {
            event.preventDefault();
            event.stopPropagation();
            if (active) {
                stopPan();
                return;
            }
            if (isEditableTarget(event.target)) return;
            const scrollable = findScrollableAncestor(event.target);
            if (!scrollable) return;
            startPan(event, scrollable);
            return;
        }
        if (active) stopPan();
    };

    const onMouseMove = (event: MouseEvent) => {
        if (!active) return;
        const dx = event.clientX - active.anchorX;
        const dy = event.clientY - active.anchorY;
        active.element.scrollLeft = active.originScrollLeft + dx;
        active.element.scrollTop = active.originScrollTop + dy;
    };
    const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') stopPan();
    };

    document.addEventListener('mousedown', onMouseDown, {capture: true});
    window.addEventListener('mousemove', onMouseMove, {capture: true});
    window.addEventListener('keydown', onKeyDown, {capture: true});
    window.addEventListener('blur', stopPan, {capture: true});
}
