export interface Contact {
  email: string;
  firstName: string;
  lastName: string;
  teamMember?: string;
  status?: 'sent' | 'skipped' | 'error';
  dateSent?: string;
  messageId?: string;
  rowIndex: number;
}

export interface AppConfig {
  user: {
    name: string;
    email: string;
  };
  google?: {
    refreshToken: string;
    sheetId: string;
    sheetUrl: string;
    sheetName: string;
  };
  llm: {
    provider: 'gemini' | 'openai';
    apiKey?: string; // Optional - fetched from Secret Manager
    model: string;
    availableModels?: string[]; // Cached list of available models
  };
  context: {
    lastFilePath?: string;
    content?: string;
  };
}

export interface EmailData {
  to: string;
  subject: string;
  body: string;
  isTest?: boolean;
}

export type LLMProvider = 'gemini' | 'openai';

export interface LLMConfig {
  provider: LLMProvider;
  apiKey?: string; // Optional - fetched from Secret Manager
  model: string;
  availableModels?: string[]; // Cached list of available models
}
