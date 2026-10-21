/** `vite build --mode artifact` produces a single-page test build with
 *  Google Drive sync switched off (no account setup needed to try the app). */
export const SYNC_ENABLED = import.meta.env.MODE !== 'artifact';

/** Example data is only offered in the test build, never in the real app. */
export const SAMPLE_ENABLED = import.meta.env.MODE === 'artifact';
