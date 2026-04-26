import React from 'react';
import {FormInput, FormSelect} from '@llamamail/ui/form';

export type ServiceSecurityMode = 'ssl' | 'starttls' | 'none';
type ControlVariant = 'default' | 'subtle';
type ControlSize = 'sm' | 'md' | 'lg';

type ServiceSettingsCardProps = {
	title: string;
	host: string;
	port: number;
	security: ServiceSecurityMode;
	onHostChange: (value: string) => void;
	onPortChange: (value: number) => void;
	onSecurityChange: (value: ServiceSecurityMode) => void;
	allowNone?: boolean;
	tone?: 'neutral' | 'muted' | 'sky' | 'cyan';
	controlVariant?: ControlVariant;
	controlSize?: ControlSize;
	children?: React.ReactNode;
};

const toneClasses: Record<NonNullable<ServiceSettingsCardProps['tone']>, string> = {
	neutral: 'panel',
	muted: 'surface-tint-muted',
	sky: 'surface-tint-info',
	cyan: 'surface-tint-cyan',
};

export default function ServiceSettingsCard({
	title,
	host,
	port,
	security,
	onHostChange,
	onPortChange,
	onSecurityChange,
	allowNone = false,
	tone = 'neutral',
	controlVariant = 'default',
	controlSize = 'md',
	children,
}: ServiceSettingsCardProps) {
	return (
		<div className={`rounded-lg border p-4 ${toneClasses[tone]}`}>
			<h3 className="ui-text-primary text-sm font-semibold">{title}</h3>
			<div className="mt-3 grid grid-cols-1 gap-3">
				<label className="block text-sm">
					<span className="ui-text-secondary mb-1 block font-medium">Host</span>
					<FormInput
						type="text"
						value={host}
						onChange={(event) => onHostChange(event.target.value)}
						variant={controlVariant}
						size={controlSize}
					/>
				</label>
				<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
					<label className="block text-sm">
						<span className="ui-text-secondary mb-1 block font-medium">Port</span>
						<FormInput
							type="number"
							value={String(port || 0)}
							onChange={(event) => onPortChange(Number(event.target.value || 0))}
							variant={controlVariant}
							size={controlSize}
						/>
					</label>
					<label className="block text-sm">
						<span className="ui-text-secondary mb-1 block font-medium">Security</span>
						<FormSelect
							value={security}
							onChange={(event) => onSecurityChange(event.target.value as ServiceSecurityMode)}
							variant={controlVariant}
							size={controlSize}
						>
							<option value="ssl">SSL/TLS</option>
							<option value="starttls">STARTTLS</option>
							{allowNone && <option value="none">None</option>}
						</FormSelect>
					</label>
				</div>
				{children ? <div className="mt-3">{children}</div> : null}
			</div>
		</div>
	);
}
