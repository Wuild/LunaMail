import {Button} from './ui/button';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {LexicalComposer} from '@lexical/react/LexicalComposer';
import {RichTextPlugin} from '@lexical/react/LexicalRichTextPlugin';
import {ContentEditable} from '@lexical/react/LexicalContentEditable';
import {LexicalErrorBoundary} from '@lexical/react/LexicalErrorBoundary';
import {HistoryPlugin} from '@lexical/react/LexicalHistoryPlugin';
import {OnChangePlugin} from '@lexical/react/LexicalOnChangePlugin';
import {ListPlugin} from '@lexical/react/LexicalListPlugin';
import {LinkPlugin} from '@lexical/react/LexicalLinkPlugin';
import {AutoLinkPlugin, createLinkMatcherWithRegExp} from '@lexical/react/LexicalAutoLinkPlugin';
import {TabIndentationPlugin} from '@lexical/react/LexicalTabIndentationPlugin';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {HorizontalRulePlugin} from '@lexical/react/LexicalHorizontalRulePlugin';
import {HorizontalRuleNode, INSERT_HORIZONTAL_RULE_COMMAND} from '@lexical/react/LexicalHorizontalRuleNode';
import {$setBlocksType} from '@lexical/selection';
import {$createQuoteNode, HeadingNode, QuoteNode} from '@lexical/rich-text';
import {
    $isListNode,
    INSERT_ORDERED_LIST_COMMAND,
    INSERT_UNORDERED_LIST_COMMAND,
    ListItemNode,
    ListNode,
    REMOVE_LIST_COMMAND,
} from '@lexical/list';
import {AutoLinkNode, LinkNode} from '@lexical/link';
import {$generateHtmlFromNodes, $generateNodesFromDOM} from '@lexical/html';
import {$createCodeNode, CodeNode} from '@lexical/code';
import {
    $createParagraphNode,
    $createRangeSelection,
    $getNearestNodeFromDOMNode,
    $getRoot,
    $getSelection,
    $isDecoratorNode,
    $isElementNode,
    $isRangeSelection,
    $isTextNode,
    $normalizeSelection__EXPERIMENTAL,
    $setSelection,
    COMMAND_PRIORITY_LOW,
    FORMAT_TEXT_COMMAND,
    type LexicalEditor,
    SELECTION_CHANGE_COMMAND,
} from 'lexical';
import {$getNearestNodeOfType} from '@lexical/utils';
import {
    Bold,
    Code,
    Heading1,
    Heading2,
    Highlighter,
    ImagePlus,
    Italic,
    List,
    ListOrdered,
    ListX,
    MessageSquareQuote,
    SeparatorHorizontal,
    Strikethrough,
    Underline,
} from 'lucide-react';
import {$createImageNode, ImageNode} from './lexical/ImageNode';
import ImageDnDPlugin from './lexical/ImageDnDPlugin';
import {createDefaultAppSettings} from '@/shared/defaults';
import {useAppSettings} from '@renderer/hooks/ipc/useAppSettings';

interface HtmlLexicalEditorProps {
    value: string;
    placeholder?: string;
    onChange: (html: string, plainText: string) => void;
    appearance?: 'default' | 'embedded';
    onDropNonImageFiles?: (files: File[]) => void;
}

const editorTheme = {
    paragraph: 'mb-2',
    quote: 'editor-quote pl-3 italic',
    heading: {
        h1: 'text-2xl font-semibold mb-2',
        h2: 'text-xl font-semibold mb-2',
        h3: 'text-lg font-semibold mb-2',
    },
    list: {
        ol: 'list-decimal ml-6 mb-2',
        ul: 'list-disc ml-6 mb-2',
        listitem: 'mb-1',
    },
    text: {
        bold: 'font-semibold',
        italic: 'italic',
        underline: 'underline',
        strikethrough: 'line-through',
        code: 'editor-inline-code rounded px-1 py-0.5 font-mono text-[0.92em]',
    },
    code: 'editor-code-block block rounded-md p-3 font-mono text-sm',
    link: 'editor-link underline',
};

const AUTO_LINK_MATCHERS = [
    createLinkMatcherWithRegExp(/((https?:\/\/)|(www\.))[^\s<]+[^\s<.)!?,:;"']/i, (text) =>
        text.startsWith('http://') || text.startsWith('https://') ? text : `https://${text}`,
    ),
    createLinkMatcherWithRegExp(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, (text) => `mailto:${text}`),
    createLinkMatcherWithRegExp(/\+?\d[\d\s().-]{6,}\d/i, (text) => `tel:${normalizePhoneForTel(text)}`),
];

function normalizePhoneForTel(value: string): string {
    const raw = String(value || '').trim();
    if (!raw) return raw;
    const keepLeadingPlus = raw.startsWith('+');
    const digitsOnly = raw.replace(/[^\d]/g, '');
    if (!digitsOnly) return raw;
    return keepLeadingPlus ? `+${digitsOnly}` : digitsOnly;
}

function toHtmlDocument(value: string): string {
    const raw = value || '';
    if (!raw.trim()) return '';
    if (/<\/?[a-z][\s\S]*>/i.test(raw)) return raw;
    const escaped = escapeHtml(raw).replace(/\r\n?/g, '\n').replace(/\n/g, '<br/>');
    return `<p>${escaped}</p>`;
}

function applyHtmlToEditor(editor: LexicalEditor, value: string): void {
    const html = toHtmlDocument(value);
    editor.update(
        () => {
            const root = $getRoot();
            root.clear();
            if (!html.trim()) {
                root.append($createParagraphNode());
                return;
            }
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            // Some draft providers may persist contenteditable flags; strip them so the editor stays editable.
            doc.querySelectorAll('[contenteditable]').forEach((element) => {
                element.removeAttribute('contenteditable');
            });
            const nodes = normalizeImportedNodes($generateNodesFromDOM(editor, doc));
            if (nodes.length === 0) {
                root.append($createParagraphNode());
                return;
            }
            root.append(...nodes);
        },
        {tag: 'external-html-sync'},
    );
}

function normalizeImportedNodes(nodes: Array<any>): Array<any> {
    const normalized: any[] = [];
    let paragraphBuffer: any | null = null;

    for (const node of nodes) {
        if ($isElementNode(node) || $isDecoratorNode(node)) {
            paragraphBuffer = null;
            normalized.push(node);
            continue;
        }

        if (!paragraphBuffer) {
            paragraphBuffer = $createParagraphNode();
            normalized.push(paragraphBuffer);
        }
        paragraphBuffer.append(node);
    }

    const lastNode = normalized[normalized.length - 1];
    if (lastNode && $isDecoratorNode(lastNode)) {
        normalized.push($createParagraphNode());
    }

    return normalized;
}

function normalizeHtmlForCompare(value: string): string {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .replace(/>\s+</g, '><')
        .trim();
}

function ExternalHtmlSyncPlugin({
                                    value,
                                    lastInternalHtmlRef,
                                }: {
    value: string;
    lastInternalHtmlRef: React.MutableRefObject<string>;
}) {
    const [editor] = useLexicalComposerContext();

    useEffect(() => {
        const nextRaw = toHtmlDocument(value);
        const nextNormalized = normalizeHtmlForCompare(nextRaw);
        const lastInternalNormalized = normalizeHtmlForCompare(lastInternalHtmlRef.current);
        if (nextNormalized === lastInternalNormalized) return;

        let current = '';
        editor.getEditorState().read(() => {
            current = $generateHtmlFromNodes(editor, null).trim();
        });
        if (normalizeHtmlForCompare(current) === nextNormalized) return;
        applyHtmlToEditor(editor, nextRaw);
    }, [editor, value, lastInternalHtmlRef]);

    return null;
}

function ToolbarPlugin({appearance = 'default'}: { appearance?: 'default' | 'embedded' }) {
    const [editor] = useLexicalComposerContext();
    const [activeFormats, setActiveFormats] = useState({
        bold: false,
        italic: false,
        underline: false,
        strikethrough: false,
        quote: false,
        headingH1: false,
        headingH2: false,
        listBullet: false,
        listNumbered: false,
    });

    const updateToolbarState = useCallback(() => {
        editor.getEditorState().read(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) {
                setActiveFormats({
                    bold: false,
                    italic: false,
                    underline: false,
                    strikethrough: false,
                    quote: false,
                    headingH1: false,
                    headingH2: false,
                    listBullet: false,
                    listNumbered: false,
                });
                return;
            }

            const anchorNode = selection.anchor.getNode();
            const topLevel = anchorNode.getKey() === 'root' ? anchorNode : anchorNode.getTopLevelElementOrThrow();
            const topTag = typeof (topLevel as any).getTag === 'function' ? String((topLevel as any).getTag()) : '';
            const nearestList = $isListNode(topLevel as any) ? (topLevel as any) : $getNearestNodeOfType(anchorNode, ListNode);
            const listType = nearestList?.getListType?.() ?? null;

            setActiveFormats({
                bold: selection.hasFormat('bold'),
                italic: selection.hasFormat('italic'),
                underline: selection.hasFormat('underline'),
                strikethrough: selection.hasFormat('strikethrough'),
                quote: topLevel instanceof QuoteNode,
                headingH1: topTag === 'h1',
                headingH2: topTag === 'h2',
                listBullet: listType === 'bullet',
                listNumbered: listType === 'number',
            });
        });
    }, [editor]);

    useEffect(() => {
        updateToolbarState();
        const unregisterUpdate = editor.registerUpdateListener(() => {
            updateToolbarState();
        });
        const unregisterSelection = editor.registerCommand(
            SELECTION_CHANGE_COMMAND,
            () => {
                updateToolbarState();
                return false;
            },
            COMMAND_PRIORITY_LOW,
        );
        return () => {
            unregisterUpdate();
            unregisterSelection();
        };
    }, [editor, updateToolbarState]);

    const format = (kind: 'bold' | 'italic' | 'underline' | 'strikethrough' | 'highlight') => {
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, kind);
    };

    const setHeading = (tag: 'h1' | 'h2') => {
        editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
                const anchorNode = selection.anchor.getNode();
                const topLevel = anchorNode.getKey() === 'root' ? anchorNode : anchorNode.getTopLevelElementOrThrow();
                const topTag = typeof (topLevel as any).getTag === 'function' ? String((topLevel as any).getTag()) : '';
                if (topTag === tag) {
                    $setBlocksType(selection, () => $createParagraphNode());
                    return;
                }
                $setBlocksType(selection, () => new HeadingNode(tag));
            }
        });
    };

    const setQuote = () => {
        editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
                $setBlocksType(selection, () => $createQuoteNode());
            }
        });
    };

    const insertCodeBlock = () => {
        editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
                const code = $createCodeNode();
                code.append($createParagraphNode());
                selection.insertNodes([code]);
            }
        });
    };

    const insertImage = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;
            const alt = file.name.replace(/\.[^.]+$/, '');
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result ?? ''));
                reader.onerror = () => reject(reader.error || new Error('Failed to read image'));
                reader.readAsDataURL(file);
            }).catch((error) => {
                window.alert(error instanceof Error ? error.message : 'Could not read image file');
                return '';
            });
            if (!dataUrl) return;
            const initialWidthPx = await estimateInitialImageWidthPx(dataUrl, editor.getRootElement());

            editor.update(() => {
                let selection = $getSelection();
                if (!$isRangeSelection(selection)) {
                    $getRoot().selectEnd();
                    selection = $getSelection();
                }
                if ($isRangeSelection(selection)) {
                    selection.insertNodes([$createImageNode(dataUrl, alt, initialWidthPx, 'none', '')]);
                }
            });
        };
        input.click();
    };

    return (
        <div
            className={
                appearance === 'embedded'
                    ? 'editor-toolbar-embedded flex shrink-0 flex-wrap items-center gap-1 p-2'
                    : 'editor-toolbar-default flex shrink-0 flex-wrap items-center gap-1 p-2'
            }
        >
            <ToolbarIcon title="Bold" onClick={() => format('bold')} appearance={appearance} active={activeFormats.bold}>
                <Bold size={18}/>
            </ToolbarIcon>
            <ToolbarIcon title="Italic" onClick={() => format('italic')} appearance={appearance} active={activeFormats.italic}>
                <Italic size={18}/>
            </ToolbarIcon>
            <ToolbarIcon title="Underline" onClick={() => format('underline')} appearance={appearance} active={activeFormats.underline}>
                <Underline size={18}/>
            </ToolbarIcon>
            <ToolbarIcon title="Strikethrough" onClick={() => format('strikethrough')} appearance={appearance} active={activeFormats.strikethrough}>
                <Strikethrough size={18}/>
            </ToolbarIcon>
            <ToolbarIcon title="Highlight" onClick={() => format('highlight')} appearance={appearance}>
                <Highlighter size={18}/>
            </ToolbarIcon>
            <div className="editor-toolbar-divider mx-1 h-5 w-px"/>
            <ToolbarIcon title="H1" onClick={() => setHeading('h1')} appearance={appearance} active={activeFormats.headingH1}>
                <Heading1 size={18}/>
            </ToolbarIcon>
            <ToolbarIcon title="H2" onClick={() => setHeading('h2')} appearance={appearance} active={activeFormats.headingH2}>
                <Heading2 size={18}/>
            </ToolbarIcon>
            <ToolbarIcon title="Quote" onClick={setQuote} appearance={appearance} active={activeFormats.quote}>
                <MessageSquareQuote size={18}/>
            </ToolbarIcon>
            <div className="editor-toolbar-divider mx-1 h-5 w-px"/>
            <ToolbarIcon
                title="Bulleted list"
                onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)}
                appearance={appearance}
                active={activeFormats.listBullet}
            >
                <List size={18}/>
            </ToolbarIcon>
            <ToolbarIcon
                title="Numbered list"
                onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)}
                appearance={appearance}
                active={activeFormats.listNumbered}
            >
                <ListOrdered size={18}/>
            </ToolbarIcon>
            <ToolbarIcon
                title="Remove list"
                onClick={() => editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined)}
                appearance={appearance}
            >
                <ListX size={18}/>
            </ToolbarIcon>
            <div className="editor-toolbar-divider mx-1 h-5 w-px"/>
            <ToolbarIcon title="Insert image" onClick={insertImage} appearance={appearance}>
                <ImagePlus size={18}/>
            </ToolbarIcon>
            <ToolbarIcon title="Code block" onClick={insertCodeBlock} appearance={appearance}>
                <Code size={18}/>
            </ToolbarIcon>
            <ToolbarIcon title="Horizontal rule" onClick={() => editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)} appearance={appearance}>
                <SeparatorHorizontal size={18}/>
            </ToolbarIcon>
        </div>
    );
}

function ToolbarIcon({
                        title,
                        onClick,
                        children,
                        appearance = 'default',
                        active = false,
                    }: {
    title: string;
    onClick: () => void;
    children: React.ReactNode;
    appearance?: 'default' | 'embedded';
    active?: boolean;
}) {
    return (
        <Button
            type="button"
            title={title}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onClick}
            className={
                `${appearance === 'embedded' ? 'editor-toolbar-control-embedded editor-toolbar-button-embedded' : 'editor-toolbar-control-default editor-toolbar-button-default'} editor-toolbar-control editor-toolbar-button ${active ? 'is-active' : ''}`
            }
        >
            {children}
        </Button>
    );
}

export default function HtmlLexicalEditor({
                                              value,
                                              placeholder,
                                              onChange,
                                              appearance = 'default',
                                              onDropNonImageFiles,
                                          }: HtmlLexicalEditorProps) {
    const lastInternalHtmlRef = useRef('');
    const lastInternalPlainRef = useRef('');
    const [isFileDragActive, setIsFileDragActive] = useState(false);
    const defaultSettings = useMemo(() => createDefaultAppSettings(), []);
    const {appSettings} = useAppSettings(defaultSettings);
    const initialConfig = useMemo(
        () => ({
            namespace: 'llamamail-html-editor',
            theme: editorTheme,
            onError: (error: Error) => {
                throw error;
            },
            nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, AutoLinkNode, CodeNode, ImageNode, HorizontalRuleNode],
        }),
        [],
    );

    return (
        <LexicalComposer initialConfig={initialConfig}>
            <div className="flex h-full w-full flex-col">
                <ToolbarPlugin appearance={appearance}/>
                <div className="relative min-h-0 flex-1">
                    <RichTextPlugin
                        contentEditable={
                            <ContentEditable
                                spellCheck={Boolean(appSettings.spellcheckEnabled)}
                                className={
                                    appearance === 'embedded'
                                        ? 'editor-content editor-content-embedded editor-content-shell lexical-editor-input'
                                        : 'editor-content editor-content-default editor-content-shell lexical-editor-input'
                                }
                            />
                        }
                        placeholder={
                            <div className="editor-placeholder editor-placeholder-shell">
                                {placeholder || 'Write...'}
                            </div>
                        }
                        ErrorBoundary={LexicalErrorBoundary}
                    />
                    {isFileDragActive && (
                        <div className="editor-drop-overlay editor-drop-overlay-shell">
                            Drop files: images insert inline, other files attach
                        </div>
                    )}
                </div>
                <HistoryPlugin/>
                <TabIndentationPlugin/>
                <ListPlugin/>
                <LinkPlugin/>
                <AutoLinkPlugin matchers={AUTO_LINK_MATCHERS}/>
                <HorizontalRulePlugin/>
                <ImageDnDPlugin/>
                <FileDropPlugin
                    onDropNonImageFiles={onDropNonImageFiles}
                    onFileDragStateChange={setIsFileDragActive}
                />
                <ExternalHtmlSyncPlugin value={value} lastInternalHtmlRef={lastInternalHtmlRef}/>
                <OnChangePlugin
                    onChange={(editorState, editor, tags) => {
                        if (tags.has('external-html-sync')) return;
                        editorState.read(() => {
                            const html = toInlineEmailHtml($generateHtmlFromNodes(editor, null));
                            const plain = $getRoot().getTextContent();
                            if (
                                html === lastInternalHtmlRef.current &&
                                plain === lastInternalPlainRef.current
                            ) {
                                return;
                            }
                            lastInternalHtmlRef.current = html;
                            lastInternalPlainRef.current = plain;
                            onChange(html, plain);
                        });
                    }}
                />
            </div>
        </LexicalComposer>
    );
}

function FileDropPlugin({
                            onDropNonImageFiles,
                            onFileDragStateChange,
                        }: {
    onDropNonImageFiles?: (files: File[]) => void;
    onFileDragStateChange?: (active: boolean) => void;
}) {
    const [editor] = useLexicalComposerContext();

    useEffect(() => {
        const root = editor.getRootElement();
        if (!root) return;
        let dragDepth = 0;

        const setDragState = (active: boolean) => onFileDragStateChange?.(active);
        const resetDragState = () => {
            dragDepth = 0;
            setDragState(false);
        };
        const hasInternalImageDragType = (dt: DataTransfer | null): boolean =>
            Boolean(dt && Array.from(dt.types || []).includes('application/x-llamamail-image'));

        const hasExternalFiles = (event: DragEvent | ClipboardEvent) => {
            const dt = 'dataTransfer' in event ? event.dataTransfer : event.clipboardData;
            if (!dt) return false;
            if (hasInternalImageDragType(dt)) return false;
            const types = Array.from(dt.types || []);
            if (types.includes('Files')) return true;
            const files = extractFilesFromDataTransfer(dt);
            return files.length > 0;
        };

        const onDragEnter = (event: DragEvent) => {
            if (!hasExternalFiles(event)) return;
            event.preventDefault();
            dragDepth += 1;
            setDragState(true);
        };

        const onDragLeave = (event: DragEvent) => {
            if (dragDepth === 0 && !hasExternalFiles(event)) return;
            event.preventDefault();
            dragDepth = Math.max(0, dragDepth - 1);
            if (dragDepth === 0) setDragState(false);
        };

        const onDragOver = (event: DragEvent) => {
            if (!hasExternalFiles(event)) return;
            event.preventDefault();
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = 'copy';
            }
            if (!isPointInRect(event.clientX, event.clientY, root.getBoundingClientRect())) {
                resetDragState();
            }
        };

        const onDrop = (event: DragEvent) => {
            const dropped = extractFilesFromDataTransfer(event.dataTransfer);
            if (hasInternalImageDragType(event.dataTransfer)) return;
            if (!dropped.length) return;
            resetDragState();
            event.preventDefault();
            event.stopPropagation();
            if (!dropped.length) return;

            const imageFiles: File[] = [];
            const nonImageFiles: File[] = [];
            for (const file of dropped) {
                if (isImageDropFile(file)) {
                    imageFiles.push(file);
                } else {
                    nonImageFiles.push(file);
                }
            }

            if (imageFiles.length > 0) {
                void insertDroppedImages(editor, imageFiles, event.clientX, event.clientY);
            }
            if (nonImageFiles.length > 0) {
                void Promise.resolve(onDropNonImageFiles?.(nonImageFiles));
            }
        };

        const onPaste = (event: ClipboardEvent) => {
            if (!hasExternalFiles(event)) return;
            const items = Array.from(event.clipboardData?.items ?? []);
            const imageFiles = items
                .filter((item) => item.kind === 'file' && item.type.toLowerCase().startsWith('image/'))
                .map((item) => item.getAsFile())
                .filter((file): file is File => Boolean(file));
            if (!imageFiles.length) return;
            event.preventDefault();
            void insertDroppedImages(editor, imageFiles);
        };

        const onWindowDropOrEnd = () => resetDragState();

        root.addEventListener('dragenter', onDragEnter);
        root.addEventListener('dragleave', onDragLeave);
        root.addEventListener('dragover', onDragOver);
        root.addEventListener('drop', onDrop);
        root.addEventListener('paste', onPaste);
        window.addEventListener('drop', onWindowDropOrEnd);
        window.addEventListener('dragend', onWindowDropOrEnd);
        return () => {
            root.removeEventListener('dragenter', onDragEnter);
            root.removeEventListener('dragleave', onDragLeave);
            root.removeEventListener('dragover', onDragOver);
            root.removeEventListener('drop', onDrop);
            root.removeEventListener('paste', onPaste);
            window.removeEventListener('drop', onWindowDropOrEnd);
            window.removeEventListener('dragend', onWindowDropOrEnd);
            resetDragState();
        };
    }, [editor, onDropNonImageFiles, onFileDragStateChange]);

    return null;
}

async function insertDroppedImages(
    editor: LexicalEditor,
    files: File[],
    clientX?: number,
    clientY?: number,
): Promise<void> {
    const rootElement = editor.getRootElement();
    const prepared = await Promise.all(
        files.map(async (file) => {
            const dataUrl = await readFileAsDataUrl(file).catch(() => '');
            if (!dataUrl) return null;
            const alt = file.name.replace(/\.[^.]+$/, '');
            const widthPx = await estimateInitialImageWidthPx(dataUrl, rootElement);
            return {dataUrl, alt, widthPx};
        }),
    );
    const images = prepared.filter((item): item is { dataUrl: string; alt: string; widthPx: number } => Boolean(item));
    if (!images.length) return;

    editor.update(() => {
        const drop = Number.isFinite(clientX) && Number.isFinite(clientY) ? getDropRangeAtPoint(clientX!, clientY!) : null;
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

        let selection = $getSelection();
        if (!$isRangeSelection(selection)) {
            $getRoot().selectEnd();
            selection = $getSelection();
        }
        if ($isRangeSelection(selection)) {
            selection.insertNodes(images.map((image) => $createImageNode(image.dataUrl, image.alt, image.widthPx, 'none', '')));
        }
    });
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

function isPointInRect(x: number, y: number, rect: DOMRect): boolean {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function isImageDropFile(file: File): boolean {
    const type = String(file.type || '').toLowerCase();
    if (type.startsWith('image/')) return true;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico'].includes(ext);
}

function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('Failed to read dropped image.'));
        reader.readAsDataURL(file);
    });
}

function extractFilesFromDataTransfer(dataTransfer: DataTransfer | null): File[] {
    if (!dataTransfer) return [];
    const directFiles = Array.from(dataTransfer.files || []);
    if (directFiles.length > 0) return directFiles;
    const filesFromItems = Array.from(dataTransfer.items || [])
        .filter((item) => item.kind === 'file')
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
    return filesFromItems;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function estimateInitialImageWidthPx(dataUrl: string, rootElement: HTMLElement | null): Promise<number> {
    const editorWidth = Math.max(1, rootElement?.clientWidth ?? 800);
    const intrinsicWidth = await new Promise<number>((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image.naturalWidth || editorWidth);
        image.onerror = () => resolve(editorWidth);
        image.src = dataUrl;
    });
    return Math.max(24, Math.min(editorWidth, Math.round(intrinsicWidth)));
}

function toInlineEmailHtml(inputHtml: string): string {
    const html = toHtmlDocument(inputHtml);
    if (!html.trim()) return '';
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const applyStyle = (el: Element, style: string) => {
        const existing = el.getAttribute('style');
        if (!existing) {
            el.setAttribute('style', style);
            return;
        }
        if (existing.includes(style)) return;
        el.setAttribute('style', `${existing}; ${style}`);
    };

    doc.querySelectorAll('p').forEach((el) => applyStyle(el, 'margin:0 0 12px 0; line-height:1.55;'));
    doc.querySelectorAll('blockquote').forEach((el) =>
        applyStyle(el, 'margin:0 0 12px 0; padding-left:12px; border-left:3px solid var(--content-border); color:var(--content-muted);'),
    );
    doc.querySelectorAll('ul').forEach((el) => applyStyle(el, 'margin:0 0 12px 22px; padding:0;'));
    doc.querySelectorAll('ol').forEach((el) => applyStyle(el, 'margin:0 0 12px 22px; padding:0;'));
    doc.querySelectorAll('li').forEach((el) => applyStyle(el, 'margin:0 0 6px 0;'));
    doc.querySelectorAll('a').forEach((el) => applyStyle(el, 'color:var(--color-link); text-decoration:underline;'));
    doc.querySelectorAll('pre').forEach((el) =>
        applyStyle(el, 'margin:0 0 12px 0; white-space:pre-wrap; word-break:break-word; font-family:ui-monospace, SFMono-Regular, Menlo, monospace;'),
    );
    doc.querySelectorAll('code').forEach((el) =>
        applyStyle(el, 'font-family:ui-monospace, SFMono-Regular, Menlo, monospace; background:var(--state-hover); padding:1px 4px; border-radius:4px;'),
    );
    doc.querySelectorAll('img').forEach((el) => {
        const align = String(el.getAttribute('data-llamamail-align') || '').toLowerCase().trim();
        if (align === 'left') {
            applyStyle(el, 'float:left; margin:0 1rem 0.75rem 0;');
        } else if (align === 'right') {
            applyStyle(el, 'float:right; margin:0 0 0.75rem 1rem;');
        } else if (align === 'center') {
            applyStyle(el, 'float:none; margin:0 auto 0.75rem;');
        } else {
            applyStyle(el, 'float:none; margin:0.5rem 0 0.75rem;');
        }
        applyStyle(el, 'max-width:100%; height:auto; display:block;');
        if (!el.getAttribute('alt')) el.setAttribute('alt', '');
    });
    doc.querySelectorAll('hr').forEach((el) =>
        applyStyle(el, 'border:0; border-top:1px solid var(--content-border); margin:12px 0;'),
    );
    doc.querySelectorAll('h1').forEach((el) => applyStyle(el, 'margin:0 0 12px 0; font-size:28px; line-height:1.25;'));
    doc.querySelectorAll('h2').forEach((el) => applyStyle(el, 'margin:0 0 12px 0; font-size:24px; line-height:1.3;'));
    doc.querySelectorAll('h3').forEach((el) => applyStyle(el, 'margin:0 0 10px 0; font-size:20px; line-height:1.35;'));

    const body = doc.body.innerHTML.trim();
    return body || html;
}
