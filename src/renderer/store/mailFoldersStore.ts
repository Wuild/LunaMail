import {create} from 'zustand';
import type {FolderItem} from '@/preload';

type MailFoldersStoreState = {
	accountFoldersById: Record<number, FolderItem[]>;
	selectedFolderPath: string | null;
	setAccountFoldersById: (
		value:
			| Record<number, FolderItem[]>
			| ((current: Record<number, FolderItem[]>) => Record<number, FolderItem[]>),
	) => void;
	setSelectedFolderPath: (path: string | null) => void;
};

export const useMailFoldersStore = create<MailFoldersStoreState>((set) => ({
	accountFoldersById: {},
	selectedFolderPath: null,
	setAccountFoldersById: (value) =>
		set((state) => ({
			accountFoldersById: typeof value === 'function' ? value(state.accountFoldersById) : value,
		})),
	setSelectedFolderPath: (path) => set({selectedFolderPath: path}),
}));
