import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AppConfig } from '../../shared/types';

interface AppContextType {
  config: AppConfig | null;
  updateConfig: (config: Partial<AppConfig>) => Promise<void>;
  loadConfig: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<AppConfig | null>(null);

  const loadConfig = async () => {
    const loadedConfig = await window.electronAPI.getConfig();
    setConfig(loadedConfig);
  };

  const updateConfig = async (updates: Partial<AppConfig>) => {
    const updatedConfig = await window.electronAPI.setConfig(updates);
    setConfig(updatedConfig);
  };

  useEffect(() => {
    loadConfig();
  }, []);

  return (
    <AppContext.Provider value={{ config, updateConfig, loadConfig }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};
