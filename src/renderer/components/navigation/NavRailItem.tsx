import React from 'react';
import {NavLink} from 'react-router-dom';
import {cn} from '../../lib/utils';
import NewEmailBadge from '../mail/NewEmailBadge';

type NavRailItemProps = {
    to: string;
    icon: React.ReactNode;
    label: string;
    badgeCount?: number;
};

export default function NavRailItem({to, icon, label, badgeCount = 0}: NavRailItemProps) {
    return (
        <NavLink
            to={to}
            title={label}
            aria-label={label}
            draggable={false}
            className={({isActive}) =>
                cn(
                    'inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-white/10 hover:text-white',
                    isActive && 'bg-white/15 text-white',
                )
            }
        >
			<span className="relative inline-flex">
				{icon}
                <NewEmailBadge
                    count={badgeCount}
                    className="absolute -right-2.5 -top-2 min-h-5 min-w-5 px-1 text-[10px]"
                    title={`${badgeCount} unread`}
                />
			</span>
        </NavLink>
    );
}
