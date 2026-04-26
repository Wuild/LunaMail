import React from 'react';
import type {FolderItem} from '@preload';
import {Button} from '@llamamail/ui/button';
import {FormInput, FormSelect} from '@llamamail/ui/form';
import {Modal, ModalBody, ModalDescription, ModalFooter, ModalHeader, ModalTitle} from '@llamamail/ui/modal';
import {cn} from '@llamamail/ui/utils';
import {X} from '@llamamail/ui/icon';
import {useI18n} from '@llamamail/app/i18n/renderer';

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
	const {t} = useI18n();
	if (!editor) return null;

	return (
		<Modal open onClose={onClose} contentClassName="max-w-md rounded-2xl p-5">
			<ModalHeader className="ui-border-default border-b pb-3">
				<div className="min-w-0 flex-1">
					<ModalTitle className="text-lg">{t('mail_components.edit_folder.title')}</ModalTitle>
					<ModalDescription className="ui-text-muted mt-1 text-xs">{editor.folder.path}</ModalDescription>
				</div>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="h-8 w-8 rounded-md"
					onClick={onClose}
					title={t('mail_components.common.close')}
					aria-label={t('mail_components.edit_folder.close_aria')}
				>
					<X size={14} />
				</Button>
			</ModalHeader>

			<ModalBody className="space-y-3">
				<label className="block text-sm">
					<span className="ui-text-secondary mb-1 block font-medium">
						{t('mail_components.edit_folder.display_name')}
					</span>
					<FormInput value={editor.customName} onChange={(event) => onCustomNameChange(event.target.value)} />
				</label>

				<label className="block text-sm">
					<span className="ui-text-secondary mb-1 block font-medium">
						{t('mail_components.edit_folder.folder_type')}
					</span>
					<FormSelect value={editor.type} onChange={(event) => onTypeChange(event.target.value)}>
						{typeOptions.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</FormSelect>
				</label>

				<label className="block text-sm">
					<span className="ui-text-secondary mb-1 block font-medium">
						{t('mail_components.edit_folder.folder_color')}
					</span>
					<div className="swatch-grid grid grid-cols-4 gap-2 rounded-md p-2">
						{colorOptions.map((option) => (
							<Button
								key={option.value}
								type="button"
								onClick={() => onColorChange(option.value)}
								className={cn(
									'swatch-option flex items-center gap-2 rounded-md px-2 py-1.5 text-xs',
									editor.color === option.value && 'is-selected',
								)}
								title={option.label}
								aria-label={t('mail_components.create_folder.set_folder_color', {label: option.label})}
							>
								<span
									className={cn(
										'swatch-dot inline-flex h-3.5 w-3.5 shrink-0 rounded-full',
										getFolderSwatchClass(option.value),
									)}
								/>
								<span className="truncate">{option.label}</span>
							</Button>
						))}
					</div>
				</label>
			</ModalBody>

			{error && <p className="text-danger mt-3 text-sm">{error}</p>}

			<ModalFooter className="mt-5">
				<Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>
					{t('mail_components.common.cancel')}
				</Button>
				<Button type="button" variant="default" size="sm" onClick={onSave} disabled={saving}>
					{saving ? t('mail_components.common.saving') : t('mail_components.common.save')}
				</Button>
			</ModalFooter>
		</Modal>
	);
}
