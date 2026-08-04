# Bulk Send — Feature Spec

## Summary

Add a **Bulk Send** tab that sends AI-generated emails to all unsent contacts automatically, one at a time, at a user-controlled rate. The scheduler is robust across computer sleep and shutdown: persisted state allows it to resume exactly where it left off. The UI shows live progress, a countdown to the next send, and a preview of the email currently being prepared.

---

## UX Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Configuration  │  Context Template  │  Send Emails  │  Bulk Send │
└─────────────────────────────────────────────────────────────────┘

Bulk Send
─────────────────────────────────────────────────────────────────
  Emails remaining:   312          Sent (last 24 h):  48
  Daily limit:        [ 400 ]      Interval:          ~72 s ± 30 s

  [ ▶ Start ]                      Next send in:   0:01:02

  ─────────────────────────────────────────────────────────────
  Preparing:  Jane Smith  <jane.smith@example.com>

  Subject: [rendered subject line]
  Body preview:
  ┌──────────────────────────────────────────────────────────┐
  │  Dear Jane, ...                                          │
  └──────────────────────────────────────────────────────────┘
  ─────────────────────────────────────────────────────────────

  Status log (last 5):
  ✓  10:43:02  Jane Smith — sent
  ✓  10:41:54  Carlos Rivera — sent
  …
```

---

## Detailed Requirements

### 1. Stats row

| Stat | Source |
|------|--------|
| **Emails remaining** | Count of contacts from the sheet where `status ≠ 'sent'` and `Team Member` is blank — the same query used by the existing Send Emails tab. Refreshed after every successful send and on tab mount. |
| **Sent (last 24 h)** | Loaded on startup from the sheet (`status = 'sent'` AND `dateSent` within the past 24 hours) **plus** a local send-log kept in `electron-store` (see §Persistence). The two sources are merged; the local log is the gate for rate-limit enforcement since it avoids a sheet round-trip before every send. |

### 2. Daily limit input

- Number input, default **400**, persisted in `electron-store` under `bulkSend.maxPer24h`.
- Editable while paused; ignored while running (changes take effect on next start).
- Shown alongside the computed interval:  
  `interval = floor((8 × 3600) / maxPer24h)` seconds (base)  
  `jitter = random integer in [0, 30]` seconds, recomputed for each individual send  
  Display: `~<base> s ± 30 s`

**Example:** 400 emails / 8-hour day → base interval = 72 s; actual gap per send = 72 + rand(0..30) s.

### 3. Start / Pause button

- **Start**: begins the send loop. Immediately generates + sends the first email, then schedules subsequent sends at `now + interval + jitter`.
- **Pause**: stops the loop after the current send completes (does not interrupt an in-flight send). Clears `nextSendAt`.
- Button label toggles: `▶ Start` ↔ `⏸ Pause`.
- Disabled while an email is actively generating or sending.

### 4. Countdown display

- Shows `Next send in: M:SS`.
- Recalculates from `Date.now()` every 500 ms — **not** a decrement counter. This makes it accurate across system clock adjustments and wakes from sleep.
- When the countdown reaches zero, the send fires automatically.
- Hidden when paused.

### 5. Current email preview

Displayed while the email is being generated and until the next send fires:
- **Name** (First + Last)
- **Email address**
- **Subject line**
- **Body** (plain-text preview, scrollable, read-only — not an editor)

### 6. Status log

- A compact list of the last 5 sends (timestamp, name, success/error).
- Persisted in session memory only (cleared on app restart).

### 7. Rate-limit enforcement

Before scheduling each send, check:

```
sentInLast24h = bulkSend.sentLog entries with timestamp > now - 24h
```

If `sentInLast24h >= maxPer24h`:  
- Pause automatically.  
- Show: *"Daily limit of X reached. Bulk send will resume automatically at [time when oldest entry drops out of the 24-hour window]."*  
- Schedule a resume at `oldestEntry + 24h`.  
- On resume, restart the normal loop.

---

## Architecture

### Shared Types (`src/shared/types.ts`)

```ts
export interface BulkSendState {
  isActive: boolean;
  maxPer24h: number;           // default 400
  nextSendAt: string | null;   // ISO timestamp; null when paused
  sentLog: string[];           // ISO timestamps of every send in the last 24 h (pruned on read)
}

// Extend AppConfig:
export interface AppConfig {
  // ...existing fields...
  bulkSend?: BulkSendState;
}
```

### Main Process — Bulk Send Handlers (`src/main/bulkSend.ts`)

New module, registered in `src/main/index.ts` via `setupBulkSendHandlers(ipcMain, store)`.

IPC handlers:

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `bulkSend:getState` | renderer → main | Read `store.get('bulkSend')` |
| `bulkSend:setState` | renderer → main | Write `store.set('bulkSend', state)` |
| `bulkSend:getSentCountFromSheet` | renderer → main | Count rows in sheet with `status=sent` AND `dateSent > now-24h` (one-time query on tab mount) |
| `bulkSend:getRemainingCount` | renderer → main | Count unsent contacts (same logic as `sheets:getContacts` but returns only the count, avoiding the full contact payload) |

**`bulkSend:getSentCountFromSheet`** reads the full sheet once, filters for rows where the `Status` column is `'sent'` and the `Date Sent` column parses to a timestamp within the last 24 hours, and returns the count. This is used on mount to seed the local `sentLog` if it is empty (first run or after clearing state).

**`bulkSend:getRemainingCount`** is a lightweight variant of `sheets:getContacts` that returns `{ count: number }` instead of the full contact array, avoiding unnecessary data transfer when only the stat is needed.

### New IPC Exposure (`src/main/preload.ts`)

```ts
// Bulk Send
getBulkSendState: () => ipcRenderer.invoke('bulkSend:getState'),
setBulkSendState: (state: any) => ipcRenderer.invoke('bulkSend:setState', state),
getSentCountFromSheet: () => ipcRenderer.invoke('bulkSend:getSentCountFromSheet'),
getRemainingCount: () => ipcRenderer.invoke('bulkSend:getRemainingCount'),
```

### Renderer — `BulkSendTab.tsx` (`src/renderer/components/BulkSendTab.tsx`)

All scheduling logic lives in the renderer (same pattern as `EmailTab`). The main process is only used for persistence and sheet access.

**State:**

```ts
const [contacts, setContacts] = useState<Contact[]>([]);
const [remainingCount, setRemainingCount] = useState(0);
const [sentLast24h, setSentLast24h] = useState(0);
const [maxPer24h, setMaxPer24h] = useState(400);
const [isActive, setIsActive] = useState(false);
const [nextSendAt, setNextSendAt] = useState<number | null>(null);  // epoch ms
const [countdown, setCountdown] = useState<number | null>(null);   // ms remaining
const [currentContact, setCurrentContact] = useState<Contact | null>(null);
const [currentSubject, setCurrentSubject] = useState('');
const [currentBody, setCurrentBody] = useState('');
const [isGenerating, setIsGenerating] = useState(false);
const [isSending, setIsSending] = useState(false);
const [statusLog, setStatusLog] = useState<LogEntry[]>([]);
const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
```

**Countdown timer:**

```ts
useEffect(() => {
  const tick = setInterval(() => {
    if (nextSendAt === null) return;
    const remaining = nextSendAt - Date.now();
    if (remaining <= 0) {
      setCountdown(0);
      // trigger send — guarded by isGenerating/isSending flags
    } else {
      setCountdown(remaining);
    }
  }, 500);
  return () => clearInterval(tick);
}, [nextSendAt, isGenerating, isSending]);
```

This design is automatically correct after sleep: on the first tick after wake, `Date.now()` will correctly reflect the elapsed time and fire immediately if the scheduled time has passed.

**Send loop (per send):**

1. Pick `contacts[0]` (always the first remaining — list shrinks after each send, same as `EmailTab`).
2. Generate email via `generateEmail(config.context.content, config.llm)`.
3. Apply `replaceVariables` to get subject + body.
4. Show preview in UI.
5. Send via `window.electronAPI.sendEmail(...)`.
6. Update sheet via `window.electronAPI.updateContact(...)`.
7. Append `new Date().toISOString()` to local `sentLog`.
8. Persist updated state via `setBulkSendState`.
9. Remove sent contact from local `contacts` list, decrement `remainingCount`.
10. Increment `sentLast24h`.
11. Check rate limit (§Rate-limit enforcement).
12. If still active and under limit, compute `nextSendAt = Date.now() + baseInterval*1000 + rand(0,30)*1000`, persist, restart countdown.

**On mount:**

```ts
useEffect(() => {
  const init = async () => {
    // 1. Load contacts (full list for sending)
    const loadedContacts = await window.electronAPI.getContacts();
    setContacts(loadedContacts);
    setRemainingCount(loadedContacts.length);

    // 2. Load persisted state
    const state: BulkSendState = await window.electronAPI.getBulkSendState();
    const maxPerDay = state?.maxPer24h ?? 400;
    setMaxPer24h(maxPerDay);

    // 3. Compute sent in last 24h: local log + sheet count (seed if log empty)
    let localLog: string[] = (state?.sentLog ?? []).filter(
      t => Date.now() - new Date(t).getTime() < 24 * 3600 * 1000
    );
    if (localLog.length === 0) {
      const sheetCount = await window.electronAPI.getSentCountFromSheet();
      setSentLast24h(sheetCount);
    } else {
      setSentLast24h(localLog.length);
    }

    // 4. Resume if was active
    if (state?.isActive && state?.nextSendAt) {
      const scheduledAt = new Date(state.nextSendAt).getTime();
      setIsActive(true);
      setNextSendAt(Math.max(scheduledAt, Date.now() + 2000)); // 2 s grace on startup
    }
  };
  init();
}, []);
```

The 2-second grace period on startup gives the app time to fully initialize before firing a send.

### Tab Registration (`src/renderer/App.tsx`)

- Add `'bulk'` to the `Tab` type union.
- Add a **Bulk Send** nav button using the same pattern as existing tabs.
- Add the corresponding `<BulkSendTab />` render branch in `<main>`.

---

## Persistence Schema

Stored in `electron-store` under the `bulkSend` key:

```json
{
  "bulkSend": {
    "isActive": true,
    "maxPer24h": 400,
    "nextSendAt": "2026-07-30T14:23:10.000Z",
    "sentLog": [
      "2026-07-30T13:51:04.000Z",
      "2026-07-30T13:52:18.000Z"
    ]
  }
}
```

The `sentLog` array is pruned on every read to entries within the last 24 hours. It is written after every successful send. On clear/reset it is set to `[]`.

---

## Sleep / Shutdown Recovery

| Scenario | Behavior |
|----------|----------|
| Computer sleeps mid-countdown | On wake, the 500 ms tick fires, computes `nextSendAt - Date.now() ≤ 0`, and triggers the send immediately. No special event handling needed. |
| App is quit while active | `isActive: true` and `nextSendAt` are persisted to `electron-store` before quit (written after every send and on pause/start toggle). |
| App restarts after quit | On mount, reads persisted state. If `isActive && nextSendAt` is in the past, schedules a send with a 2 s grace period. |
| App restarts, `nextSendAt` still in the future | Resumes countdown from the stored time — no email is skipped. |
| Machine reboots (long downtime) | `sentLog` entries are timestamped; old entries fall out of the 24 h window automatically. The scheduler resumes normally with an accurate sent-today count. |

**On app quit**: Electron's `app.on('before-quit')` is used in `src/main/index.ts` to ensure the in-flight state is flushed to store before the process exits. Since state is already written after every individual send, this is mainly a safety flush.

---

## Interval Calculation

```
baseInterval (seconds) = Math.floor((8 × 3600) / maxPer24h)
jitter (seconds)        = Math.floor(Math.random() × 31)   // 0–30 inclusive
actualInterval          = baseInterval + jitter
```

| maxPer24h | baseInterval | Display |
|-----------|--------------|---------|
| 400 | 72 s | ~72 s ± 30 s |
| 200 | 144 s | ~144 s ± 30 s |
| 100 | 288 s | ~288 s ± 30 s |
| 50 | 576 s | ~576 s ± 30 s |

---

## Error Handling

| Failure | Behavior |
|---------|----------|
| AI generation fails | Log error entry, skip contact (mark as `error` in sheet), continue to next after normal interval. |
| Email send fails (network) | Retry once after 5 seconds. On second failure, log error, skip contact (mark `error`), continue. |
| Sheet update fails | Log warning. Send is still counted as sent; sheet will be out of sync. Show persistent warning banner. |
| Google token expired | Pause bulk send, show auth error message with a link to re-authenticate in Config tab. |
| Rate limit reached | Auto-pause with resume time displayed (see §Rate-limit enforcement). |

---

## Files Changed

| File | Change |
|------|--------|
| `src/shared/types.ts` | Add `BulkSendState` interface; add optional `bulkSend` field to `AppConfig` |
| `src/main/bulkSend.ts` | **New file** — IPC handlers: `getState`, `setState`, `getSentCountFromSheet`, `getRemainingCount` |
| `src/main/index.ts` | Import and register `setupBulkSendHandlers`; add `before-quit` flush |
| `src/main/preload.ts` | Expose 4 new bulk-send IPC methods |
| `src/renderer/components/BulkSendTab.tsx` | **New file** — full tab component |
| `src/renderer/App.tsx` | Add `'bulk'` tab type, nav button, render branch |

---

## Out of Scope

- Editing the email body before it is sent (Bulk Send is fully automated; use Send Emails tab for manual review).
- Scheduling sends outside of an active session (no background daemon — the app must be open).
- Per-contact retry queue / backoff beyond the single retry on send failure.
- Analytics dashboard beyond the last-5-sends log and 24 h counter.
