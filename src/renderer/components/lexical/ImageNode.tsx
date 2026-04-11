import {Button} from '../ui/button';
import React, {useEffect, useRef} from 'react';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {useLexicalNodeSelection} from '@lexical/react/useLexicalNodeSelection';
import {
	$getNodeByKey,
	COMMAND_PRIORITY_LOW,
	DecoratorNode,
	type DOMConversionMap,
	type DOMConversionOutput,
	type DOMExportOutput,
	type EditorConfig,
	KEY_BACKSPACE_COMMAND,
	KEY_DELETE_COMMAND,
	type LexicalNode,
	type NodeKey,
	type SerializedLexicalNode,
	type Spread,
} from 'lexical';

export type ImageAlign = 'none' | 'left' | 'center' | 'right';

type ResizeHandle = 'left' | 'right' | 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export type SerializedImageNode = Spread<
	{
		altText: string;
		src: string;
		widthPx: number;
		width?: number;
		height: number | null;
		align: ImageAlign;
		type: 'image';
		version: 1;
	},
	SerializedLexicalNode
>;

function clampWidthPx(width: number, maxWidthPx = 4000): number {
	return Math.max(24, Math.min(maxWidthPx, Math.round(width)));
}

function clampHeight(height: number | null | undefined): number | null {
	if (height == null || !Number.isFinite(height)) return null;
	return Math.max(24, Math.min(3000, Math.round(height)));
}

function normalizeAlign(value: unknown): ImageAlign {
	return value === 'left' || value === 'center' || value === 'right' ? value : 'none';
}

function inferAlignFromStyle(node: HTMLImageElement): ImageAlign {
	const floatValue = String(node.style.float || '')
		.toLowerCase()
		.trim();
	if (floatValue === 'left') return 'left';
	if (floatValue === 'right') return 'right';

	const margin = String(node.style.margin || '').toLowerCase();
	const marginLeft = String(node.style.marginLeft || '').toLowerCase();
	const marginRight = String(node.style.marginRight || '').toLowerCase();
	const hasAutoBoth =
		margin.includes(' auto ') ||
		margin.startsWith('auto ') ||
		margin.endsWith(' auto') ||
		(marginLeft === 'auto' && marginRight === 'auto');
	if (hasAutoBoth) return 'center';

	return 'none';
}

function importImageFromDom(node: Node): DOMConversionOutput | null {
	if (!(node instanceof HTMLImageElement)) return null;
	const src = node.getAttribute('src') || '';
	if (!src) return null;
	const altText = node.getAttribute('alt') || '';
	const dataWidthPx = Number(node.getAttribute('data-llamamail-width-px') || '');
	const styleWidthPx = node.style.width.endsWith('px') ? Number(node.style.width.replace('px', '')) : NaN;
	const widthAttr = Number(node.getAttribute('width') || '');
	const legacyPct = Number(node.getAttribute('data-llamamail-width') || '');
	const widthPx = Number.isFinite(dataWidthPx)
		? dataWidthPx
		: Number.isFinite(styleWidthPx)
			? styleWidthPx
			: Number.isFinite(widthAttr)
				? widthAttr
				: Number.isFinite(legacyPct)
					? (legacyPct / 100) * 800
					: 480;
	const dataHeight = Number(node.getAttribute('data-llamamail-height') || '');
	const styleHeight = node.style.height.endsWith('px') ? Number(node.style.height.replace('px', '')) : NaN;
	const height = Number.isFinite(dataHeight) ? dataHeight : Number.isFinite(styleHeight) ? styleHeight : null;
	const alignFromData = normalizeAlign(node.getAttribute('data-llamamail-align'));
	const align = alignFromData === 'none' ? inferAlignFromStyle(node) : alignFromData;
	return {
		node: new ImageNode(src, altText, clampWidthPx(widthPx), clampHeight(height), align),
	};
}

export class ImageNode extends DecoratorNode<React.JSX.Element> {
	__src: string;
	__altText: string;
	__widthPx: number;
	__height: number | null;
	__align: ImageAlign;

	static getType(): string {
		return 'image';
	}

	static clone(node: ImageNode): ImageNode {
		return new ImageNode(node.__src, node.__altText, node.__widthPx, node.__height, node.__align, node.__key);
	}

	static importJSON(serializedNode: SerializedImageNode): ImageNode {
		return new ImageNode(
			serializedNode.src,
			serializedNode.altText || '',
			clampWidthPx(serializedNode.widthPx ?? (serializedNode.width ?? 100) * 8),
			clampHeight(serializedNode.height ?? null),
			normalizeAlign(serializedNode.align),
		);
	}

	static importDOM(): DOMConversionMap | null {
		return {
			img: () => ({
				conversion: importImageFromDom,
				priority: 2,
			}),
		};
	}

	constructor(
		src: string,
		altText = '',
		widthPx = 480,
		height: number | null = null,
		align: ImageAlign = 'none',
		key?: NodeKey,
	) {
		super(key);
		this.__src = src;
		this.__altText = altText;
		this.__widthPx = clampWidthPx(widthPx);
		this.__height = clampHeight(height);
		this.__align = normalizeAlign(align);
	}

	exportJSON(): SerializedImageNode {
		return {
			altText: this.__altText,
			src: this.__src,
			widthPx: this.__widthPx,
			height: this.__height,
			align: this.__align,
			type: 'image',
			version: 1,
		};
	}

	exportDOM(): DOMExportOutput {
		const img = document.createElement('img');
		img.setAttribute('src', this.__src);
		if (this.__altText) img.setAttribute('alt', this.__altText);
		img.setAttribute('data-llamamail-width-px', String(this.__widthPx));
		img.setAttribute('data-llamamail-height', this.__height == null ? '' : String(this.__height));
		img.setAttribute('data-llamamail-align', this.__align);
		img.style.width = `${this.__widthPx}px`;
		img.style.height = this.__height == null ? 'auto' : `${this.__height}px`;
		img.style.display = 'block';
		img.style.maxWidth = '100%';
		if (this.__align === 'left') {
			img.style.margin = '0 auto 0.75rem 0';
		} else if (this.__align === 'right') {
			img.style.margin = '0 0 0.75rem auto';
		} else if (this.__align === 'center') {
			img.style.margin = '0 auto 0.75rem';
		} else {
			img.style.margin = '0.5rem 0 0.75rem';
		}
		return {element: img};
	}

	createDOM(_config: EditorConfig): HTMLElement {
		return document.createElement('span');
	}

	updateDOM(): false {
		return false;
	}

	setWidthPx(widthPx: number, maxWidthPx?: number): void {
		this.getWritable().__widthPx = clampWidthPx(widthPx, maxWidthPx ?? 4000);
	}

	setHeight(height: number | null): void {
		this.getWritable().__height = clampHeight(height);
	}

	setAlign(align: ImageAlign): void {
		this.getWritable().__align = normalizeAlign(align);
	}

	decorate(): React.JSX.Element {
		return (
			<EditableImage
				nodeKey={this.getKey()}
				src={this.__src}
				altText={this.__altText}
				widthPx={this.__widthPx}
				height={this.__height}
				align={this.__align}
			/>
		);
	}
}

function EditableImage({
	nodeKey,
	src,
	altText,
	widthPx,
	height,
	align,
}: {
	nodeKey: NodeKey;
	src: string;
	altText: string;
	widthPx: number;
	height: number | null;
	align: ImageAlign;
}) {
	const [editor] = useLexicalComposerContext();
	const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey);
	const wrapRef = useRef<HTMLDivElement | null>(null);
	const imageRef = useRef<HTMLImageElement | null>(null);
	const ratioRef = useRef(1);
	const resizeRef = useRef<{
		handle: ResizeHandle;
		startX: number;
		startY: number;
		startWidthPx: number;
		startHeightPx: number;
		maxWidthPx: number;
		ratio: number;
		scrollParent: HTMLElement | null;
		startScrollLeft: number;
		startScrollTop: number;
		previewWidthPx: number;
		previewHeightPx: number | null;
		cleanup: () => void;
	} | null>(null);
	const rafRef = useRef<number | null>(null);
	const pendingPointerRef = useRef<{x: number; y: number; lockAspect: boolean} | null>(null);

	useEffect(() => {
		const updateRatio = () => {
			const img = imageRef.current;
			if (!img) return;
			const ratio = img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 1;
			ratioRef.current = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
		};
		const img = imageRef.current;
		if (!img) return;
		updateRatio();
		if (!img.complete) {
			img.addEventListener('load', updateRatio);
			return () => img.removeEventListener('load', updateRatio);
		}
	}, [src]);

	useEffect(() => {
		const unregDelete = editor.registerCommand(
			KEY_DELETE_COMMAND,
			() => {
				if (!isSelected) return false;
				editor.update(() => {
					const node = $getNodeByKey(nodeKey);
					if (node) node.remove();
				});
				return true;
			},
			COMMAND_PRIORITY_LOW,
		);
		const unregBackspace = editor.registerCommand(
			KEY_BACKSPACE_COMMAND,
			() => {
				if (!isSelected) return false;
				editor.update(() => {
					const node = $getNodeByKey(nodeKey);
					if (node) node.remove();
				});
				return true;
			},
			COMMAND_PRIORITY_LOW,
		);
		return () => {
			unregDelete();
			unregBackspace();
		};
	}, [editor, isSelected, nodeKey]);

	useEffect(() => {
		return () => {
			if (resizeRef.current) {
				resizeRef.current.cleanup();
				resizeRef.current = null;
			}
			if (rafRef.current != null) {
				window.cancelAnimationFrame(rafRef.current);
				rafRef.current = null;
			}
		};
	}, []);

	const updateNode = (updater: (node: ImageNode) => void) => {
		editor.update(() => {
			const node = $getNodeByKey(nodeKey);
			if ($isImageNode(node)) updater(node);
		});
	};

	const onSelect = (event: React.MouseEvent) => {
		if (event.button !== 0) return;
		event.stopPropagation();
		editor.update(() => {
			if (!event.shiftKey) clearSelection();
			setSelected(true);
		});
	};

	const stopEvent = (event: React.SyntheticEvent) => {
		event.preventDefault();
		event.stopPropagation();
	};

	const onDragStart = (event: React.DragEvent<HTMLDivElement>) => {
		event.stopPropagation();
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData(
			'application/x-llamamail-image',
			JSON.stringify({
				sourceKey: nodeKey,
				src,
				altText,
				widthPx,
				height,
				align,
			}),
		);
		const img = imageRef.current;
		if (img) {
			try {
				event.dataTransfer.setDragImage(img, Math.min(24, img.width / 2), Math.min(24, img.height / 2));
			} catch {
				// ignore
			}
		}
	};

	const applyResize = (clientX: number, clientY: number, lockAspect = false) => {
		const session = resizeRef.current;
		if (!session) return;
		const scrollDx = session.scrollParent ? session.scrollParent.scrollLeft - session.startScrollLeft : 0;
		const scrollDy = session.scrollParent ? session.scrollParent.scrollTop - session.startScrollTop : 0;
		const dx = clientX - session.startX + scrollDx;
		const dy = clientY - session.startY + scrollDy;

		const hasLeft = session.handle.includes('left');
		const hasRight = session.handle.includes('right');
		const hasTop = session.handle.includes('top');
		const hasBottom = session.handle.includes('bottom');

		const widthDelta = hasLeft ? -dx : hasRight ? dx : 0;
		const heightDelta = hasTop ? -dy : hasBottom ? dy : 0;

		let nextWidthPx = clampWidthPx(session.startWidthPx + widthDelta, session.maxWidthPx);
		let nextHeight = hasTop || hasBottom ? clampHeight(session.startHeightPx + heightDelta) : null;

		if (lockAspect) {
			const ratio = Math.max(0.01, session.ratio || 1);
			const hasHorizontal = hasLeft || hasRight;
			const hasVertical = hasTop || hasBottom;
			if (hasHorizontal && hasVertical) {
				const widthFromHeight = clampWidthPx((nextHeight ?? session.startHeightPx) * ratio, session.maxWidthPx);
				const heightFromWidth = clampHeight(nextWidthPx / ratio);
				const useWidthDriven = Math.abs(dx) >= Math.abs(dy);
				if (useWidthDriven) {
					nextHeight = heightFromWidth;
				} else {
					nextWidthPx = widthFromHeight;
				}
			} else if (hasHorizontal) {
				nextHeight = clampHeight(nextWidthPx / ratio);
			} else if (hasVertical) {
				const baseHeight = nextHeight ?? session.startHeightPx;
				nextWidthPx = clampWidthPx(baseHeight * ratio, session.maxWidthPx);
			}
		}

		session.previewWidthPx = nextWidthPx;
		session.previewHeightPx = nextHeight;
		const wrap = wrapRef.current;
		if (wrap) wrap.style.width = `${nextWidthPx}px`;
		const image = imageRef.current;
		if (image && nextHeight != null) {
			image.style.height = `${nextHeight}px`;
		} else if (image && (hasTop || hasBottom || lockAspect)) {
			image.style.height = 'auto';
		}
	};

	const queueResize = (clientX: number, clientY: number, lockAspect: boolean) => {
		pendingPointerRef.current = {x: clientX, y: clientY, lockAspect};
		if (rafRef.current != null) return;
		rafRef.current = window.requestAnimationFrame(() => {
			rafRef.current = null;
			const pending = pendingPointerRef.current;
			if (!pending) return;
			applyResize(pending.x, pending.y, pending.lockAspect);
		});
	};

	const startResize = (handle: ResizeHandle, event: React.PointerEvent<HTMLDivElement>) => {
		stopEvent(event);
		const parentWidth = Math.max(24, wrapRef.current?.parentElement?.clientWidth ?? 800);
		const renderedHeight = imageRef.current?.clientHeight || 160;
		const pointerId = event.pointerId;
		const onMove = (moveEvent: PointerEvent) => {
			if (moveEvent.pointerId !== pointerId) return;
			moveEvent.preventDefault();
			queueResize(moveEvent.clientX, moveEvent.clientY, moveEvent.shiftKey);
		};
		const onUp = (upEvent: PointerEvent) => {
			if (upEvent.pointerId !== pointerId) return;
			upEvent.preventDefault();
			if (rafRef.current != null) {
				window.cancelAnimationFrame(rafRef.current);
				rafRef.current = null;
			}
			const pending = pendingPointerRef.current;
			if (pending) applyResize(pending.x, pending.y, pending.lockAspect);
			pendingPointerRef.current = null;
			const current = resizeRef.current;
			if (current) {
				const finalWidthPx = current.previewWidthPx;
				const finalHeightPx = current.previewHeightPx;
				if (finalWidthPx !== widthPx || finalHeightPx !== height) {
					updateNode((node) => {
						node.setWidthPx(finalWidthPx, current.maxWidthPx);
						node.setHeight(finalHeightPx);
					});
				}
			}
			if (current) current.cleanup();
			resizeRef.current = null;
		};
		const cleanup = () => {
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
			window.removeEventListener('pointercancel', onUp);
		};
		const scrollParent = findScrollParent(wrapRef.current);
		resizeRef.current = {
			handle,
			startX: event.clientX,
			startY: event.clientY,
			startWidthPx: widthPx,
			startHeightPx: height ?? renderedHeight,
			maxWidthPx: parentWidth,
			ratio: ratioRef.current > 0 ? ratioRef.current : 1,
			scrollParent,
			startScrollLeft: scrollParent?.scrollLeft ?? 0,
			startScrollTop: scrollParent?.scrollTop ?? 0,
			previewWidthPx: clampWidthPx(widthPx, parentWidth),
			previewHeightPx: clampHeight(height),
			cleanup,
		};
		setSelected(true);
		window.addEventListener('pointermove', onMove, {passive: false});
		window.addEventListener('pointerup', onUp, {passive: false});
		window.addEventListener('pointercancel', onUp, {passive: false});
	};

	const alignClass =
		align === 'center' ? 'mx-auto' : align === 'right' ? 'ml-auto' : align === 'left' ? 'mr-auto' : '';
	const style: React.CSSProperties = {width: `${clampWidthPx(widthPx)}px`, maxWidth: '100%'};
	if (align === 'left') {
		style.float = 'left';
		style.margin = '0 1rem 0.75rem 0';
	} else if (align === 'right') {
		style.float = 'right';
		style.margin = '0 0 0.75rem 1rem';
	} else if (align === 'center') {
		style.float = 'none';
		style.margin = '0 auto 0.75rem';
	} else {
		style.float = 'none';
		style.margin = '0.5rem 0 0.75rem';
	}

	return (
		<div contentEditable={false} className="relative py-1">
			<div
				ref={wrapRef}
				className={`relative ${alignClass} ${isSelected ? 'image-selected-ring' : ''}`}
				style={style}
				onMouseDown={onSelect}
				onClick={stopEvent}
				draggable
				onDragStart={onDragStart}
			>
				<img
					ref={imageRef}
					src={src}
					alt={altText}
					className="block w-full select-none"
					style={{height: height == null ? 'auto' : `${height}px`}}
					onMouseDown={onSelect}
					onClick={stopEvent}
					draggable={false}
				/>
				{isSelected && (
					<>
						<div
							className="panel absolute left-1 top-1 z-30 flex items-center gap-1 rounded-md border p-1 shadow-sm"
							onMouseDown={stopEvent}
							onClick={stopEvent}
						>
							<Button
								type="button"
								className={`rounded px-1.5 text-[11px] ${align === 'none' ? 'ui-surface-active' : ''}`}
								onClick={() => updateNode((n) => n.setAlign('none'))}
							>
								B
							</Button>
							<Button
								type="button"
								className={`rounded px-1.5 text-[11px] ${align === 'left' ? 'ui-surface-active' : ''}`}
								onClick={() => updateNode((n) => n.setAlign('left'))}
							>
								L
							</Button>
							<Button
								type="button"
								className={`rounded px-1.5 text-[11px] ${align === 'center' ? 'ui-surface-active' : ''}`}
								onClick={() => updateNode((n) => n.setAlign('center'))}
							>
								C
							</Button>
							<Button
								type="button"
								className={`rounded px-1.5 text-[11px] ${align === 'right' ? 'ui-surface-active' : ''}`}
								onClick={() => updateNode((n) => n.setAlign('right'))}
							>
								R
							</Button>
							<div className="divider-default mx-0.5 h-4 w-px" />
							<Button
								type="button"
								className="text-danger rounded px-1.5 text-[11px]"
								onClick={() => editor.update(() => $getNodeByKey(nodeKey)?.remove())}
							>
								x
							</Button>
						</div>

						<ResizeOverlay
							handle="left"
							className="image-resize-bar absolute bottom-2 left-[-1px] top-2 w-1.5 cursor-ew-resize rounded"
							startResize={startResize}
						/>
						<ResizeOverlay
							handle="right"
							className="image-resize-bar absolute bottom-2 right-[-1px] top-2 w-1.5 cursor-ew-resize rounded"
							startResize={startResize}
						/>
						<ResizeOverlay
							handle="top"
							className="image-resize-bar absolute left-2 right-2 top-[-1px] h-1.5 cursor-ns-resize rounded"
							startResize={startResize}
						/>
						<ResizeOverlay
							handle="bottom"
							className="image-resize-bar absolute bottom-[-1px] left-2 right-2 h-1.5 cursor-ns-resize rounded"
							startResize={startResize}
						/>

						<ResizeOverlay
							handle="top-left"
							className="image-resize-corner absolute left-[-1px] top-[-1px] h-2.5 w-2.5 cursor-nwse-resize rounded-sm"
							startResize={startResize}
						/>
						<ResizeOverlay
							handle="top-right"
							className="image-resize-corner absolute right-[-1px] top-[-1px] h-2.5 w-2.5 cursor-nesw-resize rounded-sm"
							startResize={startResize}
						/>
						<ResizeOverlay
							handle="bottom-left"
							className="image-resize-corner absolute bottom-[-1px] left-[-1px] h-2.5 w-2.5 cursor-nesw-resize rounded-sm"
							startResize={startResize}
						/>
						<ResizeOverlay
							handle="bottom-right"
							className="image-resize-corner absolute bottom-[-1px] right-[-1px] h-2.5 w-2.5 cursor-nwse-resize rounded-sm"
							startResize={startResize}
						/>
					</>
				)}
			</div>
		</div>
	);
}

function findScrollParent(element: HTMLElement | null): HTMLElement | null {
	let current = element?.parentElement ?? null;
	while (current) {
		const style = window.getComputedStyle(current);
		const overflowY = style.overflowY;
		const overflowX = style.overflowX;
		const canScrollY =
			(overflowY === 'auto' || overflowY === 'scroll') && current.scrollHeight > current.clientHeight;
		const canScrollX =
			(overflowX === 'auto' || overflowX === 'scroll') && current.scrollWidth > current.clientWidth;
		if (canScrollY || canScrollX) return current;
		current = current.parentElement;
	}
	return null;
}

function ResizeOverlay({
	handle,
	className,
	startResize,
}: {
	handle: ResizeHandle;
	className: string;
	startResize: (handle: ResizeHandle, event: React.PointerEvent<HTMLDivElement>) => void;
}) {
	return (
		<div
			role="button"
			tabIndex={-1}
			className={className}
			onPointerDown={(event) => startResize(handle, event)}
			onMouseDown={(event) => {
				event.preventDefault();
				event.stopPropagation();
			}}
		/>
	);
}

export function $createImageNode(
	src: string,
	altText = '',
	widthPx = 480,
	align: ImageAlign = 'none',
	_caption = '',
	height: number | null = null,
): ImageNode {
	return new ImageNode(src, altText, widthPx, height, align);
}

export function $isImageNode(node: LexicalNode | null | undefined): node is ImageNode {
	return node instanceof ImageNode;
}
