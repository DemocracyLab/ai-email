# Bounce Detection & Email Validation — Feature Spec

## Summary

Add proactive domain validation and bounce detection to prevent sending to invalid addresses and monitor for delivery failures. The system validates email domains synchronously before sending, checks for bounce messages between sends, and automatically pauses bulk sending when excessive bounces are detected. **Bounce tracking is a core feature** requiring "Bounce Date" and "Bounce Reason" columns in the Google Sheet - the app will not proceed without these columns.

---

## Problem Statement

Currently, the app sends emails without validating recipient domains or monitoring for bounces. This can lead to:
- Wasted sends to invalid/non-existent domains
- Damaged sender reputation from high bounce rates
- No visibility into failed deliveries
- Continued sending to addresses that have already bounced

---

## Solution Overview

### Two-Phase Protection

1. **Pre-Send Domain Validation** (Synchronous)
   - Check DNS MX records before sending
   - Skip sending if domain is invalid
   - Mark contact status with specific error type (e.g., `domain-error-no-mx`, `domain-error-nonexistent`)

2. **Post-Send Bounce Detection** (Polling)
   - Check Gmail for bounce messages before each send
   - Classify bounces: hard-bounce, soft-bounce, block/spam
   - Update contact status in Google Sheet
   - Auto-pause after reaching daily bounce limit (default: 3 per day)

---

## Detailed Requirements

### 1. Domain Validation (Pre-Send)

#### 1.1 DNS MX Record Check

Before attempting to send each email:

```typescript
async function validateEmailDomain(email: string): Promise<{
  valid: boolean;
  error?: string;
}> {
  // Extract domain from email
  // Query DNS for MX records
  // Return validation result
}
```

**Validation Steps:**
1. Extract domain from email address (e.g., `user@example.com` → `example.com`)
2. Query DNS for MX records using Node.js `dns.resolveMx()`
3. Check that at least one MX record exists
4. Optionally verify the domain has valid A/AAAA records as fallback

**Result:**
- `valid: true` → Proceed with email send
- `valid: false` → Skip send, update status to specific `domain-error-*` type (see Error Handling table)

#### 1.2 Error Handling

| Scenario | Action |
|----------|--------|
| DNS lookup timeout (>5s) | Mark as `domain-error-timeout`, skip send |
| Domain has no MX records | Mark as `domain-error-no-mx`, skip send |
| NXDOMAIN (domain doesn't exist) | Mark as `domain-error-nonexistent`, skip send |
| Temporary DNS failure | Retry once, then mark as `domain-error-temporary` if still failing |

#### 1.3 Status Updates

When domain validation fails:
- Update Status column: One of `domain-error-timeout`, `domain-error-no-mx`, `domain-error-nonexistent`, or `domain-error-temporary` (specific error type)
- Update Date Sent column: Current timestamp
- Update Team Member column: Current user's name
- **Do NOT** increment sent count for rate limiting
- Add to status log on Bulk Send tab: `❌  HH:MM:SS  Name — [specific-domain-error]: [error message]`

#### 1.4 UI Display

In Bulk Send preview area, show validation status:
```
Validating:  Jane Smith  <jane.smith@invalid-domain.com>
⚠️  Domain validation failed: No MX records found

Status: Skipping this contact, moving to next...
```

---

### 2. Bounce Detection (Post-Send)

#### 2.1 When to Check

Check for bounce messages:
- **Before sending the next email** in bulk send flow
- After resuming from pause (check all since last check)
- On manual "Check Bounces Now" button in Bulk Send tab (optional)

#### 2.2 Gmail API Query

Use Gmail API to search for bounce/delivery failure messages:

```typescript
async function checkForBounces(): Promise<BounceResult[]> {
  // Query Gmail for bounce messages
  // Parse bounce type and original recipient
  // Return list of bounced emails
}
```

**Search Query:**
```
from:(mailer-daemon OR postmaster OR "Mail Delivery Subsystem") 
newer_than:7d
```

**Filter Criteria:**
- Only check messages from last 7 days (configurable)
- Look for common bounce sender addresses
- Check message content for bounce indicators

#### 2.3 Bounce Classification

Parse bounce message body to determine type:

| Bounce Type | Indicators | Status Value |
|-------------|------------|--------------|
| **Hard Bounce** | "user unknown", "does not exist", "invalid recipient", "550", "553" | `hard-bounce` |
| **Soft Bounce** | "mailbox full", "quota exceeded", "temporarily unavailable", "451", "452" | `soft-bounce` |
| **Block/Spam** | "blocked", "spam", "blacklist", "refused", "policy", "554" | `block-bounce` |

**Implementation:**
```typescript
interface BounceResult {
  originalRecipient: string;     // Extract from bounce message
  bounceType: 'hard-bounce' | 'soft-bounce' | 'block-bounce';
  bounceDate: string;             // ISO timestamp
  bounceReason: string;           // Human-readable reason
  messageId?: string;             // Original message ID if available
}
```

#### 2.4 Recipient Extraction

Extract original recipient from bounce message:
1. Check for `X-Failed-Recipients` header
2. Parse "To:" or "Original-Recipient:" fields in message body
3. Use regex to find email addresses in message content
4. Match against recently sent contacts from Google Sheet (by Gmail Message ID if available)

#### 2.5 Status Updates

When bounce is detected:
1. Find contact in Google Sheet by email address
2. Update Status column: `hard-bounce`, `soft-bounce`, or `block-bounce`
3. Preserve Date Sent column (keep original send date)
4. Add Bounce Date column (required column): Current timestamp
5. Add Bounce Reason column (required column): Brief error message
6. Add to status log on Bulk Send tab: `⚠️  HH:MM:SS  Name — [bounce-type]: [reason]`

**Note:** If contact not found in sheet (possibly already removed), log warning but continue.

#### 2.6 Historical Bounce Check

On first run or when "Check All Bounces" is triggered:
1. Query all bounce messages from last 7 days (or configurable period)
2. Match against all contacts with `status = 'sent'` in Google Sheet
3. Update all matches with bounce status
4. Display summary: "Found X bounces from Y sent emails"

---

### 3. Auto-Pause on Daily Bounces

#### 3.1 Tracking

Maintain daily bounce tracking during bulk send:
```typescript
interface BounceTracking {
  bouncesToday: number;              // Count of bounces/errors today
  bounceTimestamps: string[];        // ISO timestamps for today's bounces
  lastBouncedEmail: string;
  totalBouncesSession: number;       // Session total for display
  dailyBounceLimit: number;          // Configurable, default 3
}
```

Increment `bouncesToday` when:
- Domain validation fails (any `domain-error-*` status)
- Bounce detected (any type: `hard-bounce`, `soft-bounce`, `block-bounce`)

Reset `bouncesToday` to 0:
- On app startup (if date changed since last run)
- At midnight (or first send of new day)

Prune `bounceTimestamps`:
- Remove entries older than current day on each check

#### 3.2 Auto-Pause Logic

```typescript
// Before each send, check daily bounce count
const today = new Date().toISOString().split('T')[0];
const todayBounces = bounceTimestamps.filter(ts => 
  ts.startsWith(today)
).length;

if (todayBounces >= dailyBounceLimit) {
  pauseBulkSend();
  showAlert({
    title: "Bulk Send Paused - Daily Bounce Limit Reached",
    message: `Reached ${dailyBounceLimit} bounces/errors today. Last: ${lastBouncedEmail}
    
    Total bounces today: ${todayBounces}
    Session total: ${totalBouncesSession}
    
    Bulk sending will automatically resume tomorrow.
    Please review your contact list and sender reputation.`,
    actions: ["Review Contacts", "Close"]
  });
  
  // Schedule auto-resume at midnight
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  scheduleResumeAt(tomorrow);
}
```

#### 3.3 UI Display

Add bounce tracking section to Bulk Send tab:

```
Bounce Tracking (Today)
─────────────────────────────────────────────────────────────
  Bounces today:        2 / 3      Session total:      5
  Hard bounces:         3          Soft bounces:       2
  Domain errors:        2
  
  ⚠️  Auto-pause at: 3 bounces per day (configurable)
```

---

### 4. New Google Sheet Columns (REQUIRED)

Add the following **required** columns (create if they don't exist):

| Column Name | Purpose | Type |
|-------------|---------|------|
| **Bounce Date** | When bounce was detected | ISO date string |
| **Bounce Reason** | Brief error message from bounce | Text (truncated to 100 chars) |

**Column Detection & Creation:**
- Check for these columns on app startup and before any bulk sending
- If missing, show modal: "This app requires 'Bounce Date' and 'Bounce Reason' columns in your sheet for bounce tracking. Add them now?"
- If user confirms, automatically add the columns to the sheet
- **If user declines, do not allow the app to proceed** - these columns are mandatory for the app to function
- On subsequent runs, verify columns still exist. If deleted, show the same prompt and block app usage until columns are added
- The app will not distinguish between "bounce detection enabled" and "disabled" - bounce tracking is always active as a core feature

---

### 5. Gmail API Scopes

Add new scope for reading messages (already included):
```
https://www.googleapis.com/auth/gmail.readonly
```

No additional scopes needed - current authorization includes this.

---

### 6. Configuration Settings

Add to Bulk Send tab:

```
Bounce Detection Settings
─────────────────────────────────────────────────────────────
  Domain validation and bounce detection are always active
  
  Bounce history window:  [ 7 ] days
  
  Max bounces per day:  [ 3 ]  (auto-pause when reached)
  
  [ Check All Bounces Now ]  (scans all sent emails in sheet)
```

Persist in `electron-store` under `bulkSend.bounceSettings`:
```typescript
interface BounceSettings {
  bounceHistoryDays: number;          // Default 7
  maxBouncesPerDay: number;           // Default 3
  bounceTimestamps: string[];         // ISO timestamps of today's bounces
  lastCheckDate: string;              // ISO date for daily reset
}
```

---

### 7. UI Updates

#### 7.1 Bulk Send Tab Enhancements

**Location:** All enhancements below are displayed on the **Bulk Send tab** in the main application window.

**Add Bounce Statistics:**
```
┌─────────────────────────────────────────────────────────────────┐
│  Emails remaining:   312          Sent (last 24 h):  48         │
│  Domain errors:      2            Bounced:           5           │
└─────────────────────────────────────────────────────────────────┘
```

**Status Log with Icons:**

Displayed on the Bulk Send tab below the email preview. Shows the last 10 send attempts (expanded from 5 in original spec) to provide better visibility into bounce patterns.

```
Status log (last 10):
  ✓  10:43:02  Jane Smith — sent
  ❌ 10:42:15  Bob Johnson — domain-error-no-mx (No MX records)
  ⚠️  10:41:54  Carlos Rivera — hard-bounce (User unknown)
  ✓  10:40:12  Alice Wong — sent
  ⚠️  10:38:45  David Lee — soft-bounce (Mailbox full)
```

#### 7.2 Current Email Preview

Show validation status:
```
Preparing:  Jane Smith  <jane.smith@example.com>

✓  Domain validated: example.com (2 MX records)

Subject: [rendered subject line]
Body preview: ...
```

Or on failure:
```
Validating:  Jane Smith  <jane.smith@invalid.com>

❌  Domain validation failed: No MX records found for invalid.com
→  Skipping this contact

Next: John Doe <john.doe@valid.com>
```

---

### 8. Implementation Architecture

#### 8.1 New Files

```
src/main/
  domainValidator.ts       # DNS MX lookup logic
  bounceDetector.ts        # Gmail bounce detection logic
```

#### 8.2 Module Structure

**domainValidator.ts:**
```typescript
export async function validateEmailDomain(email: string): Promise<{
  valid: boolean;
  error?: string;
  mxRecords?: number;
}>

export async function batchValidateDomains(emails: string[]): Promise<Map<string, boolean>>
```

**bounceDetector.ts:**
```typescript
export async function checkForBounces(
  auth: OAuth2Client,
  since: Date
): Promise<BounceResult[]>

export function parseBounceMessage(message: gmail_v1.Schema$Message): BounceResult | null

export function extractOriginalRecipient(message: gmail_v1.Schema$Message): string | null

export function classifyBounceType(messageBody: string): 'hard-bounce' | 'soft-bounce' | 'block-bounce'
```

#### 8.3 IPC Handlers

Add to `bulkSend.ts`:
```typescript
ipcMain.handle('bulkSend:validateDomain', async (_event, email: string) => ...)
ipcMain.handle('bulkSend:checkBounces', async () => ...)
ipcMain.handle('bulkSend:getBounceStats', async () => ...)
```

#### 8.4 Integration Points

**On App Startup:**
```typescript
// Check if daily bounce limit was already reached today
const today = new Date().toISOString().split('T')[0];
const settings = store.get('bulkSend.bounceSettings');

// Load today's bounces from spreadsheet
const todayBounces = await countBouncesFromSheet(today);

if (todayBounces >= settings.maxBouncesPerDay) {
  // Prevent bulk sending, show alert
  showBounceAlert(`Daily bounce limit (${settings.maxBouncesPerDay}) already reached today.`);
  disableBulkSend();
}
```

**In Bulk Send Loop (before each send):**
```typescript
// 0. Check if new day - reset daily counter
const currentDate = new Date().toISOString().split('T')[0];
if (currentDate !== lastCheckDate) {
  bounceTimestamps = [];
  lastCheckDate = currentDate;
}

// 1. Check for bounces from Gmail (before each send)
const bounces = await checkForBounces(auth, lastBounceCheck);
await processBounces(bounces); // Updates bounceTimestamps
lastBounceCheck = new Date();

// 2. Domain validation
const validation = await validateEmailDomain(contact.email);
if (!validation.valid) {
  const specificError = getSpecificDomainError(validation.error);
  await updateContactStatus(contact, specificError, validation.error);
  bounceTimestamps.push(new Date().toISOString());
  continue; // Skip to next contact
}

// 3. Check daily bounce threshold BEFORE sending
const todayBounces = bounceTimestamps.filter(ts => 
  ts.startsWith(currentDate)
).length;

if (todayBounces >= maxBouncesPerDay) {
  pauseAndAlert('Daily bounce limit reached');
  break;
}

// 4. Generate and send email
// ... existing send logic ...

// 5. On send success, continue (daily counter NOT reset on success)
```

---

### 9. Error Handling & Edge Cases

| Scenario | Handling |
|----------|----------|
| DNS timeout | Retry once with 5s timeout, then mark as domain-error |
| Gmail API rate limit during bounce check | Exponential backoff, continue sending (check later) |
| Bounce message parsing fails | Log warning, skip that bounce message |
| Original recipient not found in sheet | Log warning, increment bounce stats but don't update sheet |
| User resumes after auto-pause (next day) | Reset daily bounce counter, continue normally |
| User tries to resume same day | Show alert: "Daily bounce limit reached, cannot resume until tomorrow" |
| Multiple bounces for same email | Update to most recent bounce type |
| Bounce detected for already-bounced email | Update timestamp, don't increment daily counter again |

---

### 10. Performance Considerations

#### 10.1 Domain Validation
- DNS lookups typically 50-500ms each
- **Cache domain validation results in memory** (TTL: 1 hour, cleared on app restart)
- Show "Validating domain..." spinner for user feedback

#### 10.2 Bounce Detection
- Gmail API query limited to 7 days by default (configurable)
- Use `maxResults: 50` to limit response size
- Parse only message headers first, fetch body only if bounce suspected
- Cache bounce check results to avoid re-parsing same messages

#### 10.3 Suggested Optimizations
```typescript
// Domain cache (in-memory)
const domainCache = new Map<string, { valid: boolean; timestamp: number }>();

// Check cache first
const cached = domainCache.get(domain);
if (cached && Date.now() - cached.timestamp < 3600000) {
  return cached.valid;
}
```

---

### 11. Testing Strategy

#### 11.1 Manual Testing

**Domain Validation:**
- ✓ Valid domain with MX records (gmail.com)
- ✓ Invalid domain without MX records (invalid-test-domain-xyz.com)
- ✓ Non-existent domain (asdfjkl-does-not-exist-12345.com)
- ✓ Typo domains (gnail.com, yahooo.com)
- ✓ Disposable email domains (tempmail.com)

**Bounce Detection:**
- ✓ Send to known bad address (user-does-not-exist@gmail.com)
- ✓ Send to full mailbox (test with partner)
- ✓ Send to blocked address (if available)
- ✓ Verify bounce classification is correct
- ✓ Verify status column updates in sheet

**Auto-Pause:**
- ✓ Trigger 3 daily bounces
- ✓ Verify pause alert shows
- ✓ Test cannot resume same day
- ✓ Test auto-resume after midnight
- ✓ Test startup check blocks sending if limit already reached

#### 11.2 Edge Cases

- ✓ Domain validation during offline mode
- ✓ Gmail API auth expired during bounce check
- ✓ Very old bounce messages (>30 days)
- ✓ Bounce for email not in current sheet
- ✓ Multiple simultaneous bounce checks

---

### 12. Future Enhancements (Out of Scope)

- Real-time bounce notifications (Gmail Push API + local webhook)
- Bounce prediction using ML (flag risky domains)
- Automatic retry for soft bounces after N hours
- Integration with email verification services (ZeroBounce, NeverBounce)
- SPF/DKIM/DMARC validation for sender domain
- Bounce rate analytics dashboard
- Export bounce report (CSV/PDF)

---

## Success Metrics

- Zero emails sent to domains without MX records
- Bounce detection rate: >90% of actual bounces captured
- Status column accurately reflects bounce type (including specific domain-error types)
- Auto-pause triggers when daily bounce limit reached (default: 3 per day)
- Daily bounce counter resets properly at midnight
- Startup check correctly prevents sending if limit already reached same day
- Bulk send performance impact <500ms per email (including validation and bounce checking)

---

## Implementation Phases

### Phase 1: Domain Validation ✅ COMPLETED
- [x] Add required Bounce Date and Bounce Reason columns to sheet (with user prompt)
- [x] Implement DNS MX lookup with in-memory caching
- [x] Add domain validation to send flow (all sends, not just bulk)
- [x] Update status column for specific domain error types
- [x] Add UI indicators for validation status
- [x] Test with various domain scenarios
- [x] Fixed column range issue (A:AZ) to support columns beyond Z

### Phase 2: Bounce Detection ✅ COMPLETED
- [x] Implement Gmail bounce message search
- [x] Parse and classify bounce messages
- [x] Extract original recipient from bounces
- [x] Update sheet with bounce status
- [x] Add bounce check to bulk send loop
- [x] Add manual "Check Bounces" button to Email tab
- [x] Add Gmail label support for checking moved bounce messages
- [x] Implement initial setup flow with 60-day historical scan
- [x] Consolidated bounce column prompts into single modal

### Phase 3: Bulk Send Optimizations ✅ COMPLETED
- [x] Reuse generated email text when domain validation fails
- [x] Immediate send to next contact on domain validation failure (no wait)
- [x] Skip sending interval for invalid email addresses

### Phase 4: Auto-Pause & UI (Priority: Medium) - NOT YET IMPLEMENTED
- [ ] Track daily bounces with timestamps
- [ ] Implement daily bounce limit auto-pause logic
- [ ] Add bounce statistics to UI
- [ ] Add bounce settings panel
- [ ] Implement "Check All Bounces Now" button in Bulk Send tab
- [ ] Add startup check for daily bounce limit

### Phase 5: Polish & Optimization (Priority: Low) - NOT YET IMPLEMENTED
- [ ] Optimize Gmail API queries
- [ ] Enhance error messages and logging
- [ ] Comprehensive testing and edge case handling
- [ ] Performance monitoring and optimization

---

## Implementation Notes

### Column Range Fix (Phase 1)
**Issue:** Google Sheets API range `A:Z` only captures 26 columns, missing bounce columns added beyond column Z.

**Solution:** Changed all sheet read operations from `A:Z` to `A:AZ` to support up to 52 columns. This fixes cases where users have empty columns between standard columns and bounce tracking columns.

**Files Modified:**
- `src/main/sheets.ts` - Updated `sheets:getContacts` and `sheets:processBounces`
- `src/main/bulkSend.ts` - Updated `getSentCountFromSheet` and `getRemainingCount`

### Initial Bounce Detection Setup (Phase 2)
**Feature:** On first run (or when bounce columns don't exist), automatically:
1. Prompt user to add bounce columns
2. Ask if they want to check a specific Gmail label/folder for moved bounces
3. Scan last 60 days of email for historical bounce messages
4. Update spreadsheet with all found bounces

**User Flow:**
```
App Startup → Check bounce columns exist
  ↓ (if missing)
Modal: "Bounce Tracking Columns Required"
  ↓ (user clicks "Add Columns")
Prompt: "Check specific Gmail label?" (e.g., Spam, Archive)
  ↓ (optional label input)
Scan: Last 60 days of email
  ↓
Update: Spreadsheet with bounce data
  ↓
Complete: Show summary of bounces found
```

**Files Modified:**
- `src/renderer/App.tsx` - Enhanced bounce column modal with historical scan
- `src/main/bounceDetector.ts` - Added optional `labelName` parameter
- `src/main/bulkSend.ts` - Updated `checkBounces` handler to accept options object
- `src/main/preload.ts` - Updated API signature

### Bulk Send Email Text Reuse (Phase 3)
**Feature:** When domain validation fails in bulk send, reuse the generated email text for the next contact instead of generating new text.

**Rationale:**
- Saves LLM API costs
- No email was sent, so the text is "unused"
- Next contact gets the same campaign message

**Implementation:**
```typescript
// Store raw generated text (before personalization)
const lastGeneratedTextRef = useRef<string | null>(null);

// On domain validation failure: keep cached text
// On successful send: clear cached text
// On next contact: personalize cached text if available
```

**Files Modified:**
- `src/renderer/components/BulkSendTab.tsx` - Added text caching logic

### Immediate Send on Validation Failure (Phase 3)
**Feature:** When domain validation fails, immediately proceed to next contact without waiting the normal 72±30 second interval.

**Rationale:**
- Invalid email addresses shouldn't consume sending timeslots
- The 72-second interval is for rate limiting actual sends
- Maximizes bulk sending efficiency

**Implementation:**
```typescript
if (wasDomainValidationFailure) {
  // No wait - send immediately
  setNextSendAtSync(Date.now());
} else {
  // Normal interval
  const next = Date.now() + (base + jitter) * 1000;
  setNextSendAtSync(next);
}
```

**Files Modified:**
- `src/renderer/components/BulkSendTab.tsx` - Conditional timing logic

---

## Open Questions - RESOLVED

1. **Should we validate domains during regular (non-bulk) email sends?**
   - **Decision: YES** - Apply domain validation to all sends (bulk and single) for consistency

2. **Should we allow users to override domain validation and send anyway?**
   - **Decision: NO** - Do not provide override option. Domain validation protects sender reputation.

3. **Cache management and startup bounce checking**
   - **Decision:** Domain cache is in-memory only, cleared on app restart (no persistence needed)
   - **Startup check required:** On app start, check bounce history in spreadsheet for current day. If today's bounce count already meets/exceeds `maxBouncesPerDay`, immediately show pause alert and prevent bulk sending until next day.

4. **Should we track bounce rates per domain for future intelligence?**
   - **Decision:** Future enhancement, out of scope for v1. Data is available in spreadsheet for later analysis.

---

## Dependencies

- **Node.js `dns` module** - For MX record lookup (already available)
- **Gmail API v1** - For bounce message retrieval (already integrated)
- **Google Sheets API v4** - For status updates (already integrated)
- **electron-store** - For bounce settings persistence (already installed)

No new external dependencies required!

---

## Security & Privacy

- Bounce messages may contain sensitive error details → truncate to 100 chars
- Do not log full bounce message bodies → only relevant headers
- Domain validation queries go to public DNS → no privacy concerns
- All Gmail API calls use existing OAuth2 authentication → secure

---

## Appendix: Bounce Message Examples

### A. Hard Bounce Example
```
From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>
Subject: Delivery Status Notification (Failure)

Delivery to the following recipient failed permanently:
     user-does-not-exist@example.com

Technical details of permanent failure:
550-5.1.1 The email account that you tried to reach does not exist.
```

### B. Soft Bounce Example
```
From: postmaster@example.com
Subject: Mail delivery failed: returning message to sender

Delivery to the following recipient has been delayed:
     jane.smith@example.com

Message will be retried for 2 more day(s)
Technical details of temporary failure:
452 4.2.2 Mailbox is full
```

### C. Block/Spam Bounce Example
```
From: Mail Delivery System <mailer-daemon@example.com>
Subject: Undelivered Mail Returned to Sender

Delivery to the following recipient failed:
     contact@example.com

host mail.example.com[1.2.3.4] said:
554 5.7.1 Sender blocked - Visit https://example.com/blocked
```

---

End of Specification
