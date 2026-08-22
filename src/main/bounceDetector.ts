import { google } from 'googleapis';

const gmail = google.gmail('v1');

export type BounceType = 'hard-bounce' | 'soft-bounce' | 'block-bounce';

export interface BounceResult {
  originalRecipient: string;     // Extract from bounce message
  bounceType: BounceType;
  bounceDate: string;             // ISO timestamp
  bounceReason: string;           // Human-readable reason
  messageId?: string;             // Original message ID if available
}

/**
 * Check for bounce messages in Gmail
 * @param auth OAuth2Client
 * @param since Date to check bounces from
 * @param labelName Optional Gmail label/folder to search in (e.g., "Bounces", "Archive")
 * @returns Array of bounce results
 */
export async function checkForBounces(
  auth: any,
  since: Date,
  labelName?: string
): Promise<BounceResult[]> {
  try {
    console.log('[BounceDetector] Checking for bounces since:', since.toISOString());
    if (labelName) {
      console.log('[BounceDetector] Searching in label:', labelName);
    }
    
    // Calculate days ago for Gmail query
    const daysAgo = Math.ceil((Date.now() - since.getTime()) / (1000 * 60 * 60 * 24));
    
    // Build query with optional label filter
    let query = `from:(mailer-daemon OR postmaster OR "Mail Delivery Subsystem") newer_than:${daysAgo}d`;
    if (labelName) {
      query = `label:${labelName} ${query}`;
    }
    
    console.log('[BounceDetector] Gmail query:', query);
    
    // Search for bounce messages
    const response = await gmail.users.messages.list({
      auth,
      userId: 'me',
      q: query,
      maxResults: 50
    });

    const messages = response.data.messages || [];
    console.log('[BounceDetector] Found', messages.length, 'potential bounce messages');

    if (messages.length === 0) {
      return [];
    }

    // Fetch full message details for each bounce
    const bounceResults: BounceResult[] = [];
    for (const msg of messages) {
      if (!msg.id) continue;

      try {
        const fullMessage = await gmail.users.messages.get({
          auth,
          userId: 'me',
          id: msg.id,
          format: 'full'
        });

        const bounce = parseBounceMessage(fullMessage.data);
        if (bounce) {
          bounceResults.push(bounce);
          console.log('[BounceDetector] ✓ Parsed bounce:', bounce.originalRecipient, '-', bounce.bounceType);
        }
      } catch (error: any) {
        console.error('[BounceDetector] Error fetching message:', msg.id, error.message);
      }
    }

    console.log('[BounceDetector] Returning', bounceResults.length, 'confirmed bounces');
    return bounceResults;
  } catch (error: any) {
    console.error('[BounceDetector] Error checking bounces:', error);
    return [];
  }
}

/**
 * Parse a bounce message to extract bounce information
 * @param message Gmail message object
 * @returns Bounce result or null if not a bounce
 */
export function parseBounceMessage(message: any): BounceResult | null {
  try {
    const headers = message.payload?.headers || [];
    const subject = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value || '';
    const date = headers.find((h: any) => h.name.toLowerCase() === 'date')?.value || '';
    
    // Get message body
    let body = '';
    if (message.payload?.body?.data) {
      body = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
    } else if (message.payload?.parts) {
      // Multi-part message, try to find text/plain part
      for (const part of message.payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          body = Buffer.from(part.body.data, 'base64').toString('utf-8');
          break;
        }
      }
    }

    // Check if this is actually a bounce message
    const isBounce = subject.toLowerCase().includes('delivery') ||
                     subject.toLowerCase().includes('failure') ||
                     subject.toLowerCase().includes('undelivered') ||
                     body.toLowerCase().includes('delivery to the following recipient failed') ||
                     body.toLowerCase().includes('undelivered mail');

    if (!isBounce) {
      return null;
    }

    // Extract original recipient
    const recipient = extractOriginalRecipient(message);
    if (!recipient) {
      console.warn('[BounceDetector] Could not extract recipient from bounce message');
      return null;
    }

    // Classify bounce type
    const bounceType = classifyBounceType(body + ' ' + subject);

    // Extract reason (first line with error code or description)
    let reason = 'Email delivery failed';
    const reasonMatch = body.match(/(?:550|551|552|553|554|451|452|421)[- ][\d.]*\s*(.+?)(?:\n|$)/i);
    if (reasonMatch && reasonMatch[1]) {
      reason = reasonMatch[1].trim().substring(0, 100);
    } else {
      // Try to find descriptive text
      const descMatch = body.match(/(user unknown|does not exist|mailbox (?:full|unavailable)|blocked|spam)/i);
      if (descMatch) {
        reason = descMatch[0];
      }
    }

    // Parse date
    const bounceDate = date ? new Date(date).toISOString() : new Date().toISOString();

    // Try to extract original message ID if available
    const originalMessageId = headers.find((h: any) => 
      h.name.toLowerCase() === 'x-failed-recipients' || 
      h.name.toLowerCase() === 'x-original-message-id'
    )?.value;

    return {
      originalRecipient: recipient,
      bounceType,
      bounceDate,
      bounceReason: reason,
      messageId: originalMessageId
    };
  } catch (error: any) {
    console.error('[BounceDetector] Error parsing bounce message:', error);
    return null;
  }
}

/**
 * Extract original recipient email from bounce message
 * @param message Gmail message object
 * @returns Email address or null
 */
export function extractOriginalRecipient(message: any): string | null {
  try {
    const headers = message.payload?.headers || [];
    
    // Check X-Failed-Recipients header (standard)
    const failedRecipient = headers.find((h: any) => 
      h.name.toLowerCase() === 'x-failed-recipients'
    )?.value;
    
    if (failedRecipient) {
      const email = extractEmailFromString(failedRecipient);
      if (email) return email;
    }

    // Get message body
    let body = '';
    if (message.payload?.body?.data) {
      body = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
    } else if (message.payload?.parts) {
      for (const part of message.payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          body = Buffer.from(part.body.data, 'base64').toString('utf-8');
          break;
        }
      }
    }

    // Look for common patterns in body
    const patterns = [
      /(?:Delivery to the following recipient failed[^\n]*:\s*)([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
      /(?:Original-Recipient:.*?)([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
      /(?:Final-Recipient:.*?)([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
      /(?:The following address(?:es)? failed:\s*)([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
      /(?:<)([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?:>:?\s*(?:failed|undeliverable|unknown))/i
    ];

    for (const pattern of patterns) {
      const match = body.match(pattern);
      if (match && match[1]) {
        return match[1].toLowerCase().trim();
      }
    }

    // Last resort: find any email in the first 500 chars of body
    const earlyBody = body.substring(0, 500);
    const email = extractEmailFromString(earlyBody);
    if (email) return email;

    return null;
  } catch (error: any) {
    console.error('[BounceDetector] Error extracting recipient:', error);
    return null;
  }
}

/**
 * Extract email address from a string
 */
function extractEmailFromString(text: string): string | null {
  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
  const match = text.match(emailRegex);
  return match ? match[1].toLowerCase().trim() : null;
}

/**
 * Classify bounce type based on message content
 * @param messageBody Bounce message body
 * @returns Bounce type classification
 */
export function classifyBounceType(messageBody: string): BounceType {
  const body = messageBody.toLowerCase();

  // Hard bounce indicators
  const hardBounceIndicators = [
    'user unknown',
    'does not exist',
    'user not found',
    'invalid recipient',
    'no such user',
    'recipient rejected',
    'address rejected',
    '550 5.1.1',
    '553 5.3.0',
    '550-5.1.1'
  ];

  // Soft bounce indicators
  const softBounceIndicators = [
    'mailbox full',
    'quota exceeded',
    'temporarily unavailable',
    'mailbox unavailable',
    'try again later',
    'temporary failure',
    '451',
    '452',
    '421',
    '4.2.2'
  ];

  // Block/Spam bounce indicators
  const blockIndicators = [
    'blocked',
    'spam',
    'blacklist',
    'refused',
    'policy',
    'denied',
    'rejected by policy',
    '554',
    '5.7.1'
  ];

  // Check in order of priority
  for (const indicator of blockIndicators) {
    if (body.includes(indicator)) {
      return 'block-bounce';
    }
  }

  for (const indicator of hardBounceIndicators) {
    if (body.includes(indicator)) {
      return 'hard-bounce';
    }
  }

  for (const indicator of softBounceIndicators) {
    if (body.includes(indicator)) {
      return 'soft-bounce';
    }
  }

  // Default to hard-bounce if we can't determine
  return 'hard-bounce';
}
