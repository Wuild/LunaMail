import React, {useEffect, useMemo, useState} from 'react';
import {Navigate} from 'react-router-dom';
import type {PublicCloudAccount} from '@preload';
import {ipcClient} from '@renderer/lib/ipcClient';
import {buildCloudRoute, buildRootTrail} from './cloudFilesHelpers';
import CloudAccountPage from './[accountId]/page';

export default function CloudRootPage() {
	const [accounts, setAccounts] = useState<PublicCloudAccount[] | null>(null);

	useEffect(() => {
		let active = true;
		void ipcClient
			.getCloudAccounts()
			.then((rows) => {
				if (!active) return;
				setAccounts(rows);
			})
			.catch(() => {
				if (!active) return;
				setAccounts([]);
			});
		const off = ipcClient.onCloudAccountsUpdated((rows) => {
			if (!active) return;
			setAccounts(rows);
		});
		return () => {
			active = false;
			if (typeof off === 'function') off();
		};
	}, []);

	const firstRoute = useMemo(() => {
		const firstAccount = accounts?.[0] ?? null;
		if (!firstAccount) return null;
		return buildCloudRoute(firstAccount.id, buildRootTrail(firstAccount.provider));
	}, [accounts]);

	if (accounts === null) return null;
	if (!firstRoute) return <CloudAccountPage />;
	return <Navigate to={firstRoute} replace />;
}

