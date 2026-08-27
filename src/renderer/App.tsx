import { useState, useEffect, useRef } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import ConfigTab from './components/ConfigTab';
import ContextTab from './components/ContextTab';
import EmailTab from './components/EmailTab';
import BulkSendTab from './components/BulkSendTab';
import './index.css';

type Tab = 'config' | 'context' | 'email' | 'bulk';

function AppContent() {
  const { config } = useApp();
  const [activeTab, setActiveTab] = useState<Tab>('config');
  const initialTabSet = useRef(false);
  const [showBounceModal, setShowBounceModal] = useState(false);
  const [isAddingBounceColumns, setIsAddingBounceColumns] = useState(false);
  const [showLabelInputModal, setShowLabelInputModal] = useState(false);
  const [labelInput, setLabelInput] = useState('');
  const bounceCheckDone = useRef(false);

  // Check for required bounce columns on startup
  useEffect(() => {
    const checkBounceColumns = async () => {
      if (bounceCheckDone.current) return;
      if (!config?.google?.refreshToken || !config?.google?.sheetId) return;

      try {
        const result = await (window as any).electronAPI.checkBounceColumns();
        
        if (!result.exists && !result.error) {
          console.log('[App] Bounce columns missing, showing modal');
          setShowBounceModal(true);
        } else if (result.exists) {
          console.log('[App] ✓ Bounce columns exist');
        }
        
        bounceCheckDone.current = true;
      } catch (error) {
        console.error('[App] Error checking bounce columns:', error);
      }
    };

    checkBounceColumns();
  }, [config?.google?.refreshToken, config?.google?.sheetId]);

  const handleAddBounceColumns = async () => {
    setIsAddingBounceColumns(true);
    try {
      // Step 1: Add bounce columns to sheet
      const result = await (window as any).electronAPI.addBounceColumns();
      
      if (!result.success) {
        alert(`Failed to add bounce columns: ${result.error}`);
        setIsAddingBounceColumns(false);
        return;
      }

      console.log('[App] ✓ Bounce columns added');

      // Step 2: Ask about checking other Gmail labels/folders
      const checkOtherLabel = confirm(
        'Bounce columns added successfully!\n\n' +
        'Now checking for historical bounces from the last 60 days.\n\n' +
        'Some email clients move bounce messages to folders like "Spam" or custom labels.\n\n' +
        'Would you like to also check a specific Gmail label/folder?\n\n' +
        '(Click OK to specify a label, or Cancel to check only the main inbox)'
      );

      if (checkOtherLabel) {
        // Show modal for label input instead of prompt()
        setShowLabelInputModal(true);
        setIsAddingBounceColumns(false);
        return;
      }

      // Step 3: Check for bounces from last 60 days
      await checkBouncesAndProcess(undefined);
    } catch (error: any) {
      console.error('[App] Error in bounce setup:', error);
      alert(`Error during bounce setup: ${error.message}`);
    } finally {
      setIsAddingBounceColumns(false);
    }
  };

  const checkBouncesAndProcess = async (labelName: string | undefined) => {
    try {
      console.log('[App] Checking for bounces from last 60 days...');
      const bounceResult = await (window as any).electronAPI.checkBounces({ 
        daysBack: 60, 
        labelName 
      });

      if (!bounceResult.success) {
        console.error('[App] Bounce check failed:', bounceResult.error);
        alert(`Bounce columns added, but failed to check for historical bounces: ${bounceResult.error}`);
        setShowBounceModal(false);
        setIsAddingBounceColumns(false);
        return;
      }

      if (bounceResult.bounces.length === 0) {
        alert('Setup complete! No bounced emails found in the last 60 days.');
        setShowBounceModal(false);
        setIsAddingBounceColumns(false);
        return;
      }

      // Step 4: Process and update spreadsheet
      console.log('[App] Processing', bounceResult.bounces.length, 'bounces...');
      const processResult = await (window as any).electronAPI.processBounces(bounceResult.bounces);

      if (processResult.success) {
        alert(
          `Setup complete!\n\n` +
          `Found ${bounceResult.bounces.length} bounce(s) from last 60 days.\n` +
          `Updated ${processResult.updated} contact(s) in your spreadsheet.`
        );
        setShowBounceModal(false);
      } else {
        alert(
          `Bounces found but failed to update spreadsheet: ${processResult.error}\n\n` +
          `Found ${bounceResult.bounces.length} bounce(s) that need manual review.`
        );
        setShowBounceModal(false);
      }
    } catch (error: any) {
      console.error('[App] Error in bounce check:', error);
      alert(`Error during bounce check: ${error.message}`);
    }
  };

  const handleLabelInputSubmit = async () => {
    const labelName = labelInput.trim() || undefined;
    setShowLabelInputModal(false);
    setLabelInput('');
    await checkBouncesAndProcess(labelName);
  };

  const handleLabelInputCancel = async () => {
    setShowLabelInputModal(false);
    setLabelInput('');
    // Check without label
    await checkBouncesAndProcess(undefined);
  };

  const handleDeclineBounceColumns = () => {
    alert('This app requires Bounce Date and Bounce Reason columns to function. Please add them to continue.');
    // Don't close the modal - user must add columns or close the app
  };

  // Determine initial tab based on configuration completeness
  useEffect(() => {
    if (!config || initialTabSet.current) return;

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
    
    initialTabSet.current = true;
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
            <button
              onClick={() => setActiveTab('bulk')}
              className={`py-4 px-6 border-b-2 font-medium text-sm ${
                activeTab === 'bulk'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Bulk Send
            </button>
          </div>
        </div>
      </nav>

      <main className="py-8">
        {activeTab === 'config' && <ConfigTab />}
        {activeTab === 'context' && <ContextTab />}
        {activeTab === 'email' && <EmailTab />}
        {activeTab === 'bulk' && <BulkSendTab />}
      </main>

      {/* Bounce Columns Required Modal */}
      {showBounceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4">
            <h2 className="text-xl font-bold mb-4">Bounce Tracking Columns Required</h2>
            <p className="mb-4 text-gray-700">
              This app requires <strong>Bounce Date</strong> and <strong>Bounce Reason</strong> columns in your Google Sheet for bounce tracking.
            </p>
            <p className="mb-6 text-gray-700">
              These columns will be added to your sheet automatically.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={handleDeclineBounceColumns}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
                disabled={isAddingBounceColumns}
              >
                Cancel
              </button>
              <button
                onClick={handleAddBounceColumns}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                disabled={isAddingBounceColumns}
              >
                {isAddingBounceColumns ? 'Adding...' : 'Add Columns'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gmail Label Input Modal */}
      {showLabelInputModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4">
            <h2 className="text-xl font-bold mb-4">Check Gmail Label/Folder</h2>
            <p className="mb-4 text-gray-700">
              Enter the Gmail label name to check for bounces (e.g., "Bounces", "Spam", "Archive").
            </p>
            <p className="mb-4 text-gray-700 text-sm">
              Leave blank to check only the main inbox.
            </p>
            <input
              type="text"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              placeholder="Label name (optional)"
              className="w-full px-3 py-2 border border-gray-300 rounded mb-6 focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleLabelInputSubmit();
                }
              }}
              autoFocus
            />
            <div className="flex justify-end space-x-3">
              <button
                onClick={handleLabelInputCancel}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Skip
              </button>
              <button
                onClick={handleLabelInputSubmit}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Check Label
              </button>
            </div>
          </div>
        </div>
      )}
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
