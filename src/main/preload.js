const { contextBridge, ipcRenderer } = require('electron');

console.log('[Preload] Preload script loaded');

contextBridge.exposeInMainWorld('electronAPI', {
  // Config
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (config) => ipcRenderer.invoke('config:set', config),
  clearConfig: () => ipcRenderer.invoke('config:clear'),

  // Files
  selectFile: () => ipcRenderer.invoke('file:select'),
  saveFile: (path, content) => ipcRenderer.invoke('file:save', path, content),

  // Gmail OAuth
  authorizeGmail: () => ipcRenderer.invoke('gmail:authorize'),
  saveGmailTokens: (code) => ipcRenderer.invoke('gmail:saveTokens', code),

  // Gmail
  sendEmail: (emailData) => ipcRenderer.invoke('gmail:send', emailData),
  testGmailConnection: () => ipcRenderer.invoke('gmail:test'),

  // Google Sheets
  getContacts: () => ipcRenderer.invoke('sheets:getContacts'),
  updateContact: (contact) => ipcRenderer.invoke('sheets:updateContact', contact),
  testSheetsConnection: () => ipcRenderer.invoke('sheets:test')
});

console.log('[Preload] electronAPI exposed to renderer');
