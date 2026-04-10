import {Outlet} from 'react-router-dom';
import ShellLayout from '../layouts/ShellLayout';

export default function AppLayout() {
    return (
        <ShellLayout>
            <Outlet/>
        </ShellLayout>
    );
}
