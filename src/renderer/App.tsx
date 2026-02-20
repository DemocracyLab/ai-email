import { useState } from 'react';
import { AppProvider } from './context/AppContext';
import ConfigTab from './components/ConfigTab';
import ContextTab from './components/ContextTab';
import EmailTab from './components/EmailTab';
import './index.css';

type Tab = 'config' | 'context' | 'email';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('config');

  return (
    <AppProvider>
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
    </AppProvider>
  );
}

export default App;
