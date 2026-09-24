/**
 * Embedded build (`npm run build:preview`): a single-file preview that runs inside
 * a sandboxed frame, where printing and file downloads are unavailable.
 */
export const embedded = import.meta.env.VITE_EMBED === '1'
export const canPrint = !embedded
export const canDownload = !embedded
