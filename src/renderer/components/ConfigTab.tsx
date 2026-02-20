import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { validateEmail } from '../services/utils';

const ConfigTab: React.FC = () => {
  const { config, updateConfig } = useApp();
  const [userName, setUserName] = useState(config?.user.name || '');
  const [userEmail, setUserEmail] = useState(config?.user.email || '');
  const [sheetUrl, setSheetUrl] = useState(config?.google?.sheetUrl || '');
  const [sheetName, setSheetName] = useState(config?.google?.sheetName || 'Sheet1');
  const [llmProvider, setLlmProvider] = useState<'gemini' | 'openai'>(config?.llm.provider || 'gemini');
  const [llmApiKey, setLlmApiKey] = useState(config?.llm.apiKey || '');
  const [llmModel, setLlmModel] = useState(config?.llm.model || '');
  const [subject, setSubject] = useState(config?.email.subject || 'Hello {{firstName}} {{lastName}}');
  const [signature, setSignature] = useState(config?.email.signature || '\n\nBest regards');
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isGoogleConnected, setIsGoogleConnected] = useState(!!config?.google?.refreshToken);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showAuthCodeInput, setShowAuthCodeInput] = useState(false);
  const [authCode, setAuthCode] = useState('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);

  React.useEffect(() => {
    if (config) {
      setUserName(config.user.name);
      setUserEmail(config.user.email);
      setSheetUrl(config.google?.sheetUrl || '');
      setSheetName(config.google?.sheetName || 'Sheet1');
      setLlmProvider(config.llm.provider);
      setLlmApiKey(config.llm.apiKey);
      setLlmModel(config.llm.model);
      setIsGoogleConnected(!!config.google?.refreshToken);
    }
  }, [config]);

  const extractSheetId = (url: string): string | null => {
    if (!url.trim()) return null;
    
    // Already just an ID (no URL)
    if (!/https?:\/\//.test(url) && url.length > 20) {
      return url.trim();
    }
    
    // Extract from URL: https://docs.google.com/spreadsheets/d/SHEET_ID/edit...
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  };

  const handleSave = async () => {
    if (!userName || !userEmail) {
      setStatus({ type: 'error', message: 'Name and email are required' });
      return;
    }

    if (!validateEmail(userEmail)) {
      setStatus({ type: 'error', message: 'Invalid email address' });
      return;
    }

    if (!llmApiKey) {
      setStatus({ type: 'error', message: 'LLM API key is required' });
      return;
    }

    if (!llmModel) {
      setStatus({ type: 'error', message: 'Please select a model' });
      return;
    }

    // Extract sheet ID from URL if provided
    let sheetId: string | undefined = undefined;
    if (sheetUrl) {
      const extractedId = extractSheetId(sheetUrl);
      if (!extractedId) {
        setStatus({ type: 'error', message: 'Invalid Google Sheets URL. Please paste the full URL from your browser.' });
        return;
      }
      sheetId = extractedId;
    }

    try {
      await updateConfig({
        user: { name: userName, email: userEmail },
        google: (sheetId && config?.google?.refreshToken) ? { 
          sheetId, 
          sheetUrl,
          sheetName,
          refreshToken: config.google.refreshToken 
        } : undefined,
        llm: {
          provider: llmProvider,
          apiKey: llmApiKey,
          model: llmModel
        }
      });
      setStatus({ type: 'success', message: 'Configuration saved successfully' });
    } catch (error: any) {
      setStatus({ type: 'error', message: error.message });
    }
  };

  const handleConnectGoogle = async () => {
    try {
      // Debug: Check if electronAPI is available
      if (!window.electronAPI) {
        setStatus({ type: 'error', message: 'electronAPI is not available. Please restart the app.' });
        console.error('window.electronAPI is undefined');
        return;
      }
      
      if (!window.electronAPI.authorizeGmail) {
        setStatus({ type: 'error', message: 'authorizeGmail method is not available' });
        console.error('window.electronAPI.authorizeGmail is undefined');
        console.log('Available methods:', Object.keys(window.electronAPI));
        return;
      }
      
      setIsConnecting(true);
      setStatus({ type: 'success', message: 'Opening browser for Google authorization...' });
      
      // This will open the browser and automatically handle the OAuth callback
      const result = await window.electronAPI.authorizeGmail();
      
      if (result.success) {
        setIsGoogleConnected(true);
        setStatus({ type: 'success', message: 'Google account connected successfully!' });
        
        // Reload config to get the refresh token
        const newConfig = await window.electronAPI.getConfig();
        await updateConfig(newConfig);
      } else {
        setStatus({ type: 'error', message: result.error || 'Authorization failed' });
      }
    } catch (error: any) {
      setStatus({ type: 'error', message: error.message });
    } finally {
      setIsConnecting(false);
      setShowAuthCodeInput(false);
    }
  };

  const handleSaveAuthCode = async () => {
    if (!authCode) {
      setStatus({ type: 'error', message: 'Please enter the authorization code' });
      return;
    }

    try {
      setStatus({ type: 'success', message: 'Saving authorization...' });
      const success = await window.electronAPI.saveGmailTokens(authCode);
      
      if (success) {
        setIsGoogleConnected(true);
        setAuthCode('');
        setStatus({ type: 'success', message: 'Google account connected successfully!' });
        
        // Reload config to get the refresh token
        const newConfig = await window.electronAPI.getConfig();
        await updateConfig(newConfig);
      } else {
        setStatus({ type: 'error', message: 'Failed to save authorization. Please try again.' });
      }
    } catch (error: any) {
      setStatus({ type: 'error', message: error.message });
    }
  };

  const handleDisconnectGoogle = async () => {
    try {
      setIsGoogleConnected(false);
      // Get current config and remove only the refreshToken
      const currentConfig = await window.electronAPI.getConfig();
      await window.electronAPI.setConfig({
        ...currentConfig,
        google: {
          sheetId: currentConfig.google?.sheetId || '',
          sheetUrl: currentConfig.google?.sheetUrl || '',
          sheetName: currentConfig.google?.sheetName || 'Sheet1',
          refreshToken: ''
        }
      });
      setStatus({ type: 'success', message: 'Google account disconnected' });
    } catch (error: any) {
      setStatus({ type: 'error', message: error.message });
    }
  };

  const handleFetchModels = async () => {
    if (!llmApiKey) {
      setStatus({ type: 'error', message: 'Please enter your Gemini API key first' });
      return;
    }

    try {
      setFetchingModels(true);
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1/models?key=${llmApiKey}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch models');
      }

      const data = await response.json();
      const models = data.models
        .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m: any) => m.name.replace('models/', ''));
      
      setAvailableModels(models);
      setStatus({ type: 'success', message: `Found ${models.length} models` });
    } catch (error: any) {
      setStatus({ type: 'error', message: `Failed to fetch models: ${error.message}` });
    } finally {
      setFetchingModels(false);
    }
  };

  const handleTestGoogle = async () => {
    try {
      const gmailOk = await window.electronAPI.testGmailConnection();
      
      if (!gmailOk) {
        setStatus({ type: 'error', message: 'Gmail connection failed. Try reconnecting your account.' });
        setIsGoogleConnected(false);
        return;
      }
      
      setStatus({ type: 'success', message: 'Gmail connection successful!' });
    } catch (error: any) {
      setStatus({ type: 'error', message: error.message });
    }
  };

  const handleTestSheet = async () => {
    try {
      if (!sheetUrl) {
        setStatus({ type: 'error', message: 'Please enter a Sheet URL first' });
        return;
      }

      const sheetId = extractSheetId(sheetUrl);
      if (!sheetId) {
        setStatus({ type: 'error', message: 'Invalid Sheet URL. Please paste the full URL from your browser.' });
        return;
      }

      setStatus({ type: 'info', message: 'Testing sheet connection and validating columns...' });

      // Save the sheet config first so the test can access it
      await handleSave();

      const result = await window.electronAPI.testSheetsConnection();
      
      if (result.success) {
        setStatus({ type: 'success', message: 'Sheet validated! All required columns found: Email Address, First Name, Last Name' });
      } else {
        setStatus({ type: 'error', message: result.error || 'Sheet validation failed' });
      }
    } catch (error: any) {
      setStatus({ type: 'error', message: error.message });
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Configuration</h2>

      {status && (
        <div className={`mb-4 p-4 rounded ${
          status.type === 'success' ? 'bg-green-100 text-green-800' : 
          status.type === 'info' ? 'bg-blue-100 text-blue-800' :
          'bg-red-100 text-red-800'
        }`}>
          {status.message}
        </div>
      )}

      <div className="space-y-6">
        {/* User Info */}
        <section className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">User Information</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Full Name</label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="w-full px-3 py-2 border rounded"
                placeholder="John Doe"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Gmail Address</label>
              <input
                type="email"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                className="w-full px-3 py-2 border rounded"
                placeholder="john@yourdomain.com"
              />
            </div>
          </div>
        </section>

        {/* Google OAuth Connection */}
        <section className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Google Account Connection</h3>
          <div className="space-y-4">
            {!isGoogleConnected ? (
              <>
                <div className="p-3 bg-blue-50 rounded text-sm">
                  <p className="mb-2">This app needs access to your Google account to:</p>
                  <ul className="list-disc ml-5 space-y-1">
                    <li>Send emails through Gmail</li>
                    <li>Read and update your contact list in Google Sheets</li>
                  </ul>
                  <p className="mt-2 text-xs text-gray-600">
                    Your organization's admin has configured this app for internal use only.
                  </p>
                </div>
                
                <button
                  onClick={handleConnectGoogle}
                  disabled={isConnecting}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {isConnecting ? 'Opening browser...' : 'Connect Google Account'}
                </button>

                {showAuthCodeInput && (
                  <div className="mt-4 p-3 bg-yellow-50 rounded text-sm">
                    <p className="font-semibold mb-2">After authorizing in your browser:</p>
                    <ol className="list-decimal ml-5 space-y-1">
                      <li>Google will redirect you to a URL starting with <code className="bg-gray-200 px-1">http://localhost:3000/oauth2callback?code=...</code></li>
                      <li>Copy the entire <code className="bg-gray-200 px-1">code=...</code> value from the URL</li>
                      <li>Paste it in the box below and click "Save Authorization"</li>
                    </ol>
                    
                    <div className="mt-3">
                      <label className="block text-sm font-medium mb-1">Authorization Code</label>
                      <input
                        type="text"
                        value={authCode}
                        onChange={(e) => setAuthCode(e.target.value)}
                        className="w-full px-3 py-2 border rounded font-mono text-sm"
                        placeholder="Paste code here"
                      />
                      <button
                        onClick={handleSaveAuthCode}
                        className="mt-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                      >
                        Save Authorization
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center text-green-600 font-semibold">
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Google Account Connected
                </div>
                <button
                  onClick={handleTestGoogle}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Test Connection
                </button>
                <button
                  onClick={handleDisconnectGoogle}
                  className="ml-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Disconnect
                </button>
              </>
            )}
          </div>
        </section>

        {/* Google Sheets Configuration */}
        <section className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Google Sheets</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Sheet URL</label>
              <input
                type="text"
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                className="w-full px-3 py-2 border rounded text-sm"
                placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"
              />
              <p className="text-xs text-gray-500 mt-1">
                Paste the full URL from your browser's address bar
              </p>
              {sheetUrl && extractSheetId(sheetUrl) && (
                <p className="text-xs mt-2">
                  <a 
                    href={sheetUrl.startsWith('http') ? sheetUrl : `https://docs.google.com/spreadsheets/d/${sheetUrl}/edit`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    → Open Sheet in Browser
                  </a>
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Sheet Name (Tab)</label>
              <input
                type="text"
                value={sheetName}
                onChange={(e) => setSheetName(e.target.value)}
                className="w-full px-3 py-2 border rounded"
                placeholder="Sheet1"
              />
              <p className="text-xs text-gray-500 mt-1">
                The name of the tab in your spreadsheet (usually "Sheet1")
              </p>
            </div>
            <div className="mt-2 p-3 bg-blue-50 rounded text-sm">
              <p className="font-semibold mb-1">Sheet Requirements:</p>
              <ul className="list-disc ml-5 space-y-1">
                <li>Must have these columns: <code className="bg-gray-200 px-1">Email Address</code>, <code className="bg-gray-200 px-1">First Name</code>, <code className="bg-gray-200 px-1">Last Name</code></li>
                <li>Optional columns: <code className="bg-gray-200 px-1">Team Member</code>, <code className="bg-gray-200 px-1">Status</code>, <code className="bg-gray-200 px-1">Date Sent</code>, <code className="bg-gray-200 px-1">Gmail Message ID</code></li>
                <li>Your Google account must have edit access to the sheet</li>
              </ul>
            </div>
            <button
              onClick={handleTestSheet}
              disabled={!isGoogleConnected || !sheetUrl}
              className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Test Sheet
            </button>
          </div>
        </section>

        {/* LLM Configuration */}
        <section className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">LLM Configuration</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Provider</label>
              <select
                value={llmProvider}
                onChange={(e) => setLlmProvider(e.target.value as 'gemini' | 'openai')}
                className="w-full px-3 py-2 border rounded"
              >
                <option value="gemini">Google Gemini</option>
                <option value="openai">OpenAI GPT</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">API Key</label>
              <input
                type="password"
                value={llmApiKey}
                onChange={(e) => setLlmApiKey(e.target.value)}
                className="w-full px-3 py-2 border rounded"
                placeholder="sk-..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Model</label>
              {llmProvider === 'gemini' ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <select
                      value={llmModel}
                      onChange={(e) => setLlmModel(e.target.value)}
                      className="flex-1 px-3 py-2 border rounded"
                      disabled={fetchingModels}
                    >
                      {fetchingModels ? (
                        <option value="">Loading models...</option>
                      ) : availableModels.length === 0 ? (
                        <option value="">No models loaded - click Fetch Models</option>
                      ) : (
                        <>
                          <option value="">Select a model...</option>
                          {availableModels.map(model => (
                            <option key={model} value={model}>{model}</option>
                          ))}
                        </>
                      )}
                    </select>
                    <button
                      onClick={handleFetchModels}
                      disabled={fetchingModels || !llmApiKey}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {fetchingModels ? 'Fetching...' : 'Fetch Models'}
                    </button>
                  </div>
                  {availableModels.length === 0 && !fetchingModels && (
                    <p className="text-xs text-gray-500">
                      {llmApiKey ? 'Click "Fetch Models" to reload' : 'Enter API key to load models'}
                    </p>
                  )}
                </div>
              ) : (
                <input
                  type="text"
                  value={llmModel}
                  onChange={(e) => setLlmModel(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="gpt-3.5-turbo"
                />
              )}
              <p className="text-xs text-gray-500 mt-1">
                {llmProvider === 'gemini' 
                  ? 'Select which Gemini model to use for generation'
                  : 'Enter OpenAI model name (e.g., gpt-3.5-turbo, gpt-4)'}
              </p>
            </div>
          </div>
        </section>

        <button
          onClick={handleSave}
          className="w-full px-4 py-3 bg-green-600 text-white rounded hover:bg-green-700 font-semibold"
        >
          Save Configuration
        </button>
      </div>
    </div>
  );
};

export default ConfigTab;
