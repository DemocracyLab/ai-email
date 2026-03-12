# Security Configuration

## Content Security Policy (CSP)

This application implements a dual CSP strategy to balance security with development experience.

### Development Mode

**Location**: `index.html` meta tag

In development mode, CSP allows:
- `unsafe-eval` - Required for Vite's Hot Module Reloading (HMR)
- `unsafe-inline` - Required for style injection during development
- `ws://localhost:*` - Required for Vite's WebSocket connection

**Rationale**: Without these directives, HMR would not work and development would be significantly slower.

### Production Mode

**Location**: `src/main/index.ts` session headers

In production (packaged app), CSP enforces:
- ❌ No `unsafe-eval` - Scripts must be pre-compiled
- ✅ `unsafe-inline` for styles only (required by ReactQuill editor)
- ✅ `'self'` for scripts - Only bundled code can execute
- ✅ Whitelisted external domains for API calls

### Whitelisted External Domains

The following domains are allowed for network requests:

1. **Google OAuth & APIs**:
   - `https://accounts.google.com` - OAuth authentication
   - `https://oauth2.googleapis.com` - Token exchange
   - `https://www.googleapis.com` - API discovery
   - `https://gmail.googleapis.com` - Gmail API
   - `https://sheets.googleapis.com` - Google Sheets API
   - `https://script.google.com` - Apps Script Web App endpoints

2. **LLM Providers**:
   - `https://generativelanguage.googleapis.com` - Google Gemini API
   - `https://api.openai.com` - OpenAI API

### Security Tradeoffs

#### What We Protect Against:
- ✅ Cross-site scripting (XSS) attacks
- ✅ Injection of malicious scripts
- ✅ Unauthorized API calls to unknown domains
- ✅ Data exfiltration to unauthorized servers

#### Development Compromises:
- ⚠️ Development mode allows `unsafe-eval` for HMR
- ⚠️ This is a standard practice for Electron + Vite apps
- ✅ Production build removes all unsafe directives
- ✅ Warning disappears when app is packaged

### Verification

To verify CSP is working:

1. **Development**: Run `npm run electron:dev`
   - Warning will still appear (expected, due to HMR needs)
   
2. **Production**: Package the app with `npm run build`
   - No CSP warning should appear
   - Only whitelisted domains can be accessed

### Additional Security Measures

Beyond CSP, this app implements:

1. **Context Isolation**: Enabled in `webPreferences`
2. **Node Integration**: Disabled in renderer process
3. **Preload Script Security**: Uses IPC for controlled API access
4. **Encrypted Config Storage**: Uses electron-store with encryption
5. **Apps Script**: API keys pulled via authorized App Script endpoints, avoiding static API keys stored locally in unprotected configs
6. **OAuth Tokens**: Refresh tokens encrypted in electron-store

## Updating CSP

If you need to add a new external API:

1. Add the domain to `index.html` (development)
2. Add the domain to `src/main/index.ts` session handler (production)
3. Update this document with the reason for the addition

## References

- [Electron Security Guide](https://electronjs.org/docs/tutorial/security)
- [Content Security Policy (MDN)](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [Vite + Electron CSP Best Practices](https://github.com/electron-vite/electron-vite-vue)
