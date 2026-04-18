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
				if (window.history.length > 1) {
					navigate(-1);
					return;
				}
				navigate('/email', {replace: true});
			}}
		/>
	);
}
