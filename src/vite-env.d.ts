/// <reference types="vite/client" />

// Extend Window interface with electronAPI
interface Window {
  electronAPI: {
    getConfig: () => Promise<import('./shared/types').AppConfig>;
    setConfig: (config: Partial<import('./shared/types').AppConfig>) => Promise<import('./shared/types').AppConfig>;
    clearConfig: () => Promise<import('./shared/types').AppConfig>;
    selectFile: () => Promise<{ path: string; content: string } | null>;
    saveFile: (path: string, content: string) => Promise<boolean>;
    authorizeGmail: () => Promise<{ success: boolean; error?: string }>;
    saveGmailTokens: (code: string) => Promise<boolean>;
    sendEmail: (emailData: import('./shared/types').EmailData) => Promise<{ success: boolean; messageId?: string; error?: string }>;
    testGmailConnection: () => Promise<boolean>;
    getContacts: () => Promise<import('./shared/types').Contact[]>;
    updateContact: (contact: import('./shared/types').Contact) => Promise<boolean>;
    testSheetsConnection: () => Promise<{ success: boolean; error?: string }>;
    getLLMApiKey: () => Promise<string>;
  };
}
