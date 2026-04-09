import React from 'react';
import type {FolderItem} from '../../../preload';
import {Button} from '../ui/button';
import {FormInput, FormSelect} from '../ui/FormControls';
import {cn} from '../../lib/utils';

type Option = {
    value: string;
    label: string;
};

type FolderEditorState = {
    folder: FolderItem;
    customName: string;
    type: string;
    color: string;
};

type FolderEditModalProps = {
    editor: FolderEditorState | null;
    saving: boolean;
    error: string | null;
    typeOptions: Option[];
    colorOptions: Option[];
    getFolderSwatchClass: (color: string) => string;
    onClose: () => void;
    onSave: () => void;
    onCustomNameChange: (value: string) => void;
    onTypeChange: (value: string) => void;
    onColorChange: (value: string) => void;
};

export default function FolderEditModal({
                                            editor,
                                            saving,
                                            error,
                                            typeOptions,
                                            colorOptions,
                                            getFolderSwatchClass,
                                            onClose,
                                            onSave,
                                            onCustomNameChange,
                                            onTypeChange,
                                            onColorChange,
                                        }: FolderEditModalProps) {
    if (!editor) return null;

    return (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-slate-900/45 p-4" onClick={onClose}>
            <div
                className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-[#3a3d44] dark:bg-[#313338]"
                onClick={(event) => event.stopPropagation()}
            >
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Edit Folder</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{editor.folder.path}</p>

                <div className="mt-4 space-y-3">
                    <label className="block text-sm">
                        <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Display name</span>
                        <FormInput
                            value={editor.customName}
                            onChange={(event) => onCustomNameChange(event.target.value)}
                        />
                    </label>

                    <label className="block text-sm">
                        <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Folder type</span>
                        <FormSelect
                            value={editor.type}
                            onChange={(event) => onTypeChange(event.target.value)}
                        >
                            {typeOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </FormSelect>
                    </label>

                    <label className="block text-sm">
                        <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Folder color</span>
                        <div
                            className="grid grid-cols-4 gap-2 rounded-md border border-slate-300 bg-white p-2 dark:border-[#3a3d44] dark:bg-[#1e1f22]">
                            {colorOptions.map((option) => (
                                <Button
                                    key={option.value}
                                    type="button"
                                    onClick={() => onColorChange(option.value)}
                                    className={cn(
                                        'flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors',
                                        editor.color === option.value
                                            ? 'border-slate-700 bg-slate-100 text-slate-900 dark:border-slate-200 dark:bg-[#2b2e34] dark:text-slate-100'
                                            : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-[#3a3d44] dark:text-slate-300 dark:hover:bg-[#2b2e34]',
                                    )}
                                    title={option.label}
                                    aria-label={`Set folder color ${option.label}`}
                                >
									<span
                                        className={cn(
                                            'inline-flex h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/15',
                                            getFolderSwatchClass(option.value),
                                        )}
                                    />
                                    <span className="truncate">{option.label}</span>
                                </Button>
                            ))}
                        </div>
                    </label>
                </div>

                {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

                <div className="mt-5 flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose} disabled={saving}>
                        Cancel
                    </Button>
                    <Button onClick={onSave} disabled={saving}>
                        {saving ? 'Saving...' : 'Save'}
                    </Button>
                </div>
            </div>
        </div>
    );
}
