import {useMemo, useState} from 'react';
import type {AutoCompleteRow} from '@renderer/components/inputs/AutoComplete';
import type {RecipientFieldKey} from './types';

export function useComposeRecipients() {
    const [toList, setToList] = useState<string[]>([]);
    const [ccList, setCcList] = useState<string[]>([]);
    const [bccList, setBccList] = useState<string[]>([]);
    const [showCcBcc, setShowCcBcc] = useState(false);
    const [recipientDrafts, setRecipientDrafts] = useState<Record<RecipientFieldKey, string>>({
        to: '',
        cc: '',
        bcc: '',
    });
    const [recipientRows, setRecipientRows] = useState<Record<RecipientFieldKey, AutoCompleteRow[]>>({
        to: [],
        cc: [],
        bcc: [],
    });
    const [recipientInvalidMessages, setRecipientInvalidMessages] = useState<Record<RecipientFieldKey, string | null>>({
        to: null,
        cc: null,
        bcc: null,
    });
    const [activeRecipientField, setActiveRecipientField] = useState<RecipientFieldKey | null>(null);

    const recipientListsByField: Record<RecipientFieldKey, string[]> = useMemo(
        () => ({
            to: toList,
            cc: ccList,
            bcc: bccList,
        }),
        [toList, ccList, bccList],
    );

    const blockedRecipientsByField: Record<RecipientFieldKey, string[]> = useMemo(
        () => ({
            to: [...ccList, ...bccList],
            cc: [...toList, ...bccList],
            bcc: [...toList, ...ccList],
        }),
        [toList, ccList, bccList],
    );

    function setRecipientsForField(field: RecipientFieldKey, next: string[]) {
        if (field === 'to') setToList(next);
        if (field === 'cc') setCcList(next);
        if (field === 'bcc') setBccList(next);
    }

    return {
        toList,
        setToList,
        ccList,
        setCcList,
        bccList,
        setBccList,
        showCcBcc,
        setShowCcBcc,
        recipientDrafts,
        setRecipientDrafts,
        recipientRows,
        setRecipientRows,
        recipientInvalidMessages,
        setRecipientInvalidMessages,
        activeRecipientField,
        setActiveRecipientField,
        recipientListsByField,
        blockedRecipientsByField,
        setRecipientsForField,
    };
}
