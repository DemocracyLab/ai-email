export interface Contact {
  email: string;
  firstName: string;
  lastName: string;
  teamMember?: string;
  status?: 
    | 'sent' 
    | 'skipped' 
    | 'error'
    | 'domain-error-timeout'
    | 'domain-error-no-mx'
    | 'domain-error-nonexistent'
    | 'domain-error-temporary'
    | 'hard-bounce'
    | 'soft-bounce'
    | 'block-bounce';
  dateSent?: string;
  messageId?: string;
  bounceDate?: string;
  bounceReason?: string;
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
    scriptUrl?: string;
    clientId?: string;
    clientSecret?: string;
  };
  llm: {
    provider: 'gemini' | 'openai' | 'claude';
    apiKey?: string; // Legacy - single key. Prefer apiKeyByProvider going forward.
    apiKeyByProvider?: {
      gemini?: string;
      openai?: string;
      claude?: string;
    };
    model: string;
    availableModels?: string[]; // Cached list of available models
  };
  context: {
    lastFilePath?: string;
    content?: string;
  };
  bulkSend?: BulkSendState;
}

export interface EmailData {
  to: string;
  subject: string;
  body: string;
  isTest?: boolean;
}

export type LLMProvider = 'gemini' | 'openai' | 'claude';

export interface BulkSendState {
  isActive: boolean;
  maxPer24h: number;
  nextSendAt: string | null;  // ISO timestamp; null when paused
  sentLog: string[];          // ISO timestamps of sends within the last 24 h (pruned on read)
  bounceSettings?: BounceSettings;
}

export interface BounceSettings {
  bounceHistoryDays: number;          // Default 7
  maxBouncesPerDay: number;           // Default 3
  bounceTimestamps: string[];         // ISO timestamps of today's bounces
  lastCheckDate: string;              // ISO date for daily reset
}

export interface LLMConfig {
  provider: LLMProvider;
  apiKey?: string; // Resolved active key, populated at generation time
  apiKeyByProvider?: Record<string, string>;
  model: string;
  availableModels?: string[]; // Cached list of available models
}
