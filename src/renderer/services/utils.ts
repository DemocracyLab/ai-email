import { marked } from 'marked';
import { Contact } from '../../shared/types';

export function markdownToHtml(text: string): string {
  return marked.parse(text) as string;
}

export function replaceVariables(
  template: string,
  contact: Contact,
  userName?: string
): string {
  const first = (contact.firstName ?? '').trim();
  const last = (contact.lastName ?? '').trim();
  const email = (contact.email ?? '').trim();
  const fill = (text: string, encode: boolean): string => {
    const format = encode ? encodeURIComponent : (value: string) => value;
    return text
      .replace(/\{\{firstName\}\}/g, () => format(first))
      .replace(/\{\{lastName\}\}/g, () => format(last))
      .replace(/\{\{email\}\}/g, () => format(email));
  };

  let output = template
    .replace(/(\]\()([^\s)]*)(\))/g, (_match, prefix, url, suffix) => prefix + fill(url, true) + suffix)
    .replace(/(href=["'])([^"']*)(["'])/g, (_match, prefix, url, suffix) => prefix + fill(url, true) + suffix);

  if (!first) {
    output = output.split('\n').filter(line => !/\{\{firstName\}\}/.test(line)).join('\n');
  }

  return fill(output, false).replace(/\{\{user\.name\}\}/g, userName || '');
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
