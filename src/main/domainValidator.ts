import { promises as dns } from 'dns';

// In-memory cache for domain validation results
// Key: domain, Value: { valid: boolean, timestamp: number, mxRecords?: number }
const domainCache = new Map<string, { valid: boolean; timestamp: number; mxRecords?: number; error?: string }>();

// Cache TTL: 1 hour
const CACHE_TTL = 3600000; // milliseconds

export type DomainErrorType = 
  | 'domain-error-timeout'
  | 'domain-error-no-mx'
  | 'domain-error-nonexistent'
  | 'domain-error-temporary';

export interface DomainValidationResult {
  valid: boolean;
  error?: string;
  errorType?: DomainErrorType;
  mxRecords?: number;
}

/**
 * Extract domain from email address
 */
function extractDomain(email: string): string | null {
  const match = email.match(/@([^@]+)$/);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Validate email domain by checking DNS MX records
 * Results are cached in memory for 1 hour
 */
export async function validateEmailDomain(email: string): Promise<DomainValidationResult> {
  const domain = extractDomain(email);
  
  if (!domain) {
    return {
      valid: false,
      error: 'Invalid email format',
      errorType: 'domain-error-nonexistent'
    };
  }

  // Check cache first
  const cached = domainCache.get(domain);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[DomainValidator] Cache hit for ${domain}`);
    return {
      valid: cached.valid,
      error: cached.error,
      errorType: cached.error ? getErrorType(cached.error) : undefined,
      mxRecords: cached.mxRecords
    };
  }

  console.log(`[DomainValidator] Validating domain: ${domain}`);

  try {
    // Try to resolve MX records with timeout
    const mxRecords = await resolveMxWithTimeout(domain, 5000);
    
    if (mxRecords && mxRecords.length > 0) {
      // Valid domain with MX records
      const result = {
        valid: true,
        mxRecords: mxRecords.length
      };
      
      // Cache the result
      domainCache.set(domain, {
        valid: true,
        timestamp: Date.now(),
        mxRecords: mxRecords.length
      });
      
      console.log(`[DomainValidator] ✓ Valid domain: ${domain} (${mxRecords.length} MX records)`);
      return result;
    } else {
      // No MX records found
      const error = 'No MX records found';
      const result = {
        valid: false,
        error,
        errorType: 'domain-error-no-mx' as DomainErrorType
      };
      
      domainCache.set(domain, {
        valid: false,
        timestamp: Date.now(),
        error
      });
      
      console.log(`[DomainValidator] ✗ ${domain}: ${error}`);
      return result;
    }
  } catch (error: any) {
    console.error(`[DomainValidator] Error validating ${domain}:`, error.message);
    
    // Determine error type
    let errorType: DomainErrorType;
    let errorMessage: string;
    
    if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
      errorType = 'domain-error-nonexistent';
      errorMessage = 'Domain does not exist';
    } else if (error.code === 'ETIMEOUT' || error.message.includes('timeout')) {
      errorType = 'domain-error-timeout';
      errorMessage = 'DNS lookup timeout';
    } else {
      // Temporary DNS failure - retry once
      console.log(`[DomainValidator] Retrying ${domain}...`);
      try {
        const retryMxRecords = await resolveMxWithTimeout(domain, 5000);
        if (retryMxRecords && retryMxRecords.length > 0) {
          const result = {
            valid: true,
            mxRecords: retryMxRecords.length
          };
          
          domainCache.set(domain, {
            valid: true,
            timestamp: Date.now(),
            mxRecords: retryMxRecords.length
          });
          
          console.log(`[DomainValidator] ✓ Valid on retry: ${domain}`);
          return result;
        }
      } catch (retryError) {
        console.error(`[DomainValidator] Retry failed for ${domain}`);
      }
      
      errorType = 'domain-error-temporary';
      errorMessage = 'Temporary DNS failure';
    }
    
    const result = {
      valid: false,
      error: errorMessage,
      errorType
    };
    
    // Cache the failure (but with shorter TTL via timestamp)
    domainCache.set(domain, {
      valid: false,
      timestamp: Date.now(),
      error: errorMessage
    });
    
    return result;
  }
}

/**
 * Resolve MX records with timeout
 */
async function resolveMxWithTimeout(domain: string, timeoutMs: number): Promise<dns.MxRecord[]> {
  return Promise.race([
    dns.resolveMx(domain),
    new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('DNS lookup timeout')), timeoutMs)
    )
  ]);
}

/**
 * Get error type from error message (for cached results)
 */
function getErrorType(errorMessage: string): DomainErrorType {
  if (errorMessage.includes('timeout')) {
    return 'domain-error-timeout';
  } else if (errorMessage.includes('No MX records')) {
    return 'domain-error-no-mx';
  } else if (errorMessage.includes('does not exist')) {
    return 'domain-error-nonexistent';
  } else {
    return 'domain-error-temporary';
  }
}

/**
 * Batch validate multiple domains (for future use)
 */
export async function batchValidateDomains(emails: string[]): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();
  
  // Validate in parallel
  const validations = await Promise.all(
    emails.map(email => validateEmailDomain(email))
  );
  
  emails.forEach((email, index) => {
    results.set(email, validations[index].valid);
  });
  
  return results;
}

/**
 * Clear the domain cache (useful for testing or manual refresh)
 */
export function clearDomainCache(): void {
  domainCache.clear();
  console.log('[DomainValidator] Cache cleared');
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { size: number; entries: Array<{ domain: string; valid: boolean; age: number }> } {
  const entries = Array.from(domainCache.entries()).map(([domain, data]) => ({
    domain,
    valid: data.valid,
    age: Date.now() - data.timestamp
  }));
  
  return {
    size: domainCache.size,
    entries
  };
}
