import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { validateEmail } from '../services/utils';

const ConfigTab: React.FC = () => {
  const { config, updateConfig } = useApp();
  const [userName, setUserName] = useState(config?.user.name || '');
  const [userEmail, setUserEmail] = useState(config?.user.email || '');
  const [sheetUrl, setSheetUrl] = useState(config?.google?.sheetUrl || '');
  const [sheetName, setSheetName] = useState(config?.google?.sheetName || 'Sheet1');
  const [scriptUrl, setScriptUrl] = useState(config?.google?.scriptUrl || '');
  const [llmProvider, setLlmProvider] = useState<'gemini' | 'openai'>(config?.llm.provider || 'gemini');
  const [llmModel, setLlmModel] = useState(config?.llm.model || '');
  const [userStatus, setUserStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [googleStatus, setGoogleStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [sheetStatus, setSheetStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [llmStatus, setLlmStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
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
      setScriptUrl(config.google?.scriptUrl || '');
      setLlmProvider(config.llm.provider);
      setLlmModel(config.llm.model);
      setAvailableModels(config.llm.availableModels || []);
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

  const saveUserConfig = async () => {
    if (!userName || !userEmail) {
      setUserStatus({ type: 'error', message: 'Name and email are required' });
      return;
    }

    if (!validateEmail(userEmail)) {
      setUserStatus({ type: 'error', message: 'Invalid email address' });
      return;
    }

    try {
      const configUpdate: any = {
        user: { name: userName, email: userEmail },
        llm: config?.llm || { provider: 'gemini', model: '' }
      };

      if (config?.google) {
        configUpdate.google = config.google;
      }

      await updateConfig(configUpdate);
      setUserStatus({ type: 'success', message: 'Saved' });
    } catch (error: any) {
      setUserStatus({ type: 'error', message: error.message });
    }
  };

  const saveSheetConfig = async () => {
    if (!sheetUrl) {
      // Clear sheet config if URL is empty
      if (config?.google?.refreshToken) {
        try {
          await updateConfig({
            user: config.user,
            llm: config.llm,
            google: {
              ...config.google,
              sheetId: '',
              sheetUrl: '',
              sheetName: 'Sheet1'
            }
          });
        } catch (error: any) {
          setSheetStatus({ type: 'error', message: error.message });
        }
      }
      return;
    }

    const extractedId = extractSheetId(sheetUrl);
    if (!extractedId) {
      setSheetStatus({ type: 'error', message: 'Invalid Sheet URL' });
      return;
    }

    if (!config?.google?.refreshToken) {
      setSheetStatus({ type: 'error', message: 'Connect Google account first' });
      return;
    }

    try {
      await updateConfig({
        user: config.user,
        llm: config.llm,
        google: {
          ...config.google,
          sheetId: extractedId,
          sheetUrl,
          sheetName
        }
      });
      setSheetStatus({ type: 'success', message: 'Saved' });
    } catch (error: any) {
      setSheetStatus({ type: 'error', message: error.message });
    }
  };

const saveLLMConfig = async (overrideModel?: string, overrideProvider?: string, overrideModels?: string[]) => {
    try {
      const currentModel = overrideModel !== undefined ? overrideModel : llmModel;
      const currentProvider = overrideProvider !== undefined ? overrideProvider : llmProvider;
      const currentAvailableModels = overrideModels !== undefined ? overrideModels : availableModels;

      const configUpdate: any = {
        user: config?.user || { name: '', email: '' },
        llm: {
          ...(config?.llm || {}),
          provider: currentProvider,
          model: currentModel || '',
          availableModels: currentAvailableModels.length > 0 ? currentAvailableModels : undefined
        }
      };

      if (config?.google) {
        configUpdate.google = config.google;
      }

      await updateConfig(configUpdate);

      // Only show success message if a model was selected
      if (currentModel) {
        setLlmStatus({ type: 'success', message: 'Saved' });
      }
    } catch (error: any) {
      setLlmStatus({ type: 'error', message: error.message });
    }
  };



  const handleConnectGoogle = async () => {
    try {
      // Debug: Check if electronAPI is available
      if (!window.electronAPI) {
        setGoogleStatus({ type: 'error', message: 'electronAPI is not available. Please restart the app.' });
        console.error('window.electronAPI is undefined');
        return;
      }
      
      if (!window.electronAPI.authorizeGmail || !window.electronAPI.fetchConfigFromScript) {
        setGoogleStatus({ type: 'error', message: 'Required methods are not available' });
        console.error('window.electronAPI methods are missing');
        return;
      }
      
      setIsConnecting(true);

      if (!scriptUrl) {
         setGoogleStatus({ type: 'error', message: 'Please enter the Apps Script URL first.' });
         setIsConnecting(false);
         return;
      }

      setGoogleStatus({ type: 'info', message: 'Step 1: Opening browser to fetch initial secure configuration...' });
      
      const newConfigWithSecrets = await window.electronAPI.fetchConfigFromScript(scriptUrl);
      
      // Update context config to rely on the fetched secrets
      await updateConfig(newConfigWithSecrets);

      setGoogleStatus({ type: 'info', message: 'Step 2: Opening browser for Google Workspace authorization...' });

      // This will open the browser and automatically handle the OAuth callback
      const result = await window.electronAPI.authorizeGmail();
      
      if (result.success) {
        setIsGoogleConnected(true);
        setGoogleStatus({ type: 'success', message: 'Configuration and Google account connected successfully!' });
        setIsConnecting(false);
        setShowAuthCodeInput(false);
        
        // Reload config to get the refresh token
        const newConfig = await window.electronAPI.getConfig();
        await updateConfig(newConfig);
      } else {
        setGoogleStatus({ type: 'error', message: result.error || 'Authorization failed' });
        setIsConnecting(false);
        setShowAuthCodeInput(false);
      }
    } catch (error: any) {
      if (error.message && error.message.includes('Connection attempt was cancelled.')) {
        // Ignored. The user started a new connection attempt or cancelled.
        return; 
      }
      setGoogleStatus({ type: 'error', message: error.message });
      setIsConnecting(false);
      setShowAuthCodeInput(false);
    }
  };

  const handleSaveAuthCode = async () => {
    if (!authCode) {
      setGoogleStatus({ type: 'error', message: 'Please enter the authorization code' });
      return;
    }

    try {
      setGoogleStatus({ type: 'info', message: 'Saving authorization...' });
      const success = await window.electronAPI.saveGmailTokens(authCode);
      
      if (success) {
        setIsGoogleConnected(true);
        setAuthCode('');
        setGoogleStatus({ type: 'success', message: 'Google account connected successfully!' });
        
        // Reload config to get the refresh token
        const newConfig = await window.electronAPI.getConfig();
        await updateConfig(newConfig);
      } else {
        setGoogleStatus({ type: 'error', message: 'Failed to save authorization. Please try again.' });
      }
    } catch (error: any) {
      setGoogleStatus({ type: 'error', message: error.message });
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
          ...currentConfig.google,
          sheetId: currentConfig.google?.sheetId || '',
          sheetUrl: currentConfig.google?.sheetUrl || '',
          sheetName: currentConfig.google?.sheetName || 'Sheet1',
          refreshToken: ''
        }
      });
      setGoogleStatus({ type: 'success', message: 'Google account disconnected' });
    } catch (error: any) {
      setGoogleStatus({ type: 'error', message: error.message });
    }
  };

  const handleFetchModels = async () => {
    if (!isGoogleConnected) {
      setLlmStatus({ type: 'error', message: 'Please connect your Google account first' });
      return;
    }

    try {
      setFetchingModels(true);
      setLlmStatus({ type: 'info', message: 'Fetching models...' });
      
      // Fetch API key from Secret Manager
      const apiKey = await window.electronAPI.getLLMApiKey();
      
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch models');
      }

      const data = await response.json();
      const models = data.models
        .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m: any) => m.name.replace('models/', ''));
      
      setAvailableModels(models);
      
      // Save the fetched models to config
      try {
        const configUpdate: any = {
          user: config?.user || { name: '', email: '' },
          llm: {
            ...(config?.llm || {}),
            provider: llmProvider,
            model: llmModel || '',
            availableModels: models
          }
        };
        if (config?.google) {
          configUpdate.google = config.google;
        }
        await updateConfig(configUpdate);
      } catch (error: any) {
        console.error('Failed to save models to config:', error);
      }
      
      setLlmStatus({ type: 'success', message: `Found ${models.length} models` });
    } catch (error: any) {
      setLlmStatus({ type: 'error', message: `Failed to fetch models: ${error.message}` });
    } finally {
      setFetchingModels(false);
    }
  };

  const handleTestGoogle = async () => {
    try {
      const gmailOk = await window.electronAPI.testGmailConnection();
      
      if (!gmailOk) {
        setGoogleStatus({ type: 'error', message: 'Gmail connection failed. Try reconnecting your account.' });
        setIsGoogleConnected(false);
        return;
      }
      
      setGoogleStatus({ type: 'success', message: 'Gmail connection successful!' });
    } catch (error: any) {
      setGoogleStatus({ type: 'error', message: error.message });
    }
  };

  const handleTestSheet = async () => {
    try {
      if (!sheetUrl) {
        setSheetStatus({ type: 'error', message: 'Please enter a Sheet URL first' });
        return;
      }

      const sheetId = extractSheetId(sheetUrl);
      if (!sheetId) {
        setSheetStatus({ type: 'error', message: 'Invalid Sheet URL. Please paste the full URL from your browser.' });
        return;
      }

      setSheetStatus({ type: 'info', message: 'Testing sheet connection and validating columns...' });

      // Save the sheet config first so the test can access it
      await saveSheetConfig();

      const result = await window.electronAPI.testSheetsConnection();
      
      if (result.success) {
        setSheetStatus({ type: 'success', message: 'Sheet validated! All required columns found.' });
      } else {
        setSheetStatus({ type: 'error', message: result.error || 'Sheet validation failed' });
      }
    } catch (error: any) {
      setSheetStatus({ type: 'error', message: error.message });
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Configuration</h2>

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
                onBlur={saveUserConfig}
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
                onBlur={saveUserConfig}
                className="w-full px-3 py-2 border rounded"
                placeholder="john@yourdomain.com"
              />
            </div>
            {userStatus && (
              <div className={`p-2 rounded text-sm ${
                userStatus.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {userStatus.message}
              </div>
            )}
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
                
              <div className="mt-4 grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Apps Script Web App URL</label>
                  <input
                    type="text"
                    value={scriptUrl}
                    onChange={(e) => setScriptUrl(e.target.value)}
                    className="w-full px-3 py-2 border rounded"
                    placeholder="https://script.google.com/macros/s/.../exec"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Paste the Web App URL provided by your administrator. It securely configures this app.
                  </p>
                </div>
              </div>

              {googleStatus && (
                  <div className={`p-2 rounded text-sm ${
                    googleStatus.type === 'success' ? 'bg-green-100 text-green-800' : 
                    googleStatus.type === 'info' ? 'bg-blue-100 text-blue-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {googleStatus.message}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={handleConnectGoogle}
                    disabled={isConnecting}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
                  >
                    {isConnecting ? 'Opening browser...' : 'Connect Google Account'}
                  </button>
                  {isConnecting && (
                    <button
                      onClick={() => setIsConnecting(false)}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
                    >
                      Cancel / It didn't open
                    </button>
                  )}
                </div>

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
                
                {googleStatus && (
                  <div className={`p-2 rounded text-sm ${
                    googleStatus.type === 'success' ? 'bg-green-100 text-green-800' : 
                    googleStatus.type === 'info' ? 'bg-blue-100 text-blue-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {googleStatus.message}
                  </div>
                )}

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
                onBlur={saveSheetConfig}
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
                onBlur={saveSheetConfig}
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
            
            {sheetStatus && (
              <div className={`p-2 rounded text-sm ${
                sheetStatus.type === 'success' ? 'bg-green-100 text-green-800' : 
                sheetStatus.type === 'info' ? 'bg-blue-100 text-blue-800' :
                'bg-red-100 text-red-800'
              }`}>
                {sheetStatus.message}
              </div>
            )}

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
                onChange={(e) => {
                  const newProvider = e.target.value as 'gemini' | 'openai';
                  setLlmProvider(newProvider);
                  // Clear model when switching providers
                  setLlmModel('');
                  setAvailableModels([]);
                  // Auto-save immediately when selecting a provider
                  saveLLMConfig('', newProvider, []);
                }}
                className="w-full px-3 py-2 border rounded"
              >
                <option value="gemini">Google Gemini</option>
                <option value="openai">OpenAI GPT</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                The LLM API key is centrally managed via Google Cloud Secret Manager
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Model</label>
              {llmProvider === 'gemini' ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <select
                      value={llmModel}
                      onChange={(e) => {
                        const newModel = e.target.value;
                        setLlmModel(newModel);
                        // Auto-save immediately when selecting a model
                        saveLLMConfig(newModel, llmProvider, availableModels);
                      }}
                      className="flex-1 px-3 py-2 border rounded"
                      disabled={fetchingModels}
                    >
                      {fetchingModels ? (
                        <option value="">Loading models...</option>
                      ) : availableModels.length === 0 ? (
                        // Show saved model if available, otherwise prompt to fetch
                        llmModel ? (
                          <>
                            <option value={llmModel}>{llmModel}</option>
                            <option value="">-- Fetch models to see more options --</option>
                          </>
                        ) : (
                          <option value="">No models loaded - click Fetch Models</option>
                        )
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
                      disabled={fetchingModels || !isGoogleConnected}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {fetchingModels ? 'Fetching...' : 'Fetch Models'}
                    </button>
                  </div>
                  {availableModels.length === 0 && !fetchingModels && (
                    <p className="text-xs text-gray-500">
                      {isGoogleConnected ? 'Click "Fetch Models" to load available models' : 'Connect your Google account to load models'}
                    </p>
                  )}
                </div>
              ) : (
                <input
                  type="text"
                  value={llmModel}
                  onChange={(e) => setLlmModel(e.target.value)}
                  onBlur={() => saveLLMConfig(llmModel)}
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
            
            {llmStatus && (
              <div className={`p-2 rounded text-sm ${
                llmStatus.type === 'success' ? 'bg-green-100 text-green-800' : 
                llmStatus.type === 'info' ? 'bg-blue-100 text-blue-800' :
                'bg-red-100 text-red-800'
              }`}>
                {llmStatus.message}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default ConfigTab;
