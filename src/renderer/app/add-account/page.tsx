import {useNavigate} from 'react-router-dom';
import SettingsAddAccount from './AddAccountForm';

type AddAccountPageProps = {
    hasAccounts: boolean;
};

export default function AddAccountPage({hasAccounts}: AddAccountPageProps) {
    const navigate = useNavigate();

    return (
        <SettingsAddAccount
            embedded
            hasAccounts={hasAccounts}
            onCompleted={() => {
                navigate('/email', {replace: true});
            }}
            onCancel={() => {
                navigate(hasAccounts ? '/settings/application' : '/onboarding', {replace: true});
            }}
        />
    );
}
