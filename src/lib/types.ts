/** Minimal shape of a Bitbucket DC pull request activity entry */
export interface PrActivity {
    action?: string;
    comment?: PrComment | null;
}

/** Minimal shape of a Bitbucket DC pull request comment */
export interface PrComment {
    severity?: string;
    threadResolved?: boolean;
    state?: string;
}
