import React from 'react';
import {FormInput} from '../components/ui/FormControls';

type FieldProps = {
	label?: string;
	value: string;
	onChange: (next: string) => void;
	type?: string;
	placeholder?: string;
};

export function Field({label, value, onChange, type = 'text', placeholder}: FieldProps) {
	return (
		<label className="block text-sm">
			{label && <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">{label}</span>}
			<FormInput
				type={type}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
			/>
		</label>
	);
}

export function Label({children}: {children: React.ReactNode}) {
	return <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{children}</div>;
}
