import React from 'react';
import {FormInput} from '@renderer/components/ui/FormControls';

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
			{label && <span className="ui-text-secondary mb-1 block font-medium">{label}</span>}
            <FormInput type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}/>
		</label>
	);
}

export function Label({children}: {children: React.ReactNode}) {
	return <div className="ui-text-secondary text-sm font-medium">{children}</div>;
}
