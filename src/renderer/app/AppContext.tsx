import React, {createContext, useContext} from 'react';

export type AppTitlebarControls = {
    setTitle: (title?: string) => void;
    setTitleActions: (titleActions?: React.ReactNode | null) => void;
    setOnRequestClose: (onRequestClose?: (() => boolean) | null) => void;
    setShowNavRail: (showNavRail?: boolean) => void;
    resetTitlebar: () => void;
};

const AppContext = createContext<AppTitlebarControls | null>(null);

export function AppContextProvider({value, children}: { value: AppTitlebarControls; children: React.ReactNode }) {
    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppTitlebarControls {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useApp must be used within AppContextProvider.');
    }
    return context;
}
