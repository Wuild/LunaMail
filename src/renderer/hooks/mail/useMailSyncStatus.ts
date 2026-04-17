import {useMemo} from 'react';
import {useRuntimeStore} from '@renderer/store/runtimeStore';

type UseMailSyncStatusResult = {
	syncStatusText: string | null;
	setSyncStatusText: (text: string | null) => void;
	syncingAccountIds: Set<number>;
	markAccountSyncing: (accountId: number) => void;
	clearAccountSyncing: (accountId: number) => void;
	pruneSyncingAccounts: (validAccountIds: number[]) => void;
};

export function useMailSyncStatus(): UseMailSyncStatusResult {
	const syncStatusText = useRuntimeStore((state) => state.mailSyncStatusText);
	const setSyncStatusText = useRuntimeStore((state) => state.setMailSyncStatusText);
	const syncingAccountIdList = useRuntimeStore((state) => state.syncingAccountIds);
	const markAccountSyncing = useRuntimeStore((state) => state.markAccountSyncing);
	const clearAccountSyncing = useRuntimeStore((state) => state.clearAccountSyncing);
	const pruneSyncingAccounts = useRuntimeStore((state) => state.pruneSyncingAccounts);
	const syncingAccountIds = useMemo(() => new Set(syncingAccountIdList), [syncingAccountIdList]);

	return {
		syncStatusText,
		setSyncStatusText,
		syncingAccountIds,
		markAccountSyncing,
		clearAccountSyncing,
		pruneSyncingAccounts,
	};
}
