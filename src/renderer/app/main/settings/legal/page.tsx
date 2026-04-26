import {ExternalLink, FileText, Shield} from '@llamamail/ui/icon';
import {Button} from '@llamamail/ui/button';
import {Container} from '@llamamail/ui/container';
import {Card} from '@llamamail/ui';
import {useI18n} from '@llamamail/app/i18n/renderer';

const LEGAL_BASE_URL = 'https://llama.voracious.se/';
const PRIVACY_URL = 'https://llama.voracious.se/privacy';
const TOS_URL = 'https://llama.voracious.se/tos';

export default function SettingsLegalPage() {
	const {t} = useI18n();
	return (
		<Container>
			<Card>
				<h2 className="ui-text-primary text-base font-semibold">{t('settings.legal.title')}</h2>
				<p className="ui-text-muted mt-1 text-sm">{t('settings.legal.subtitle')}</p>
				<div className="mt-4 grid gap-3 md:grid-cols-2">
					<div className="ui-border-default rounded-md border p-3">
						<div className="flex items-start justify-between gap-2">
							<div>
								<p className="ui-text-secondary text-sm font-medium">{t('settings.legal.privacy_title')}</p>
								<p className="ui-text-muted mt-1 text-xs">{t('settings.legal.privacy_description')}</p>
							</div>
							<Shield size={16} className="ui-text-muted" />
						</div>
						<Button
							type="button"
							variant="outline"
							className="mt-3 rounded-md px-3 py-2 text-sm"
							onClick={() => window.open(PRIVACY_URL, '_blank', 'noopener,noreferrer')}
							rightIcon={<ExternalLink size={14} />}
						>
							{t('settings.legal.open_privacy_policy')}
						</Button>
					</div>
					<div className="ui-border-default rounded-md border p-3">
						<div className="flex items-start justify-between gap-2">
							<div>
								<p className="ui-text-secondary text-sm font-medium">{t('settings.legal.terms_title')}</p>
								<p className="ui-text-muted mt-1 text-xs">{t('settings.legal.terms_description')}</p>
							</div>
							<FileText size={16} className="ui-text-muted" />
						</div>
						<Button
							type="button"
							variant="outline"
							className="mt-3 rounded-md px-3 py-2 text-sm"
							onClick={() => window.open(TOS_URL, '_blank', 'noopener,noreferrer')}
							rightIcon={<ExternalLink size={14} />}
						>
							{t('settings.legal.open_terms_of_service')}
						</Button>
					</div>
				</div>
				<p className="ui-text-muted mt-4 text-xs">
					{t('settings.legal.official_pages_label')} <span className="font-medium">{LEGAL_BASE_URL}</span>
				</p>
			</Card>
		</Container>
	);
}
