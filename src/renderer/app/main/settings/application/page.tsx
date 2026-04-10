import AppSettingsPage from '../../../../pages/AppSettingsPage';
import {useOpenUpdaterToken} from '../settingsRouteHelpers';

export default function SettingsApplicationPage() {
    return <AppSettingsPage embedded initialPanel="app" openUpdaterToken={useOpenUpdaterToken()}/>;
}
