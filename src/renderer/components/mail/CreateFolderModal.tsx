import React from 'react';
import {Button} from '@llamamail/ui/button';
import {FormInput, FormSelect} from '@llamamail/ui/form';
import {Modal, ModalBody, ModalFooter, ModalTitle} from '@llamamail/ui/modal';
import {cn} from '@llamamail/ui/utils';
import {useI18n} from '@llamamail/app/i18n/renderer';

type Option = {
	value: string;
	label: string;
};

type CreateFolderState = {
	accountId: number;
	folderPath: string;
	type: string;
	color: string;
};

type CreateFolderModalProps = {
	state: CreateFolderState | null;
	accountLabel: string;
	saving: boolean;
	error: string | null;
	typeOptions: Option[];
	colorOptions: Option[];
	getFolderSwatchClass: (color: string) => string;
	onClose: () => void;
	onCreate: () => void;
	onFolderPathChange: (value: string) => void;
	onTypeChange: (value: string) => void;
	onColorChange: (value: string) => void;
};

export default function CreateFolderModal({
	state,
	accountLabel,
	saving,
	error,
	typeOptions,
	colorOptions,
	getFolderSwatchClass,
	onClose,
	onCreate,
	onFolderPathChange,
	onTypeChange,
	onColorChange,
}: CreateFolderModalProps) {
	const {t} = useI18n();
	if (!state) return null;

	return (
		<Modal open onClose={onClose} contentClassName="max-w-md rounded-2xl p-5">
			<ModalTitle className="text-lg">{t('mail_components.create_folder.title')}</ModalTitle>
			<p className="ui-text-muted mt-1 text-xs">{accountLabel}</p>

			<ModalBody className="space-y-3">
				<label className="block text-sm">
					<span className="ui-text-secondary mb-1 block font-medium">
						{t('mail_components.create_folder.folder_path')}
					</span>
					<FormInput value={state.folderPath} onChange={(event) => onFolderPathChange(event.target.value)} />
				</label>

				<label className="block text-sm">
					<span className="ui-text-secondary mb-1 block font-medium">
						{t('mail_components.create_folder.folder_type')}
					</span>
					<FormSelect value={state.type} onChange={(event) => onTypeChange(event.target.value)}>
						{typeOptions.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</FormSelect>
				</label>

				<label className="block text-sm">
					<span className="ui-text-secondary mb-1 block font-medium">
						{t('mail_components.create_folder.folder_color')}
					</span>
					<div className="swatch-grid grid grid-cols-4 gap-2 rounded-md p-2">
						{colorOptions.map((option) => (
							<Button
								key={option.value}
								type="button"
								onClick={() => onColorChange(option.value)}
								className={cn(
									'swatch-option flex items-center gap-2 rounded-md px-2 py-1.5 text-xs',
									state.color === option.value && 'is-selected',
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
				<Button variant="outline" onClick={onClose} disabled={saving}>
					{t('mail_components.common.cancel')}
				</Button>
				<Button onClick={onCreate} disabled={saving}>
					{saving ? t('mail_components.common.creating') : t('mail_components.common.create')}
				</Button>
			</ModalFooter>
		</Modal>
	);
}
