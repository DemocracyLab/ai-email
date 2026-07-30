# Claude AI Provider — Feature Spec

## Summary

Add Anthropic Claude as a third LLM provider option alongside Google Gemini and OpenAI GPT. The user selects Claude in the Config tab, picks a model, and email generation routes through the Anthropic Messages API. The Anthropic API key is delivered via the Google Apps Script secret flow using a new per-provider key map (`llmApiKeyByProvider`) — no manual key entry by the user. Each provider (gemini, openai, claude) has its own slot in the map, so the admin can configure all keys independently in the Apps Script.

---

## Scope of Changes

### 1. Shared Types (`src/shared/types.ts`)

- Extend `LLMProvider` union:  
  `'gemini' | 'openai' | 'claude'`

- Extend `LLMProvider` union: `'gemini' | 'openai' | 'claude'`

- Replace `apiKey` with a per-provider key map in `AppConfig.llm`:
  ```ts
  llm: {
    provider: 'gemini' | 'openai' | 'claude';
    apiKey?: string;               // legacy — keep for backward compat, not written going forward
    apiKeyByProvider?: {           // new: keyed by provider name
      gemini?: string;
      openai?: string;
      claude?: string;
    };
    model: string;
    availableModels?: string[];
  }
  ```

- `LLMConfig` updated to match:
  ```ts
  export interface LLMConfig {
    provider: LLMProvider;
    apiKey?: string;               // resolved active key (populated at generation time)
    apiKeyByProvider?: Record<string, string>;
    model: string;
    availableModels?: string[];
  }
  ```

---

### 2. Main Process — Secrets (`src/main/secrets.ts`)

Update `secrets:get-llm-key` to resolve the key from `apiKeyByProvider` using the currently configured provider, with a fallback to the legacy `apiKey` field for backward compatibility:

```ts
ipcMain.handle('secrets:get-llm-key', async () => {
  const config = store.store as AppConfig;
  const provider = config?.llm?.provider;
  const apiKey =
    config?.llm?.apiKeyByProvider?.[provider] ||
    config?.llm?.apiKey;  // legacy fallback
  if (!apiKey) throw new Error('LLM API key not found for provider: ' + provider);
  return apiKey;
});
```

---

### 3. Preload (`src/main/preload.ts`)

**No changes.** The existing `getLLMApiKey()` method continues to call `secrets:get-llm-key`, which now returns the correct key for the active provider.

---

### 4. LLM Service (`src/renderer/services/llm.ts`)

#### Routing

Add `claude` branch to `generateEmail`:
```ts
} else if (configWithKey.provider === 'claude') {
  return await generateWithClaude(contextTemplate, configWithKey);
}
```

The `configWithKey` assembly is **unchanged** — `window.electronAPI.getLLMApiKey()` is called for all providers including Claude. The main process resolves the correct key from `apiKeyByProvider[provider]` transparently.

#### `generateWithClaude` function

- **Endpoint**: `https://api.anthropic.com/v1/messages`
- **Auth**: Header `x-api-key: <key>` (no Bearer prefix)
- **Required header**: `anthropic-version: 2023-06-01`
- **Request body**:
  ```json
  {
    "model": "<selected model>",
    "max_tokens": 8000,
    "system": "<system prompt>",
    "messages": [{ "role": "user", "content": "<user prompt>" }]
  }
  ```
- **System prompt**: identical to the existing OpenAI/Gemini system prompt (formatting rules, placeholder behavior)
- **Response extraction**: `data.content[0].text.trim()`
- **Error handling**: check `response.ok`, parse `error.error?.message` on failure

#### Model fetch for Claude

Claude provides a models list endpoint, so models are fetched dynamically — same pattern as Gemini's `handleFetchModels`.

- **Endpoint**: `GET https://api.anthropic.com/v1/models`
- **Headers**: `anthropic-version: 2023-06-01`, `x-api-key: <key>`
- **Response**: `data[].id` — extract the `id` field from each item in the `data` array
- Filter to models that support `generateContent` (i.e. skip any non-generation model types if needed — the API returns only relevant models by default)
- Store fetched list in `availableModels` in config (same as Gemini)
- ConfigTab shows a **"Fetch Models" button** for Claude (same UX as Gemini), enabled once Google is connected (same gate as Gemini, since the key comes from Apps Script)
- On success, populate the model dropdown from `availableModels`
- On error, show an inline error message in the LLM section

---

### 5. Config Tab (`src/renderer/components/ConfigTab.tsx`)

#### Provider selection

- Add `'claude'` to the provider dropdown options alongside Gemini and OpenAI.
- State: expand `llmProvider` type to `'gemini' | 'openai' | 'claude'`.

#### Conditional API key section

No new API key input is needed for Claude. The Anthropic key is delivered via the Apps Script flow and stored in `llm.apiKeyByProvider.claude`.

When provider is `claude`, show:
- A **"Fetch Models" button** — same UX and same enable condition as Gemini (requires Google connected). Calls `GET /v1/models`, stores results in `availableModels`, populates the model dropdown.
- A **model dropdown** populated from `availableModels` after fetch.

The existing Gemini "Fetch Models" button is replaced by this Claude version when `claude` is selected. OpenAI model field remains unchanged and is hidden when `claude` is selected.

#### Save LLM config

`saveLLMConfig` requires no structural changes — `provider`, `model`, and `availableModels` are already persisted via `updateConfig`.

---

### 6. Apps Script / `configFetcher.ts`

#### Contract change: `llmApiKey` → `llmApiKeyByProvider`

The Apps Script is updated (by the admin) to return a `llmApiKeyByProvider` object instead of the flat `llmApiKey` string:

```json
{
  "clientId": "...",
  "clientSecret": "...",
  "llmApiKeyByProvider": {
    "gemini": "AIza...",
    "openai": "sk-...",
    "claude": "sk-ant-..."
  }
}
```

The admin only needs to populate the keys for providers they actually use; unused entries can be omitted.

`configFetcher.ts` is updated to accept `llmApiKeyByProvider` and write each key into `store.set('llm.apiKeyByProvider', ...)`. The old `llmApiKey` field is no longer written. Backward compatibility note: if the script still returns the old `llmApiKey` flat string, `configFetcher.ts` should store it under `llm.apiKey` as before so existing deployments keep working until the admin upgrades their script.

#### How to obtain an Anthropic API key (admin steps)

1. Go to [https://console.anthropic.com](https://console.anthropic.com) and sign in or create an account.
2. In the left sidebar, click **API Keys**.
3. Click **Create Key**, give it a name (e.g., "AI Mail"), and click **Create Key**.
4. Copy the key immediately — it is only shown once.
5. Open the Google Apps Script that the team uses for AI Mail configuration.
6. Add a `claude` entry to the `llmApiKeyByProvider` object with the key you copied.
7. Save and redeploy the Apps Script web app.

Users do not need to touch any API key directly. When they click **Connect Google Account** in the app, all keys are pulled from the Apps Script and stored encrypted on their machine automatically.

---

## Security Considerations

- All provider API keys are delivered via Apps Script and stored encrypted in `electron-store` at `llm.apiKeyByProvider.<provider>`. The active key is resolved in the main process by `secrets:get-llm-key` based on the configured provider, so the renderer never receives keys for inactive providers.
- The key is never logged, displayed in plain text, or included in git.
- No contact information is sent to the Anthropic API (same privacy rule as existing providers).

---

## Config Storage

```json
{
  "llm": {
    "provider": "claude",
    "apiKeyByProvider": {
      "gemini": "AIza...",
      "openai": "sk-...",
      "claude": "sk-ant-..."
    },
    "model": "claude-sonnet-4-5",
    "availableModels": ["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-3-5"]
  }
}
```

The legacy `apiKey` field is omitted from new installs but tolerated for backward compatibility.

---

## Files Changed

| File | Change |
|------|--------|
| `src/shared/types.ts` | Add `'claude'` to `LLMProvider`; add `apiKeyByProvider` map to `AppConfig.llm` and `LLMConfig` |
| `src/main/secrets.ts` | Update `secrets:get-llm-key` to resolve key from `apiKeyByProvider[provider]` with legacy fallback |
| `src/main/preload.ts` | No changes |
| `src/main/configFetcher.ts` | Accept `llmApiKeyByProvider` from Apps Script; write to `llm.apiKeyByProvider`; keep legacy `llmApiKey` fallback |
| `src/renderer/services/llm.ts` | Add `generateWithClaude`, model list fetch, routing |
| `src/renderer/components/ConfigTab.tsx` | Add Claude option to provider dropdown, Fetch Models button, model dropdown |

---

## Out of Scope

- Streaming responses (all providers use non-streaming for consistency)
- Per-contact model selection
- Anthropic token usage tracking (FUTURE item, same as existing providers)
- Claude tool use / function calling
