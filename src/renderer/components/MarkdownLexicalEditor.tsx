import React, {useEffect, useMemo} from 'react';
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
import {$setBlocksType} from '@lexical/selection';
import {HeadingNode, QuoteNode} from '@lexical/rich-text';
import {
    INSERT_CHECK_LIST_COMMAND,
    INSERT_ORDERED_LIST_COMMAND,
    INSERT_UNORDERED_LIST_COMMAND,
    ListItemNode,
    ListNode,
    REMOVE_LIST_COMMAND
} from '@lexical/list';
import {AutoLinkNode, LinkNode} from '@lexical/link';
import {$generateHtmlFromNodes, $generateNodesFromDOM} from '@lexical/html';
import {$createCodeNode, CodeNode} from '@lexical/code';
import {
    $createParagraphNode,
    $getRoot,
    $getSelection,
    $isRangeSelection,
    FORMAT_TEXT_COMMAND,
    type LexicalEditor,
} from 'lexical';
import {
    Bold,
    Heading1,
    Heading2,
    Highlighter,
    ImagePlus,
    Italic,
    List,
    ListChecks,
    ListOrdered,
    ListX,
    MessageSquareQuote,
    Minus,
    Pilcrow,
    Strikethrough,
    Underline,
} from 'lucide-react';
import {$createImageNode, ImageNode} from './lexical/ImageNode';

interface MarkdownLexicalEditorProps {
    value: string;
    placeholder?: string;
    onChange: (html: string, plainText: string) => void;
}

const editorTheme = {
    paragraph: 'mb-2',
    quote: 'border-l-4 border-slate-300 pl-3 italic text-slate-600 dark:border-slate-600 dark:text-slate-300',
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
        code: 'rounded bg-slate-200 px-1 py-0.5 font-mono text-[0.92em] dark:bg-slate-700',
    },
    code: 'block rounded-md bg-slate-100 p-3 font-mono text-sm dark:bg-slate-800',
    link: 'text-sky-600 underline dark:text-sky-400',
};

const AUTO_LINK_MATCHERS = [
    createLinkMatcherWithRegExp(
        /((https?:\/\/)|(www\.))[^\s<]+[^\s<.)!?,:;"']/i,
        (text) => (text.startsWith('http://') || text.startsWith('https://') ? text : `https://${text}`),
    ),
];

function toHtmlDocument(value: string): string {
    const raw = value || '';
    if (!raw.trim()) return '';
    if (/<\/?[a-z][\s\S]*>/i.test(raw)) return raw;
    const escaped = escapeHtml(raw).replace(/\r\n?/g, '\n').replace(/\n/g, '<br/>');
    return `<p>${escaped}</p>`;
}

function applyHtmlToEditor(editor: LexicalEditor, value: string): void {
    const html = toHtmlDocument(value);
    editor.update(() => {
        const root = $getRoot();
        root.clear();
        if (!html.trim()) {
            root.append($createParagraphNode());
            return;
        }
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const nodes = $generateNodesFromDOM(editor, doc);
        if (nodes.length === 0) {
            root.append($createParagraphNode());
            return;
        }
        root.append(...nodes);
    });
}

function ExternalHtmlSyncPlugin({value}: { value: string }) {
    const [editor] = useLexicalComposerContext();

    useEffect(() => {
        let current = '';
        editor.getEditorState().read(() => {
            current = $generateHtmlFromNodes(editor, null).trim();
        });
        const next = toHtmlDocument(value).trim();
        if (current === next) return;
        applyHtmlToEditor(editor, value);
    }, [editor, value]);

    return null;
}

function ToolbarPlugin() {
    const [editor] = useLexicalComposerContext();

    const format = (kind: 'bold' | 'italic' | 'underline' | 'strikethrough' | 'highlight') => {
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, kind);
    };

    const setHeading = (tag: 'h1' | 'h2') => {
        editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
                $setBlocksType(selection, () => new HeadingNode(tag));
            }
        });
    };

    const setParagraph = () => {
        editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
                $setBlocksType(selection, () => $createParagraphNode());
            }
        });
    };

    const setQuote = () => {
        editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
                $setBlocksType(selection, () => new QuoteNode());
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

            editor.update(() => {
                let selection = $getSelection();
                if (!$isRangeSelection(selection)) {
                    $getRoot().selectEnd();
                    selection = $getSelection();
                }
                if ($isRangeSelection(selection)) {
                    selection.insertNodes([$createImageNode(dataUrl, alt)]);
                }
            });
        };
        input.click();
    };

    return (
        <div
            className="flex shrink-0 flex-wrap items-center gap-1 rounded-t-lg border border-slate-300 border-b-0 bg-slate-50 p-2 dark:border-[#3a3d44] dark:bg-[#25272c]">
            <ToolbarIcon title="Bold" onClick={() => format('bold')}><Bold size={18}/></ToolbarIcon>
            <ToolbarIcon title="Italic" onClick={() => format('italic')}><Italic size={18}/></ToolbarIcon>
            <ToolbarIcon title="Underline" onClick={() => format('underline')}><Underline size={18}/></ToolbarIcon>
            <ToolbarIcon title="Strikethrough" onClick={() => format('strikethrough')}><Strikethrough
                size={18}/></ToolbarIcon>
            <ToolbarIcon title="Highlight" onClick={() => format('highlight')}><Highlighter size={18}/></ToolbarIcon>
            <div className="mx-1 h-5 w-px bg-slate-300 dark:bg-[#3a3d44]"/>
            <ToolbarIcon title="H1" onClick={() => setHeading('h1')}><Heading1 size={18}/></ToolbarIcon>
            <ToolbarIcon title="H2" onClick={() => setHeading('h2')}><Heading2 size={18}/></ToolbarIcon>
            <ToolbarIcon title="Paragraph" onClick={setParagraph}><Pilcrow size={18}/></ToolbarIcon>
            <ToolbarIcon title="Quote" onClick={setQuote}><MessageSquareQuote size={18}/></ToolbarIcon>
            <div className="mx-1 h-5 w-px bg-slate-300 dark:bg-[#3a3d44]"/>
            <ToolbarIcon title="Bulleted list"
                         onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)}><List
                size={18}/></ToolbarIcon>
            <ToolbarIcon title="Numbered list"
                         onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)}><ListOrdered
                size={18}/></ToolbarIcon>
            <ToolbarIcon title="Checklist" onClick={() => editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined)}><ListChecks
                size={18}/></ToolbarIcon>
            <ToolbarIcon title="Remove list"
                         onClick={() => editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined)}><ListX
                size={18}/></ToolbarIcon>
            <div className="mx-1 h-5 w-px bg-slate-300 dark:bg-[#3a3d44]"/>
            <ToolbarIcon title="Insert image" onClick={insertImage}><ImagePlus size={18}/></ToolbarIcon>
            <ToolbarIcon title="Code block" onClick={insertCodeBlock}><Minus size={18}/></ToolbarIcon>
        </div>
    );
}

function ToolbarIcon({title, onClick, children}: { title: string; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            title={title}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onClick}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-[#3a3d44] dark:bg-[#1f2125] dark:text-slate-300 dark:hover:bg-[#35373c] dark:hover:text-slate-100"
        >
            {children}
        </button>
    );
}

export default function MarkdownLexicalEditor({value, placeholder, onChange}: MarkdownLexicalEditorProps) {
    const initialConfig = useMemo(
        () => ({
            namespace: 'lunamail-html-editor',
            theme: editorTheme,
            onError: (error: Error) => {
                throw error;
            },
            nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, AutoLinkNode, CodeNode, ImageNode],
        }),
        [],
    );

    return (
        <LexicalComposer initialConfig={initialConfig}>
            <div className="flex h-full w-full flex-col">
                <ToolbarPlugin/>
                <div className="relative min-h-0 flex-1">
                    <RichTextPlugin
                        contentEditable={
                            <ContentEditable
                                className="lexical-editor-input h-full w-full overflow-auto rounded-b-lg border border-slate-300 border-t-0 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none dark:border-[#3a3d44] dark:bg-[#1f2125] dark:text-slate-100"/>
                        }
                        placeholder={
                            <div
                                className="pointer-events-none absolute left-4 top-3 text-sm text-slate-400 dark:text-slate-500">
                                {placeholder || 'Write...'}
                            </div>
                        }
                        ErrorBoundary={LexicalErrorBoundary}
                    />
                </div>
                <HistoryPlugin/>
                <TabIndentationPlugin/>
                <ListPlugin/>
                <LinkPlugin/>
                <AutoLinkPlugin matchers={AUTO_LINK_MATCHERS}/>
                <ExternalHtmlSyncPlugin value={value}/>
                <OnChangePlugin
                    onChange={(editorState, editor) => {
                        editorState.read(() => {
                            const html = $generateHtmlFromNodes(editor, null);
                            const plain = $getRoot().getTextContent();
                            onChange(html, plain);
                        });
                    }}
                />
            </div>
        </LexicalComposer>
    );
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
