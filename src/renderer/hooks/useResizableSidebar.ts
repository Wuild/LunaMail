import {useCallback, useEffect, useRef, useState} from 'react';

const DEFAULT_WIDTH = 360;
const MIN_WIDTH = 300;
const MAX_WIDTH = 520;
const STORAGE_KEY = 'lunamail.sidebar.width';

type ResizableSidebarOptions = {
	defaultWidth?: number;
	minWidth?: number;
	maxWidth?: number;
	storageKey?: string;
};

function clampWidth(value: number, minWidth: number, maxWidth: number, defaultWidth: number): number {
	if (!Number.isFinite(value)) return defaultWidth;
	return Math.max(minWidth, Math.min(maxWidth, Math.round(value)));
}

function readSavedWidth(storageKey: string, minWidth: number, maxWidth: number, defaultWidth: number): number {
	try {
		const raw = window.localStorage.getItem(storageKey);
		if (!raw) return defaultWidth;
		return clampWidth(Number(raw), minWidth, maxWidth, defaultWidth);
	} catch {
		return defaultWidth;
	}
}

function writeSavedWidth(
	width: number,
	storageKey: string,
	minWidth: number,
	maxWidth: number,
	defaultWidth: number,
): void {
	try {
		window.localStorage.setItem(storageKey, String(clampWidth(width, minWidth, maxWidth, defaultWidth)));
	} catch {
		// ignore persistence failures
	}
}

export function useResizableSidebar(options: ResizableSidebarOptions = {}) {
	const defaultWidth = options.defaultWidth ?? DEFAULT_WIDTH;
	const minWidth = options.minWidth ?? MIN_WIDTH;
	const maxWidth = options.maxWidth ?? MAX_WIDTH;
	const storageKey = options.storageKey ?? STORAGE_KEY;
	const [sidebarWidth, setSidebarWidth] = useState<number>(() =>
		readSavedWidth(storageKey, minWidth, maxWidth, defaultWidth),
	);
	const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
	const activeHandleRef = useRef<HTMLElement | null>(null);
	const widthRef = useRef(sidebarWidth);
	const draggingClass = 'is-resizing-sidebar';
	const activeHandleClass = 'is-active-resize-handle';

	const onResizeStart = useCallback(
		(event: React.MouseEvent<HTMLDivElement>) => {
			event.preventDefault();
			if (activeHandleRef.current) {
				activeHandleRef.current.classList.remove(activeHandleClass);
			}
			activeHandleRef.current = event.currentTarget;
			activeHandleRef.current.classList.add(activeHandleClass);
			dragRef.current = {
				startX: event.clientX,
				startWidth: sidebarWidth,
			};
			document.body.classList.add(draggingClass);

			const onMouseMove = (moveEvent: MouseEvent) => {
				const drag = dragRef.current;
				if (!drag) return;
				const delta = moveEvent.clientX - drag.startX;
				setSidebarWidth(clampWidth(drag.startWidth + delta, minWidth, maxWidth, defaultWidth));
			};

			const onMouseUp = () => {
				if (dragRef.current) {
					writeSavedWidth(widthRef.current, storageKey, minWidth, maxWidth, defaultWidth);
				}
				dragRef.current = null;
				if (activeHandleRef.current) {
					activeHandleRef.current.classList.remove(activeHandleClass);
					activeHandleRef.current = null;
				}
				document.body.classList.remove(draggingClass);
				window.removeEventListener('mousemove', onMouseMove);
				window.removeEventListener('mouseup', onMouseUp);
			};

			window.addEventListener('mousemove', onMouseMove);
			window.addEventListener('mouseup', onMouseUp);
		},
		[defaultWidth, maxWidth, minWidth, sidebarWidth, storageKey],
	);

	useEffect(() => {
		widthRef.current = sidebarWidth;
		writeSavedWidth(sidebarWidth, storageKey, minWidth, maxWidth, defaultWidth);
	}, [defaultWidth, maxWidth, minWidth, sidebarWidth, storageKey]);

	useEffect(() => {
		return () => {
			document.body.classList.remove(draggingClass);
			if (activeHandleRef.current) {
				activeHandleRef.current.classList.remove(activeHandleClass);
				activeHandleRef.current = null;
			}
		};
	}, []);

	return {
		sidebarWidth,
		onResizeStart,
	};
}
