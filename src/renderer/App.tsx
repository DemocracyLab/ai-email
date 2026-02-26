import { useState, useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import ConfigTab from './components/ConfigTab';
import ContextTab from './components/ContextTab';
import EmailTab from './components/EmailTab';
import './index.css';

type Tab = 'config' | 'context' | 'email';

function AppContent() {
  const { config } = useApp();
  const [activeTab, setActiveTab] = useState<Tab>('config');

  // Determine initial tab based on configuration completeness
  useEffect(() => {
    if (!config) return;

    // Check if configuration is complete
    const hasUserInfo = config.user.name && config.user.email;
    const hasGoogleConnection = config.google?.refreshToken;
    const hasSheetConfig = config.google?.sheetUrl;
    const hasLLMModel = config.llm.model;
    const hasContext = config.context.content;

    const isConfigComplete = hasUserInfo && hasGoogleConnection && hasSheetConfig && hasLLMModel;
    const isContextComplete = hasContext && hasContext.trim().length > 0;

    // Set initial tab based on what's configured
    if (!isConfigComplete) {
      setActiveTab('config');
    } else if (!isContextComplete) {
      setActiveTab('context');
    } else {
      setActiveTab('email');
    }
  }, [config]);

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab('config')}
              className={`py-4 px-6 border-b-2 font-medium text-sm ${
                activeTab === 'config'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Configuration
            </button>
            <button
              onClick={() => setActiveTab('context')}
              className={`py-4 px-6 border-b-2 font-medium text-sm ${
                activeTab === 'context'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Context Template
            </button>
            <button
              onClick={() => setActiveTab('email')}
              className={`py-4 px-6 border-b-2 font-medium text-sm ${
                activeTab === 'email'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Send Emails
            </button>
          </div>
        </div>
      </nav>

      <main className="py-8">
        {activeTab === 'config' && <ConfigTab />}
        {activeTab === 'context' && <ContextTab />}
        {activeTab === 'email' && <EmailTab />}
      </main>
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
