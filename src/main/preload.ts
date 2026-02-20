const { contextBridge, ipcRenderer } = require('electron');

console.log('[Preload] Preload script loaded');

contextBridge.exposeInMainWorld('electronAPI', {
  // Config
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (config: Partial<AppConfig>) => ipcRenderer.invoke('config:set', config),
  clearConfig: () => ipcRenderer.invoke('config:clear'),

  // Files
  selectFile: () => ipcRenderer.invoke('file:select'),
  saveFile: (path: string, content: string) => ipcRenderer.invoke('file:save', path, content),

  // Gmail OAuth
  authorizeGmail: () => ipcRenderer.invoke('gmail:authorize'),
  saveGmailTokens: (code: string) => ipcRenderer.invoke('gmail:saveTokens', code),

  // Gmail
  sendEmail: (emailData: EmailData) => ipcRenderer.invoke('gmail:send', emailData),
  testGmailConnection: () => ipcRenderer.invoke('gmail:test'),

  // Google Sheets
  getContacts: () => ipcRenderer.invoke('sheets:getContacts'),
  updateContact: (contact: Contact) => ipcRenderer.invoke('sheets:updateContact', contact),
  testSheetsConnection: () => ipcRenderer.invoke('sheets:test')
});

console.log('[Preload] electronAPI exposed to renderer');

declare global {
  interface Window {
    electronAPI: {
      getConfig: () => Promise<AppConfig>;
      setConfig: (config: Partial<AppConfig>) => Promise<AppConfig>;
      clearConfig: () => Promise<AppConfig>;
      selectFile: () => Promise<{ path: string; content: string } | null>;
      saveFile: (path: string, content: string) => Promise<boolean>;
      authorizeGmail: () => Promise<string>;
      saveGmailTokens: (code: string) => Promise<boolean>;
      sendEmail: (emailData: EmailData) => Promise<{ success: boolean; messageId?: string; error?: string }>;
      testGmailConnection: () => Promise<boolean>;
      getContacts: () => Promise<Contact[]>;
      updateContact: (contact: Contact) => Promise<boolean>;
      testSheetsConnection: () => Promise<boolean>;
    };
  }
}
