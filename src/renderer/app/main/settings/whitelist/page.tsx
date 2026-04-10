import AppSettingsPage from '../../../../pages/AppSettingsPage';
import {useOpenUpdaterToken} from '../settingsRouteHelpers';

export default function SettingsWhitelistPage() {
    return <AppSettingsPage embedded initialPanel="allowlist" openUpdaterToken={useOpenUpdaterToken()}/>;
}
