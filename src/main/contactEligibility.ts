import type { Contact } from '../shared/types.js';

export function isRetryableContactStatus(status: Contact['status']): boolean {
  return status === 'error' ||
    status === 'domain-error-timeout' ||
    status === 'domain-error-temporary' ||
    status === 'gmail-error-temporary';
}

export function canSendContact(status: Contact['status'], teamMember?: string): boolean {
  if (
    status === 'sent' ||
    status === 'hard-bounce' ||
    status === 'soft-bounce' ||
    status === 'block-bounce' ||
    status === 'domain-error-no-mx' ||
    status === 'domain-error-nonexistent' ||
    status === 'gmail-error-permanent' ||
    status === 'gmail-error-uncertain'
  ) {
    return false;
  }

  return !teamMember || isRetryableContactStatus(status);
}