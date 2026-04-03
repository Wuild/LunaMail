import * as React from 'react';
import {cn} from '../../lib/utils';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({className, ...props}, ref) => (
    <select
        ref={ref}
        className={cn(
            'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition-colors focus:border-slate-500 focus:ring-2 focus:ring-slate-200',
            className,
        )}
        {...props}
    />
));

Select.displayName = 'Select';
