import {useOutletContext} from 'react-router-dom';
import {FormCheckbox} from '@renderer/components/ui/FormControls';
import HtmlLexicalEditor from '@renderer/components/HtmlLexicalEditor';
import {Field, Label} from '@renderer/app/main/settings/formParts';
import type {UseAccountSettingsRouteResult} from '../useAccountSettingsRoute';

export default function SettingsAccountIdentityPage() {
    const {editor, setEditor} = useOutletContext<UseAccountSettingsRouteResult>();
    if (!editor) return null;

    return (
        <section className="panel rounded-xl p-4">
            <h2 className="ui-text-primary text-base font-semibold">Default Identity</h2>
            <p className="mt-1 ui-text-muted text-sm">
                Each account has an identity that recipients see when reading your messages.
            </p>
            <div
                className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(140px,180px)_minmax(0,1fr)] md:items-center">
                <Label>Your Name:</Label>
                <Field value={editor.display_name || ''}
                       onChange={(v) => setEditor((p) => (p ? {...p, display_name: v} : p))}/>
                <Label>Email Address:</Label>
                <Field value={editor.email} onChange={(v) => setEditor((p) => (p ? {...p, email: v} : p))}/>
                <Label>Reply-to Address:</Label>
                <Field
                    value={editor.reply_to || ''}
                    onChange={(v) => setEditor((p) => (p ? {...p, reply_to: v} : p))}
                    placeholder="Recipients will reply to this address"
                />
                <Label>Organization:</Label>
                <Field value={editor.organization || ''}
                       onChange={(v) => setEditor((p) => (p ? {...p, organization: v} : p))}/>
                <Label>Signature text:</Label>
                <div className="space-y-2">
                    <div className="ui-text-muted text-xs">Signature is HTML-enabled and will be appended to sent
                        messages for this account.
                    </div>
                    <div className="ui-border-default h-56 min-h-56 overflow-hidden rounded-md border">
                        <HtmlLexicalEditor
                            key={`account-signature-${editor.id}`}
                            value={editor.signature_text || ''}
                            placeholder="Write your signature..."
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
                        Attach my vCard to messages
                    </label>
                </div>
            </div>
        </section>
    );
}
