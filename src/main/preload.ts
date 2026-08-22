const { contextBridge, ipcRenderer } = require('electron');

console.log('[Preload] Preload script loaded');

contextBridge.exposeInMainWorld('electronAPI', {
  // Config
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (config: any) => ipcRenderer.invoke('config:set', config),
  clearConfig: () => ipcRenderer.invoke('config:clear'),
  fetchConfigFromScript: (scriptUrl: string) => ipcRenderer.invoke('config:fetch-from-script', scriptUrl),

  // Files
  selectFile: () => ipcRenderer.invoke('file:select'),
  saveFile: (path: string, content: string) => ipcRenderer.invoke('file:save', path, content),

  // Gmail OAuth
  authorizeGmail: () => ipcRenderer.invoke('gmail:authorize'),
  saveGmailTokens: (code: string) => ipcRenderer.invoke('gmail:saveTokens', code),

  // Gmail
  sendEmail: (emailData: any) => ipcRenderer.invoke('gmail:send', emailData),
  testGmailConnection: () => ipcRenderer.invoke('gmail:test'),

  // Google Sheets
  getContacts: () => ipcRenderer.invoke('sheets:getContacts'),
  updateContact: (contact: any) => ipcRenderer.invoke('sheets:updateContact', contact),
  testSheetsConnection: () => ipcRenderer.invoke('sheets:test'),
  checkBounceColumns: () => ipcRenderer.invoke('sheets:checkBounceColumns'),
  addBounceColumns: () => ipcRenderer.invoke('sheets:addBounceColumns'),
  processBounces: (bounces: any[]) => ipcRenderer.invoke('sheets:processBounces', bounces),
  getTodayBounceCount: () => ipcRenderer.invoke('sheets:getTodayBounceCount'),

  // Secrets
  getLLMApiKey: () => ipcRenderer.invoke('secrets:get-llm-key'),

  // Bulk Send
  getBulkSendState: () => ipcRenderer.invoke('bulkSend:getState'),
  setBulkSendState: (state: any) => ipcRenderer.invoke('bulkSend:setState', state),
  getSentCountFromSheet: () => ipcRenderer.invoke('bulkSend:getSentCountFromSheet'),
  getRemainingCount: () => ipcRenderer.invoke('bulkSend:getRemainingCount'),
  validateDomain: (email: string) => ipcRenderer.invoke('bulkSend:validateDomain', email),
  checkBounces: (options?: { daysBack?: number; labelName?: string }) => ipcRenderer.invoke('bulkSend:checkBounces', options),
});

console.log('[Preload] electronAPI exposed to renderer');
