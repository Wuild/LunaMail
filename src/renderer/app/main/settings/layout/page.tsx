import AppSettingsPage from '../../../../pages/AppSettingsPage';
import {useOpenUpdaterToken} from '../settingsRouteHelpers';

export default function SettingsLayoutPage() {
    return <AppSettingsPage embedded initialPanel="layout" openUpdaterToken={useOpenUpdaterToken()}/>;
}
