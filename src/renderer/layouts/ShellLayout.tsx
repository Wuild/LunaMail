import React from 'react';
import {Outlet} from 'react-router-dom';

type ShellLayoutProps = {
    children?: React.ReactNode;
};

export default function ShellLayout({children}: ShellLayoutProps) {
    return <div className="app-shell min-h-0 h-full w-full overflow-hidden">{children ?? <Outlet/>}</div>;
}
