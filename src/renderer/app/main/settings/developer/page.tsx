import AppSettingsPage from '../../../../pages/AppSettingsPage';
import {useOpenUpdaterToken} from '../settingsRouteHelpers';

export default function SettingsDeveloperPage() {
    return <AppSettingsPage embedded initialPanel="developer" openUpdaterToken={useOpenUpdaterToken()}/>;
}
