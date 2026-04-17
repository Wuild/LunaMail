import {useQuery} from '@tanstack/react-query';
import {ipcClient} from '@renderer/lib/ipcClient';

const DEFAULT_LOCALE = 'en-US';

export function useSystemLocale() {
	const localeQuery = useQuery({
		queryKey: ['system-locale'],
		queryFn: async () => {
			const locale = await ipcClient.getSystemLocale();
			return String(locale || DEFAULT_LOCALE);
		},
		initialData: DEFAULT_LOCALE,
		refetchOnMount: 'always',
	});

	return {
		systemLocale: localeQuery.data || DEFAULT_LOCALE,
	};
}
