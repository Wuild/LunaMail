import {useEffect, useRef} from 'react';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {
    $createRangeSelection,
    $getNearestNodeFromDOMNode,
    $getNodeByKey,
    $getRoot,
    $getSelection,
    $isRangeSelection,
    $isTextNode,
    $normalizeSelection__EXPERIMENTAL,
    $setSelection,
    COMMAND_PRIORITY_LOW,
    DRAGOVER_COMMAND,
    DROP_COMMAND,
} from 'lexical';
import {$createImageNode, $isImageNode, type ImageAlign} from './ImageNode';

type DragImagePayload = {
    sourceKey?: string;
    src: string;
    altText: string;
    widthPx: number;
    height: number | null;
    align: ImageAlign;
};

export default function ImageDnDPlugin() {
    const [editor] = useLexicalComposerContext();
    const draggingRef = useRef(false);
    const placeholderRef = useRef<HTMLDivElement | null>(null);
    const lastPointerRef = useRef<{x: number; y: number} | null>(null);

    useEffect(() => {
        const wheelListenerOptions: AddEventListenerOptions = {capture: true, passive: false};

        const ensurePlaceholder = (): HTMLDivElement | null => {
            if (placeholderRef.current) return placeholderRef.current;
            const root = editor.getRootElement();
            const container = root?.parentElement;
            if (!root || !container) return null;
            if (window.getComputedStyle(container).position === 'static') {
                container.style.position = 'relative';
            }
            const el = document.createElement('div');
            el.style.position = 'absolute';
            el.style.height = '0';
            el.style.borderTop = '2px solid var(--color-primary)';
            el.style.boxShadow = '0 0 0 1px color-mix(in srgb, var(--color-primary) 25%, transparent)';
            el.style.borderRadius = '999px';
            el.style.pointerEvents = 'none';
            el.style.zIndex = '35';
            el.style.display = 'none';
            container.appendChild(el);
            placeholderRef.current = el;
            return el;
        };

        const hidePlaceholder = () => {
            const placeholder = placeholderRef.current;
            if (placeholder) placeholder.style.display = 'none';
        };

        const showPlaceholder = (clientX: number, clientY: number) => {
            const root = editor.getRootElement();
            if (!root) return;
            const placeholder = ensurePlaceholder();
            if (!placeholder) return;
            const rootRect = root.getBoundingClientRect();
            const clampedY = Math.max(rootRect.top + 2, Math.min(rootRect.bottom - 2, clientY));
            const insetX = 8;
            placeholder.style.left = `${root.offsetLeft + insetX}px`;
            placeholder.style.width = `${Math.max(24, rootRect.width - insetX * 2)}px`;
            placeholder.style.top = `${Math.round(root.offsetTop + clampedY - rootRect.top)}px`;
            placeholder.style.display = 'block';
        };

        const updateDropSelection = (clientX: number, clientY: number) => {
            editor.update(() => {
                const drop = getDropRangeAtPoint(clientX, clientY);
                if (!drop) return;
                const nearestNode = $getNearestNodeFromDOMNode(drop.node);
                if (!nearestNode) return;
                const range = $createRangeSelection();
                if ($isTextNode(nearestNode)) {
                    range.anchor.set(nearestNode.getKey(), drop.offset, 'text');
                    range.focus.set(nearestNode.getKey(), drop.offset, 'text');
                } else {
                    const parent = nearestNode.getParentOrThrow();
                    const offset = nearestNode.getIndexWithinParent() + 1;
                    range.anchor.set(parent.getKey(), offset, 'element');
                    range.focus.set(parent.getKey(), offset, 'element');
                }
                $setSelection($normalizeSelection__EXPERIMENTAL(range));
            });
        };

        const applyAutoScroll = (clientY: number) => {
            const root = editor.getRootElement();
            const scrollParent = findScrollParent(root);
            if (!root || !scrollParent) return;
            const rect = root.getBoundingClientRect();
            if (clientY < rect.top || clientY > rect.bottom) return;
            const edge = 48;
            const maxStep = 28;
            const topDistance = clientY - rect.top;
            const bottomDistance = rect.bottom - clientY;
            if (topDistance < edge) {
                const ratio = (edge - topDistance) / edge;
                scrollParent.scrollTop -= Math.ceil(ratio * maxStep);
            } else if (bottomDistance < edge) {
                const ratio = (edge - bottomDistance) / edge;
                scrollParent.scrollTop += Math.ceil(ratio * maxStep);
            }
        };

        const onWindowDragEnd = () => {
            draggingRef.current = false;
            hidePlaceholder();
            lastPointerRef.current = null;
        };

        const onWheelWhileDragging = (event: WheelEvent) => {
            if (!draggingRef.current) return;
            const root = editor.getRootElement();
            const scrollParent = findScrollParent(root);
            if (!root || !scrollParent) return;
            const pointer = lastPointerRef.current;
            if (!pointer) return;
            const rect = root.getBoundingClientRect();
            const withinX = pointer.x >= rect.left && pointer.x <= rect.right;
            const withinY = pointer.y >= rect.top && pointer.y <= rect.bottom;
            if (!withinX || !withinY) return;
            scrollParent.scrollTop += event.deltaY;
            event.preventDefault();
        };

        window.addEventListener('dragend', onWindowDragEnd);
        window.addEventListener('drop', onWindowDragEnd);
        window.addEventListener('wheel', onWheelWhileDragging, wheelListenerOptions);

        const unregisterDragOver = editor.registerCommand(
            DRAGOVER_COMMAND,
            (event) => {
                if (!event.dataTransfer?.types.includes('application/x-llamamail-image')) return false;
                event.preventDefault();
                draggingRef.current = true;
                lastPointerRef.current = {x: event.clientX, y: event.clientY};
                updateDropSelection(event.clientX, event.clientY);
                showPlaceholder(event.clientX, event.clientY);
                applyAutoScroll(event.clientY);
                return true;
            },
            COMMAND_PRIORITY_LOW,
        );

        const unregisterDrop = editor.registerCommand(
            DROP_COMMAND,
            (event) => {
                const raw = event.dataTransfer?.getData('application/x-llamamail-image') || '';
                if (!raw) return false;
                let payload: DragImagePayload;
                try {
                    payload = JSON.parse(raw);
                } catch {
                    return false;
                }
                event.preventDefault();
                draggingRef.current = false;
                hidePlaceholder();

                editor.update(() => {
                    const drop = getDropRangeAtPoint(event.clientX, event.clientY);
                    if (drop) {
                        const nearestNode = $getNearestNodeFromDOMNode(drop.node);
                        if (nearestNode) {
                            const range = $createRangeSelection();
                            if ($isTextNode(nearestNode)) {
                                range.anchor.set(nearestNode.getKey(), drop.offset, 'text');
                                range.focus.set(nearestNode.getKey(), drop.offset, 'text');
                            } else {
                                const parent = nearestNode.getParentOrThrow();
                                const offset = nearestNode.getIndexWithinParent() + 1;
                                range.anchor.set(parent.getKey(), offset, 'element');
                                range.focus.set(parent.getKey(), offset, 'element');
                            }
                            $setSelection($normalizeSelection__EXPERIMENTAL(range));
                        }
                    }

                    if (payload.sourceKey) {
                        const sourceNode = $getNodeByKey(payload.sourceKey);
                        if ($isImageNode(sourceNode)) sourceNode.remove();
                    }

                    let selection = $getSelection();
                    if (!$isRangeSelection(selection)) {
                        $getRoot().selectEnd();
                        selection = $getSelection();
                    }
                    if ($isRangeSelection(selection)) {
                        selection.insertNodes([
                            $createImageNode(
                                payload.src,
                                payload.altText,
                                payload.widthPx,
                                payload.align,
                                '',
                                payload.height,
                            ),
                        ]);
                    }
                });

                return true;
            },
            COMMAND_PRIORITY_LOW,
        );

        return () => {
            window.removeEventListener('dragend', onWindowDragEnd);
            window.removeEventListener('drop', onWindowDragEnd);
            window.removeEventListener('wheel', onWheelWhileDragging, wheelListenerOptions);
            hidePlaceholder();
            if (placeholderRef.current) {
                placeholderRef.current.remove();
                placeholderRef.current = null;
            }
            unregisterDragOver();
            unregisterDrop();
        };
    }, [editor]);

    return null;
}

function getDropRangeAtPoint(x: number, y: number): { node: Node; offset: number } | null {
    const withCaretRange = (document as any).caretRangeFromPoint;
    if (typeof withCaretRange === 'function') {
        const range = withCaretRange.call(document, x, y);
        if (range) return {node: range.startContainer, offset: range.startOffset};
    }

    const withCaretPosition = (document as any).caretPositionFromPoint;
    if (typeof withCaretPosition === 'function') {
        const position = withCaretPosition.call(document, x, y);
        if (position) return {node: position.offsetNode, offset: position.offset};
    }

    return null;
}

function findScrollParent(element: HTMLElement | null): HTMLElement | null {
    let current = element?.parentElement ?? null;
    while (current) {
        const style = window.getComputedStyle(current);
        const overflowY = style.overflowY;
        const canScrollY = (overflowY === 'auto' || overflowY === 'scroll') && current.scrollHeight > current.clientHeight;
        if (canScrollY) return current;
        current = current.parentElement;
    }
    return null;
}
