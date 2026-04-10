import SettingsAddAccount from '@renderer/app/add-account/AddAccountForm';
import {useAccounts} from '@renderer/hooks/ipc/useAccounts';

export default function AddAccountWindowPage() {
    const {accounts} = useAccounts();
    return <SettingsAddAccount embedded hasAccounts={accounts.length > 0}/>;
}
