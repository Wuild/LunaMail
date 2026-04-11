import React, {useEffect, useRef, useState} from 'react';
import {ipcClient} from '@renderer/lib/ipcClient';
import type {ComposeAttachment} from './types';

type UseComposeAttachmentsParams = {
    setStatus: React.Dispatch<React.SetStateAction<string | null>>;
};

export function useComposeAttachments({setStatus}: UseComposeAttachmentsParams) {
    const [attachments, setAttachments] = useState<ComposeAttachment[]>([]);
    const [windowDragActive, setWindowDragActive] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const windowDragDepthRef = useRef(0);

    function appendAttachments(next: ComposeAttachment[]) {
        if (!next.length) return;
        setAttachments((prev) => {
            const seen = new Set(prev.map((attachment) => attachment.id));
            const merged = [...prev];
            for (const row of next) {
                if (seen.has(row.id)) continue;
                merged.push(row);
                seen.add(row.id);
            }
            return merged;
        });
    }

    async function appendDroppedFilesAsAttachments(files: File[]) {
        if (!files.length) return;
        const resolved = await Promise.all(
            files.map(async (file) => ({
                file,
                path: String(ipcClient.getPathForFile(file) || (file as any).path || '').trim(),
            })),
        );
        const next: ComposeAttachment[] = [];
        let skippedCount = 0;
        for (const item of resolved) {
            if (!item.path) {
                skippedCount += 1;
                continue;
            }
            next.push({
                id: item.path,
                path: item.path,
                filename: item.file.name || 'attachment',
                contentType: item.file.type || null,
                size: Number.isFinite(item.file.size) ? item.file.size : null,
            });
        }
        appendAttachments(next);
        if (skippedCount > 0) {
            setStatus(`Skipped ${skippedCount} dropped file${skippedCount > 1 ? 's' : ''} (no local file path).`);
        }
    }

    async function onDropNonImageFiles(files: File[]) {
        await appendDroppedFilesAsAttachments(files);
    }

    function isExternalDesktopFileDrag(dataTransfer: DataTransfer | null): boolean {
        if (!dataTransfer) return false;
        const types = Array.from(dataTransfer.types || []);
        if (types.includes('application/x-llamamail-image')) return false;
        if (types.includes('Files')) return true;
        if (Array.from(dataTransfer.files || []).length > 0) return true;
        return Array.from(dataTransfer.items || []).some((item) => item.kind === 'file');
    }

    function extractFilesFromDataTransfer(dataTransfer: DataTransfer | null): File[] {
        if (!dataTransfer) return [];
        const directFiles = Array.from(dataTransfer.files || []);
        if (directFiles.length > 0) return directFiles;
        return Array.from(dataTransfer.items || [])
            .filter((item) => item.kind === 'file')
            .map((item) => item.getAsFile())
            .filter((file): file is File => Boolean(file));
    }

    useEffect(() => {
        const resetWindowDragState = () => {
            windowDragDepthRef.current = 0;
            setWindowDragActive(false);
        };
        const captureOptions: AddEventListenerOptions = {capture: true};
        window.addEventListener('drop', resetWindowDragState, captureOptions);
        window.addEventListener('dragend', resetWindowDragState, captureOptions);
        return () => {
            window.removeEventListener('drop', resetWindowDragState, captureOptions);
            window.removeEventListener('dragend', resetWindowDragState, captureOptions);
        };
    }, []);

    function onFallbackInputChange(event: React.ChangeEvent<HTMLInputElement>) {
        const files = Array.from(event.target.files ?? []);
        const next: ComposeAttachment[] = files
            .map((file) => {
                const filePath = String((file as any).path || '').trim();
                if (!filePath) return null;
                return {
                    id: filePath,
                    path: filePath,
                    filename: file.name || 'attachment',
                    contentType: file.type || null,
                    size: Number.isFinite(file.size) ? file.size : null,
                };
            })
            .filter((item): item is ComposeAttachment => Boolean(item));
        appendAttachments(next);
        event.target.value = '';
    }

    async function onPickAttachments() {
        try {
            const picked = await ipcClient.pickComposeAttachments();
            if (!picked.length) return;
            const next: ComposeAttachment[] = picked.map((item) => ({
                id: item.path,
                path: item.path,
                filename: item.filename || 'attachment',
                contentType: item.contentType || null,
                size: null,
            }));
            appendAttachments(next);
        } catch (e: any) {
            fileInputRef.current?.click();
            setStatus(`Attachment picker failed: ${e?.message || String(e)}`);
        }
    }

    function removeAttachment(id: string) {
        setAttachments((prev) => prev.filter((attachment) => attachment.id !== id));
    }

    return {
        attachments,
        fileInputRef,
        windowDragActive,
        onDropNonImageFiles,
        onFallbackInputChange,
        onPickAttachments,
        appendAttachments,
        removeAttachment,
        onRootDragEnterCapture: (event: React.DragEvent<HTMLDivElement>) => {
            if (!isExternalDesktopFileDrag(event.dataTransfer)) return;
            event.preventDefault();
            windowDragDepthRef.current += 1;
            setWindowDragActive(true);
        },
        onRootDragOverCapture: (event: React.DragEvent<HTMLDivElement>) => {
            if (!isExternalDesktopFileDrag(event.dataTransfer)) return;
            event.preventDefault();
            if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
            if (!windowDragActive) setWindowDragActive(true);
        },
        onRootDragLeaveCapture: (event: React.DragEvent<HTMLDivElement>) => {
            if (!windowDragActive) return;
            if (!isExternalDesktopFileDrag(event.dataTransfer) && windowDragDepthRef.current === 0) return;
            event.preventDefault();
            windowDragDepthRef.current = Math.max(0, windowDragDepthRef.current - 1);
            if (windowDragDepthRef.current === 0) {
                setWindowDragActive(false);
            }
        },
        onRootDrop: (event: React.DragEvent<HTMLDivElement>) => {
            const files = extractFilesFromDataTransfer(event.dataTransfer);
            const isExternalDrop = isExternalDesktopFileDrag(event.dataTransfer) || files.length > 0;
            if (!isExternalDrop) return;
            event.preventDefault();
            windowDragDepthRef.current = 0;
            setWindowDragActive(false);
            event.stopPropagation();
            if (!files.length) return;
            void appendDroppedFilesAsAttachments(files);
        },
    };
}
