import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useApp } from '../context/AppContext';

const ContextTab: React.FC = () => {
  const { config, updateConfig } = useApp();
  const [content, setContent] = useState('');
  const [filePath, setFilePath] = useState<string | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (config?.context.content) {
      setContent(config.context.content);
      setFilePath(config.context.lastFilePath || null);
    }
  }, [config]);

  useEffect(() => {
    if (content && filePath) {
      const timer = setTimeout(() => {
        handleAutoSave();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [content]);

  const handleOpenFile = async () => {
    const result = await window.electronAPI.selectFile();
    if (result) {
      setFilePath(result.path);
      setContent(result.content);
      await updateConfig({
        context: {
          lastFilePath: result.path,
          content: result.content
        }
      });
      setStatus({ type: 'success', message: 'File loaded successfully' });
      setHasChanges(false);
    }
  };

  const handleAutoSave = async () => {
    if (filePath && hasChanges) {
      try {
        await window.electronAPI.saveFile(filePath, content);
        await updateConfig({
          context: {
            lastFilePath: filePath,
            content
          }
        });
        setHasChanges(false);
        setStatus({ type: 'success', message: 'Auto-saved' });
        setTimeout(() => setStatus(null), 2000);
      } catch (error: any) {
        setStatus({ type: 'error', message: `Auto-save failed: ${error.message}` });
      }
    }
  };

  const handleContentChange = (value: string) => {
    setContent(value);
    setHasChanges(true);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Email Context Template (Markdown)</h2>

      <div className="mb-4 h-14 flex items-center">
        {status && (
          <div className={`w-full px-4 py-2 rounded ${status.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {status.message}
          </div>
        )}
      </div>

      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={handleOpenFile}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Open Markdown File
          </button>
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            {showPreview ? 'Edit' : 'Preview'}
          </button>
          {filePath && (
            <span className="text-sm text-gray-600 flex items-center">
              {filePath}
              {hasChanges && <span className="ml-2 text-orange-500">● Unsaved</span>}
            </span>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-lg p-4">
        <div className="mb-4">
          <p className="text-sm text-gray-600 mb-2">
            Use {`{{firstName}}`} and {`{{lastName}}`} to personalize emails for each contact. Supports full Markdown syntax.
          </p>
        </div>

        {showPreview ? (
          <div className="prose prose-sm max-w-none p-4 border border-gray-200 rounded min-h-96 overflow-auto">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content}
            </ReactMarkdown>
          </div>
        ) : (
          <textarea
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            className="w-full h-96 p-4 border border-gray-300 rounded font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter your email template in Markdown format..."
          />
        )}
      </div>

      {!filePath && (
        <div className="mt-6 p-4 bg-blue-50 rounded">
          <p className="text-sm text-blue-800">
            <strong>Tip:</strong> Open a Markdown (.md) file to start creating your email template. 
            The template will be used to generate personalized emails for each contact.
          </p>
        </div>
      )}
    </div>
  );
};

export default ContextTab;
