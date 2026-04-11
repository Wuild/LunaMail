import {Button} from '@renderer/components/ui/button';
import {formatBytes} from '@renderer/lib/format';
import {Paperclip} from 'lucide-react';

type MessageAttachment = {
    filename: string | null;
    contentType: string | null;
    size: number | null;
};

type MessageBodyPaneProps = {
    loading: boolean;
    loadingLabel?: string;
    iframeSrcDoc: string | null;
    plainText: string | null | undefined;
    iframeTitle: string;
    showRemoteContentWarning: boolean;
    onLoadRemoteOnce?: () => void;
    onAllowRemoteForSender?: () => void;
    onRequestCloseOverlays?: () => void;
    onMessageFramePointerEnter?: () => void;
    onMessageFramePointerLeave?: () => void;
    attachments: MessageAttachment[];
    onOpenAttachmentMenu: (index: number, x: number, y: number) => void;
    emptyBodyLabel?: string;
};

export function MessageBodyPane({
                                    loading,
                                    loadingLabel = 'Loading message body...',
                                    iframeSrcDoc,
                                    plainText,
                                    iframeTitle,
                                    showRemoteContentWarning,
                                    onLoadRemoteOnce,
                                    onAllowRemoteForSender,
                                    onRequestCloseOverlays,
                                    onMessageFramePointerEnter,
                                    onMessageFramePointerLeave,
                                    attachments,
                                    onOpenAttachmentMenu,
                                    emptyBodyLabel = 'No body content available for this message.',
                                }: MessageBodyPaneProps) {
    return (
        <>
            <div className="ui-surface-card min-h-0 flex flex-1 flex-col">
                {showRemoteContentWarning && (
                    <div className="notice-warning w-full shrink-0 border-b px-4 py-2 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                            <span>Remote content blocked for privacy.</span>
                            {onLoadRemoteOnce && (
                                <Button
                                    type="button"
                                    className="notice-button-warning rounded px-2 py-1 text-[11px] font-medium"
                                    onClick={onLoadRemoteOnce}
                                >
                                    Load once
                                </Button>
                            )}
                            {onAllowRemoteForSender && (
                                <Button
                                    type="button"
                                    className="notice-button-warning rounded px-2 py-1 text-[11px] font-medium"
                                    onClick={onAllowRemoteForSender}
                                >
                                    Always allow sender
                                </Button>
                            )}
                        </div>
                    </div>
                )}
                <div className="min-h-0 flex-1">
                    {loading && (
                        <div className="ui-text-muted flex h-full items-center justify-center">
                            {loadingLabel}
                        </div>
                    )}
                    {!loading && iframeSrcDoc && (
                        <iframe
                            title={iframeTitle}
                            srcDoc={iframeSrcDoc}
                            sandbox="allow-popups allow-popups-to-escape-sandbox"
                            className="iframe-surface h-full w-full border-0"
                            onMouseDown={() => {
                                onRequestCloseOverlays?.();
                            }}
                            onContextMenu={(event) => {
                                event.stopPropagation();
                                onRequestCloseOverlays?.();
                            }}
                            onFocus={() => {
                                onRequestCloseOverlays?.();
                            }}
                            onMouseEnter={() => {
                                onMessageFramePointerEnter?.();
                            }}
                            onMouseLeave={() => {
                                onMessageFramePointerLeave?.();
                            }}
                        />
                    )}
                    {!loading && !iframeSrcDoc && (
                        <div className="ui-surface-card h-full overflow-auto p-4 ui-text-primary">
							<pre
                                className="select-text whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
								{plainText || emptyBodyLabel}
							</pre>
                        </div>
                    )}
                </div>
            </div>
            {!loading && attachments.length > 0 && (
                <div
                    className="shrink-0 border-t ui-border-default bg-[color-mix(in_srgb,var(--surface-content)_80%,transparent)] px-4 py-3">
                    <div className="overflow-x-auto overflow-y-hidden">
                        <div className="flex min-w-full w-max gap-2 pb-1">
                            {attachments.map((attachment, index) => (
                                <Button
                                    key={`${attachment.filename || 'attachment'}-${index}`}
                                    type="button"
                                    variant="outline"
                                    className="group flex w-[17rem] shrink-0 items-center gap-2 rounded-lg p-2 text-left text-xs"
                                    title={attachment.filename || 'Attachment'}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onOpenAttachmentMenu(index, event.clientX, event.clientY);
                                    }}
                                    onContextMenu={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        onOpenAttachmentMenu(index, event.clientX, event.clientY);
                                    }}
                                >
									<span
                                        className="attachment-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ui-border-default ui-text-muted">
										<Paperclip size={15}/>
									</span>
                                    <span className="min-w-0 flex-1">
										<span className="block truncate font-medium">
											{attachment.filename || 'Attachment'}
										</span>
										<span className="ui-text-muted block truncate text-[11px]">
											{attachment.contentType || 'FILE'}
                                            {typeof attachment.size === 'number' ? ` • ${formatBytes(attachment.size)}` : ''}
										</span>
									</span>
                                </Button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
