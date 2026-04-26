import React from 'react';
import {NavLink, useLocation} from 'react-router-dom';
import {cn} from '@llamamail/ui/utils';
import NewEmailBadge from '../mail/NewEmailBadge';
import {useI18n} from '@llamamail/app/i18n/renderer';

type NavRailItemProps = {
	to: string;
	icon: React.ReactNode;
	label: string;
	badgeCount?: number;
	activePathPrefixes?: string[];
};

export default function NavRailItem({to, icon, label, badgeCount = 0, activePathPrefixes}: NavRailItemProps) {
	const {t} = useI18n();
	const location = useLocation();
	const hasPrefixMatch = (activePathPrefixes || []).some((prefix) => {
		const normalizedPrefix = String(prefix || '').trim();
		if (!normalizedPrefix) return false;
		return location.pathname === normalizedPrefix || location.pathname.startsWith(`${normalizedPrefix}/`);
	});
	return (
		<NavLink
			to={to}
			title={label}
			aria-label={label}
			draggable={false}
			className={({isActive}) =>
				cn(
					'nav-rail-item inline-flex h-11 w-11 items-center justify-center rounded-lg transition-colors',
					(isActive || hasPrefixMatch) && 'is-active',
				)
			}
		>
			<span className="relative inline-flex">
				{icon}
				<NewEmailBadge
					count={badgeCount}
					className="absolute -right-2.5 -top-2 min-h-5 min-w-5 px-1 text-[10px]"
					title={t('mail_components.badge.unread_count', {count: badgeCount})}
				/>
			</span>
		</NavLink>
	);
}
