import { Contact } from '../../shared/types';

export function replaceVariables(
  template: string,
  contact: Contact,
  userName?: string
): string {
  return template
    .replace(/\{\{firstName\}\}/g, contact.firstName)
    .replace(/\{\{lastName\}\}/g, contact.lastName)
    .replace(/\{\{user\.name\}\}/g, userName || '');
}

export function validateEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

export function validateConfig(config: any): string[] {
  const errors: string[] = [];

  if (!config.user?.name) {
    errors.push('User name is required');
  }

  if (!config.user?.email) {
    errors.push('User email is required');
  } else if (!validateEmail(config.user.email)) {
    errors.push('Invalid user email address');
  }

  if (!config.llm?.apiKey) {
    errors.push('LLM API key is required');
  }

  if (!config.llm?.provider) {
    errors.push('LLM provider is required');
  }

  return errors;
}
