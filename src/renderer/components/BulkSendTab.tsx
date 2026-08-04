import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { useApp } from '../context/AppContext';
import { Contact, BulkSendState } from '../../shared/types';
import { generateEmail } from '../services/llm';
import { replaceVariables, markdownToHtml } from '../services/utils';

interface LogEntry {
  timestamp: string;
  name: string;
  success: boolean;
  error?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function computeBaseInterval(maxPer24h: number): number {
  return Math.floor((8 * 3600) / Math.max(1, maxPer24h));
}

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const BulkSendTab: React.FC = () => {
  const { config } = useApp();

  // UI state
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [remainingCount, setRemainingCount] = useState(0);
  const [sentLast24h, setSentLast24h] = useState(0);
  const [maxPer24h, setMaxPer24h] = useState(400);
  const [isActive, setIsActive] = useState(false);
  const [nextSendAt, setNextSendAt] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [currentContact, setCurrentContact] = useState<Contact | null>(null);
  const [currentSubject, setCurrentSubject] = useState('');
  const [currentBody, setCurrentBody] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [statusLog, setStatusLog] = useState<LogEntry[]>([]);
  const [statusMsg, setStatusMsg] = useState<{
    type: 'success' | 'error' | 'info' | 'warning';
    message: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  // Refs for stable cross-render access inside async callbacks
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const contactsRef = useRef<Contact[]>([]);
  const isActiveRef = useRef(false);
  const nextSendAtRef = useRef<number | null>(null);
  const sentLogRef = useRef<string[]>([]);
  const maxPer24hRef = useRef(400);
  const isBusyRef = useRef(false);

  // Helpers that update both state and ref atomically
  const setContactsSync = (c: Contact[]) => { contactsRef.current = c; setContacts(c); };
  const setIsActiveSync = (v: boolean) => { isActiveRef.current = v; setIsActive(v); };
  const setNextSendAtSync = (v: number | null) => { nextSendAtRef.current = v; setNextSendAt(v); };

  // Persist current state to electron-store
  const saveState = useCallback(() => {
    const state: BulkSendState = {
      isActive: isActiveRef.current,
      maxPer24h: maxPer24hRef.current,
      nextSendAt: nextSendAtRef.current
        ? new Date(nextSendAtRef.current).toISOString()
        : null,
      sentLog: sentLogRef.current,
    };
    window.electronAPI.setBulkSendState(state);
  }, []);

  // On mount: load contacts, restore persisted state, resume if needed
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const loadedContacts = await window.electronAPI.getContacts();
        setContactsSync(loadedContacts);
        setRemainingCount(loadedContacts.length);

        const state = await window.electronAPI.getBulkSendState();
        const savedMax = state?.maxPer24h ?? 400;
        maxPer24hRef.current = savedMax;
        setMaxPer24h(savedMax);

        // Prune sent log to last 24 h
        const now = Date.now();
        const rawLog: string[] = state?.sentLog ?? [];
        const prunedLog = rawLog.filter(t => now - new Date(t).getTime() < DAY_MS);
        sentLogRef.current = prunedLog;

        if (prunedLog.length > 0) {
          setSentLast24h(prunedLog.length);
        } else {
          // First run or all entries expired — seed from sheet
          const sheetCount = await window.electronAPI.getSentCountFromSheet();
          setSentLast24h(sheetCount);
        }

        // Resume if bulk send was active when the app last closed
        if (state?.isActive && state?.nextSendAt && loadedContacts.length > 0) {
          const scheduled = new Date(state.nextSendAt).getTime();
          // 2 s grace period on startup to let the app fully initialize
          const resumeAt = Math.max(scheduled, now + 2000);
          setIsActiveSync(true);
          setNextSendAtSync(resumeAt);
        }
      } catch (err: any) {
        setStatusMsg({ type: 'error', message: `Initialization failed: ${err.message}` });
      } finally {
        setLoading(false);
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The core send operation — assigned to a ref so the countdown timer always
  // calls the latest version without needing to be in its dependency array.
  const performSendRef = useRef<() => Promise<void>>(async () => { /* no-op until init */ });

  performSendRef.current = async () => {
    if (isBusyRef.current) return;
    isBusyRef.current = true;

    const cfg = configRef.current;
    const contactList = contactsRef.current;

    if (!contactList.length || !isActiveRef.current) {
      if (!contactList.length) {
        setIsActiveSync(false);
        setNextSendAtSync(null);
        saveState();
        setStatusMsg({ type: 'success', message: 'All emails sent!' });
      }
      isBusyRef.current = false;
      return;
    }

    const contact = contactList[0];
    setCurrentContact(contact);
    setCurrentSubject('');
    setCurrentBody('');

    try {
      // 1. Generate email
      setIsGenerating(true);
      setStatusMsg({ type: 'info', message: `Generating email for ${contact.firstName}…` });

      const generatedText = await generateEmail(cfg!.context.content!, cfg!.llm);
      const personalized = replaceVariables(generatedText, contact, cfg?.user.name ?? '');

      const lines = personalized.split('\n');
      const subject = lines[0].trim();
      const bodyText = lines.slice(1).join('\n').trim();
      const htmlBody = markdownToHtml(bodyText);

      setCurrentSubject(subject);
      setCurrentBody(htmlBody);
      setIsGenerating(false);

      // 2. Send (with one retry on failure)
      setIsSending(true);
      setStatusMsg({ type: 'info', message: `Sending to ${contact.firstName} ${contact.lastName}…` });

      let result = await window.electronAPI.sendEmail({
        to: contact.email,
        subject,
        body: htmlBody,
      });

      if (!result.success) {
        await new Promise<void>(r => setTimeout(r, 5000));
        result = await window.electronAPI.sendEmail({
          to: contact.email,
          subject,
          body: htmlBody,
        });
      }

      if (!result.success) {
        throw new Error(result.error ?? 'Send failed after retry');
      }

      // 3. Update sheet
      const sheetOk = await window.electronAPI.updateContact({
        ...contact,
        status: 'sent' as const,
        dateSent: new Date().toISOString(),
        messageId: result.messageId,
      });

      // 4. Update local sent log
      const nowIso = new Date().toISOString();
      sentLogRef.current = [
        ...sentLogRef.current.filter(t => Date.now() - new Date(t).getTime() < DAY_MS),
        nowIso,
      ];
      const newSent24h = sentLogRef.current.length;
      setSentLast24h(newSent24h);

      // 5. Remove sent contact from list
      const newContacts = contactList.slice(1);
      setContactsSync(newContacts);
      setRemainingCount(newContacts.length);

      // 6. Update status log
      setStatusLog(prev => [
        {
          timestamp: new Date().toLocaleTimeString(),
          name: `${contact.firstName} ${contact.lastName}`,
          success: true,
        },
        ...prev,
      ].slice(0, 5));

      if (!sheetOk) {
        setStatusMsg({
          type: 'warning',
          message: `Sent to ${contact.firstName} but sheet update failed — check connection.`,
        });
      } else {
        setStatusMsg({
          type: 'success',
          message: `Sent to ${contact.firstName} ${contact.lastName}`,
        });
      }

      // 7. Check daily rate limit
      if (newSent24h >= maxPer24hRef.current) {
        const oldestTs = Math.min(
          ...sentLogRef.current.map(t => new Date(t).getTime())
        );
        const resumeTime = new Date(oldestTs + DAY_MS).toLocaleTimeString();
        setIsActiveSync(false);
        setNextSendAtSync(null);
        saveState();
        setStatusMsg({
          type: 'warning',
          message: `Daily limit of ${maxPer24hRef.current} reached. Paused — resumes at ${resumeTime}.`,
        });
        isBusyRef.current = false;
        return;
      }

      // 8. Schedule next send or finish
      if (newContacts.length === 0) {
        setIsActiveSync(false);
        setNextSendAtSync(null);
        saveState();
        setStatusMsg({ type: 'success', message: 'All emails sent!' });
      } else if (isActiveRef.current) {
        const base = computeBaseInterval(maxPer24hRef.current);
        const jitter = Math.floor(Math.random() * 31); // 0–30 s
        const next = Date.now() + (base + jitter) * 1000;
        setNextSendAtSync(next);
        saveState();
      }
    } catch (err: any) {
      setIsGenerating(false);
      setIsSending(false);

      setStatusLog(prev => [
        {
          timestamp: new Date().toLocaleTimeString(),
          name: `${contact.firstName} ${contact.lastName}`,
          success: false,
          error: err.message,
        },
        ...prev,
      ].slice(0, 5));

      // Mark error in sheet and skip to next contact
      try {
        await window.electronAPI.updateContact({
          ...contact,
          status: 'error' as const,
          dateSent: new Date().toISOString(),
        });
      } catch { /* best effort */ }

      const newContacts = contactList.slice(1);
      setContactsSync(newContacts);
      setRemainingCount(newContacts.length);

      setStatusMsg({ type: 'error', message: `Error for ${contact.firstName}: ${err.message}. Skipped.` });

      if (isActiveRef.current && newContacts.length > 0) {
        const base = computeBaseInterval(maxPer24hRef.current);
        const jitter = Math.floor(Math.random() * 31);
        const next = Date.now() + (base + jitter) * 1000;
        setNextSendAtSync(next);
        saveState();
      } else {
        setIsActiveSync(false);
        setNextSendAtSync(null);
        saveState();
      }
    } finally {
      setIsGenerating(false);
      setIsSending(false);
      isBusyRef.current = false;
    }
  };

  // Countdown timer — recalculates remaining time from Date.now() every 500 ms.
  // This is accurate after sleep/wake because it never decrements; it always
  // compares against the persisted target timestamp.
  useEffect(() => {
    if (nextSendAt === null) {
      setCountdown(null);
      return;
    }

    const tick = () => {
      const remaining = nextSendAt - Date.now();
      if (remaining <= 0) {
        setCountdown(0);
        if (!isBusyRef.current) {
          performSendRef.current();
        }
      } else {
        setCountdown(remaining);
      }
    };

    tick(); // immediate check on mount / nextSendAt change
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [nextSendAt]);

  const handleStart = () => {
    if (!configRef.current?.context.content) {
      setStatusMsg({ type: 'error', message: 'Please configure a context template first.' });
      return;
    }
    if (!configRef.current?.llm.model) {
      setStatusMsg({ type: 'error', message: 'Please select an LLM model in Configuration.' });
      return;
    }
    if (contactsRef.current.length === 0) {
      setStatusMsg({ type: 'error', message: 'No unsent contacts found.' });
      return;
    }

    setIsActiveSync(true);
    setStatusMsg(null);
    // Fire the first send immediately — no countdown for the very first email
    performSendRef.current();
  };

  const handlePause = () => {
    setIsActiveSync(false);
    setNextSendAtSync(null);
    saveState();
    setStatusMsg({ type: 'info', message: 'Bulk send paused.' });
  };

  const baseInterval = computeBaseInterval(maxPer24h);
  const isBusy = isGenerating || isSending;

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold mb-6">Bulk Send</h2>
        <p className="text-gray-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Bulk Send</h2>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-lg p-4 shadow-sm border">
          <p className="text-sm text-gray-500 mb-1">Emails remaining</p>
          <p className="text-3xl font-bold text-gray-800">{remainingCount}</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border">
          <p className="text-sm text-gray-500 mb-1">Sent (last 24 h)</p>
          <p className="text-3xl font-bold text-gray-800">{sentLast24h}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-lg p-4 shadow-sm border mb-6">
        <div className="flex items-center gap-6 flex-wrap">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max per 24 hours
            </label>
            <input
              type="number"
              min={1}
              max={2000}
              value={maxPer24h}
              disabled={isActive}
              onChange={e => {
                const v = Math.max(1, Number(e.target.value));
                maxPer24hRef.current = v;
                setMaxPer24h(v);
              }}
              onBlur={saveState}
              className="w-28 border rounded px-3 py-1.5 text-sm disabled:bg-gray-100"
            />
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-1">Interval</p>
            <p className="text-sm text-gray-600">~{baseInterval} s ± 30 s</p>
          </div>

          <div className="ml-auto flex items-center gap-4">
            {isActive && countdown !== null && (
              <p className="text-sm text-gray-600">
                Next send in:{' '}
                <span className="font-mono font-bold text-blue-600">
                  {formatCountdown(countdown)}
                </span>
              </p>
            )}

            {!isActive ? (
              <button
                onClick={handleStart}
                disabled={isBusy || contacts.length === 0}
                className="px-5 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                ▶ Start
              </button>
            ) : (
              <button
                onClick={handlePause}
                disabled={isBusy}
                className="px-5 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                ⏸ Pause
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Status message */}
      {statusMsg && (
        <div
          className={`mb-4 p-3 rounded text-sm border ${
            statusMsg.type === 'success'
              ? 'bg-green-50 text-green-800 border-green-200'
              : statusMsg.type === 'error'
              ? 'bg-red-50 text-red-800 border-red-200'
              : statusMsg.type === 'warning'
              ? 'bg-yellow-50 text-yellow-800 border-yellow-200'
              : 'bg-blue-50 text-blue-800 border-blue-200'
          }`}
        >
          {statusMsg.message}
        </div>
      )}

      {/* Current email preview */}
      {currentContact && (
        <div className="bg-white rounded-lg p-4 shadow-sm border mb-6">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-sm font-medium text-gray-500">
              {isGenerating ? 'Generating:' : isSending ? 'Sending:' : 'Last sent:'}
            </span>
            <span className="font-semibold text-gray-800">
              {currentContact.firstName} {currentContact.lastName}
            </span>
            <span className="text-gray-400">·</span>
            <span className="text-sm text-gray-500">{currentContact.email}</span>
          </div>
          {currentSubject && (
            <p className="text-sm mb-2">
              <span className="font-medium text-gray-500">Subject: </span>
              {currentSubject}
            </p>
          )}
          {currentBody && (
            <ReactQuill
              theme="snow"
              value={currentBody}
              readOnly
              modules={{ toolbar: false }}
              className="max-h-48 overflow-y-auto"
            />
          )}
        </div>
      )}

      {/* Recent send log */}
      {statusLog.length > 0 && (
        <div className="bg-white rounded-lg p-4 shadow-sm border">
          <p className="text-sm font-medium text-gray-700 mb-2">Recent sends</p>
          <ul className="space-y-1">
            {statusLog.map((entry, i) => (
              <li key={i} className="text-sm flex items-center gap-2">
                <span className={entry.success ? 'text-green-600' : 'text-red-600'}>
                  {entry.success ? '✓' : '✗'}
                </span>
                <span className="text-gray-400 font-mono text-xs">{entry.timestamp}</span>
                <span className="text-gray-700">{entry.name}</span>
                {entry.error && (
                  <span className="text-red-500 text-xs">— {entry.error}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default BulkSendTab;
