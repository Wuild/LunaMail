import {Outlet} from 'react-router-dom';
import WorkspaceLayout from '@renderer/layouts/WorkspaceLayout';

export default function MainSectionLayout() {
    return (
        <WorkspaceLayout
            showMenuBar={false}
            showStatusBar={false}
            contentClassName="min-h-0 flex-1 overflow-hidden p-0"
        >
            <Outlet/>
        </WorkspaceLayout>
    );
}
