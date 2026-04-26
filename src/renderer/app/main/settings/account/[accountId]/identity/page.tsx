import {useOutletContext} from 'react-router-dom';
import {FormCheckbox} from '@llamamail/ui/form';
import HtmlLexicalEditor from '@llamamail/ui/editor';
import {Card} from '@llamamail/ui/card';
import {Field, Label} from '@renderer/app/main/settings/formParts';
import type {UseAccountSettingsRouteResult} from '../useAccountSettingsRoute';
import {useI18n} from '@llamamail/app/i18n/renderer';

export default function SettingsAccountIdentityPage() {
	const {t} = useI18n();
	const {editor, setEditor} = useOutletContext<UseAccountSettingsRouteResult>();
	if (!editor) return null;

	return (
		<div className="space-y-4">
			<Card
				header={
					<div>
						<h2 className="ui-text-primary text-base font-semibold">{t('settings.account_identity.profile_title')}</h2>
						<p className="mt-1 ui-text-muted text-sm">
							{t('settings.account_identity.profile_description')}
						</p>
					</div>
				}
			>
				<div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(140px,180px)_minmax(0,1fr)] md:items-center">
					<Label>{t('settings.account_identity.your_name')}</Label>
					<Field
						value={editor.display_name || ''}
						onChange={(v) => setEditor((p) => (p ? {...p, display_name: v} : p))}
					/>
					<Label>{t('settings.account_identity.email_address')}</Label>
					<Field value={editor.email} onChange={(v) => setEditor((p) => (p ? {...p, email: v} : p))} />
					<Label>{t('settings.account_identity.reply_to_address')}</Label>
					<Field
						value={editor.reply_to || ''}
						onChange={(v) => setEditor((p) => (p ? {...p, reply_to: v} : p))}
						placeholder={t('settings.account_identity.reply_to_placeholder')}
					/>
					<Label>{t('settings.account_identity.organization')}</Label>
					<Field
						value={editor.organization || ''}
						onChange={(v) => setEditor((p) => (p ? {...p, organization: v} : p))}
					/>
				</div>
			</Card>

			<Card
				header={
					<div>
						<h2 className="ui-text-primary text-base font-semibold">{t('settings.account_identity.signature_title')}</h2>
						<p className="mt-1 ui-text-muted text-sm">
							{t('settings.account_identity.signature_description')}
						</p>
					</div>
				}
			>
				<div className="space-y-2">
					<div className="ui-border-default h-56 min-h-56 overflow-hidden rounded-md border">
						<HtmlLexicalEditor
							key={`account-signature-${editor.id}`}
							value={editor.signature_text || ''}
							placeholder={t('settings.account_identity.signature_placeholder')}
							appearance="embedded"
							onChange={(html) =>
								setEditor((p) =>
									p
										? {
												...p,
												signature_text: html,
												signature_is_html: 1,
											}
										: p,
								)
							}
						/>
					</div>
					<label className="inline-flex items-center gap-2 ui-text-secondary text-sm">
						<FormCheckbox
							checked={!!editor.attach_vcard}
							onChange={(e) => setEditor((p) => (p ? {...p, attach_vcard: e.target.checked ? 1 : 0} : p))}
						/>
						{t('settings.account_identity.attach_vcard')}
					</label>
				</div>
			</Card>
		</div>
	);
}
