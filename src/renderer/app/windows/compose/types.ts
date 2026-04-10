export type ComposeAttachment = {
    id: string;
    path: string;
    filename: string;
    contentType: string | null;
    size: number | null;
};

export type RecipientFieldKey = 'to' | 'cc' | 'bcc';
