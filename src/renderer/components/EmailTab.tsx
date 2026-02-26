import React, { useState, useEffect } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { useApp } from '../context/AppContext';
import { Contact } from '../../shared/types';
import { generateEmail } from '../services/llm';
import { replaceVariables } from '../services/utils';

const EmailTab: React.FC = () => {
  const { config } = useApp();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [generatedTemplate, setGeneratedTemplate] = useState<string>(''); // Store template before personalization
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  useEffect(() => {
    loadContacts();
  }, []);

  useEffect(() => {
    // Subject is now extracted from generated email
  }, [currentIndex, contacts, config]);

  const loadContacts = async () => {
    try {
      const loadedContacts = await window.electronAPI.getContacts();
      setContacts(loadedContacts);
      if (loadedContacts.length === 0) {
        setStatus({ type: 'info', message: 'No unsent contacts found in the sheet.' });
      }
    } catch (error: any) {
      setStatus({ type: 'error', message: `Failed to load contacts: ${error.message}` });
    }
  };

  // Apply stored template to current contact
  const applyTemplateToContact = (template: string, contact: Contact) => {
    const personalizedText = replaceVariables(template, contact, config?.user.name || '');
    
    // Extract subject from first line
    const lines = personalizedText.split('\n');
    const subjectLine = lines[0].trim();
    const bodyText = lines.slice(1).join('\n').trim();
    
    setSubject(subjectLine);
    
    // Convert plain text to HTML paragraphs for ReactQuill
    const paragraphs = bodyText.split(/\n\n+/).filter(p => p.trim());
    const htmlParagraphs = paragraphs.map(p => `<p>${p.trim()}</p>`).join('\n');
    
    setBody(htmlParagraphs);
  };

  const handleGenerate = async () => {
    if (!config?.context.content) {
      setStatus({ type: 'error', message: 'Please configure a context template first' });
      return;
    }

    if (!config?.llm.model) {
      setStatus({ type: 'error', message: 'Please select an LLM model in Configuration' });
      return;
    }

    if (!contacts[currentIndex]) {
      setStatus({ type: 'error', message: 'No contact selected' });
      return;
    }

    console.log('=== EMAIL GENERATION START ===');
    console.log('Context content length:', config.context.content.length);
    console.log('Context content:', config.context.content);
    console.log('LLM config:', { provider: config.llm.provider, model: config.llm.model });

    setIsGenerating(true);
    setStatus({ type: 'info', message: 'Generating email...' });

    try {
      const generatedText = await generateEmail(config.context.content, config.llm);
      console.log('Generated text:', generatedText);
      
      // Store the template for reuse
      setGeneratedTemplate(generatedText);
      
      const contact = contacts[currentIndex];
      console.log('Current contact:', contact);
      
      // Apply template to current contact
      applyTemplateToContact(generatedText, contact);
      
      setStatus({ type: 'success', message: 'Email generated successfully' });
    } catch (error: any) {
      console.log('=== EMAIL GENERATION ERROR ===');
      console.log('Error:', error);
      setStatus({ type: 'error', message: `Generation failed: ${error.message}` });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendTest = async () => {
    if (!config?.user.email) {
      setStatus({ type: 'error', message: 'Please configure your email first' });
      return;
    }

    setIsSending(true);
    try {
      const result = await window.electronAPI.sendEmail({
        to: config.user.email,
        subject: subject + ' [TEST]',
        body,
        isTest: true
      });

      if (result.success) {
        setStatus({ type: 'success', message: 'Test email sent to your inbox!' });
      } else {
        setStatus({ type: 'error', message: `Failed to send test: ${result.error}` });
      }
    } catch (error: any) {
      setStatus({ type: 'error', message: error.message });
    } finally {
      setIsSending(false);
    }
  };

  const handleSend = async () => {
    const contact = contacts[currentIndex];

    setIsSending(true);
    try {
      const result = await window.electronAPI.sendEmail({
        to: contact.email,
        subject,
        body
      });

      if (result.success) {
        // Update contact in sheet
        const updatedContact = {
          ...contact,
          status: 'sent' as const,
          dateSent: new Date().toISOString(),
          messageId: result.messageId
        };

        await window.electronAPI.updateContact(updatedContact);
        
        setStatus({ type: 'success', message: `Email sent successfully to ${contact.firstName}!` });
        
        // Remove from list and move to next
        const newContacts = contacts.filter((_, i) => i !== currentIndex);
        setContacts(newContacts);
        
        if (newContacts.length === 0) {
          setStatus({ type: 'success', message: 'All emails sent! No more contacts.' });
        } else {
          const nextIndex = Math.min(currentIndex, newContacts.length - 1);
          setCurrentIndex(nextIndex);
          // Reuse template for next contact if available
          if (generatedTemplate) {
            applyTemplateToContact(generatedTemplate, newContacts[nextIndex]);
          }
        }
      } else {
        setStatus({ type: 'error', message: `Failed to send: ${result.error}` });
      }
    } catch (error: any) {
      setStatus({ type: 'error', message: error.message });
    } finally {
      setIsSending(false);
    }
  };

  const handleSkip = async () => {
    const contact = contacts[currentIndex];
    
    if (!confirm(`Skip ${contact.firstName} ${contact.lastName}?`)) {
      return;
    }

    try {
      const updatedContact = {
        ...contact,
        status: 'skipped' as const,
        dateSent: new Date().toISOString()
      };

      await window.electronAPI.updateContact(updatedContact);
      
      const newContacts = contacts.filter((_, i) => i !== currentIndex);
      setContacts(newContacts);
      
      if (newContacts.length === 0) {
        setStatus({ type: 'info', message: 'No more contacts to process.' });
      } else {
        const nextIndex = Math.min(currentIndex, newContacts.length - 1);
        setCurrentIndex(nextIndex);
        // Reuse template for next contact if available
        if (generatedTemplate) {
          applyTemplateToContact(generatedTemplate, newContacts[nextIndex]);
        }
      }
    } catch (error: any) {
      setStatus({ type: 'error', message: error.message });
    }
  };

  const handleNext = () => {
    if (currentIndex < contacts.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      // Reuse template for next contact if available
      if (generatedTemplate) {
        applyTemplateToContact(generatedTemplate, contacts[nextIndex]);
      }
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setBody('');
      setStatus(null);
    }
  };

  if (contacts.length === 0) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <h2 className="text-2xl font-bold mb-6">Send Emails</h2>
        <div className="bg-yellow-50 p-6 rounded-lg">
          <p className="text-yellow-800">
            No unsent contacts found. Please check your Google Sheet configuration or all emails may have been sent.
          </p>
          <button
            onClick={loadContacts}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Refresh Contacts
          </button>
        </div>
      </div>
    );
  }

  const currentContact = contacts[currentIndex];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Send Emails</h2>

      {status && (
        <div className={`mb-4 p-4 rounded ${
          status.type === 'success' ? 'bg-green-100 text-green-800' :
          status.type === 'error' ? 'bg-red-100 text-red-800' :
          'bg-blue-100 text-blue-800'
        }`}>
          {status.message}
        </div>
      )}

      <div className="mb-6 bg-white p-4 rounded-lg shadow">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">
            Contact {currentIndex + 1} of {contacts.length}
          </h3>
          <div className="flex gap-2">
            <button
              onClick={handlePrevious}
              disabled={currentIndex === 0}
              className="px-3 py-1 bg-gray-300 rounded hover:bg-gray-400 disabled:opacity-50"
            >
              ← Previous
            </button>
            <button
              onClick={handleNext}
              disabled={currentIndex === contacts.length - 1}
              className="px-3 py-1 bg-gray-300 rounded hover:bg-gray-400 disabled:opacity-50"
            >
              Next →
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600">First Name</label>
            <p className="text-lg">{currentContact.firstName}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600">Last Name</label>
            <p className="text-lg">{currentContact.lastName}</p>
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-600">Email</label>
            <p className="text-lg">{currentContact.email}</p>
          </div>
        </div>
      </div>

      <div className="mb-4">
        <button
          onClick={handleGenerate}
          disabled={isGenerating || isSending}
          className="px-6 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
        >
          {isGenerating ? 'Generating...' : 'Generate Email'}
        </button>
      </div>

      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full px-3 py-2 border rounded"
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Body</label>
          <ReactQuill
            theme="snow"
            value={body}
            onChange={setBody}
            className="h-64 mb-12"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSendTest}
          disabled={!body || isSending}
          className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          Send Test to Self
        </button>
        <button
          onClick={handleSend}
          disabled={!body || isSending}
          className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
        >
          {isSending ? 'Sending...' : 'Send Email'}
        </button>
        <button
          onClick={handleSkip}
          disabled={isSending}
          className="px-6 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50"
        >
          Skip
        </button>
      </div>
    </div>
  );
};

export default EmailTab;
