# AI Provider Manager

Centralised multi-provider AI for TiecCuoiLive. Every AI call in the app goes
through `app/ai/index.cjs`; nothing else talks to a vendor endpoint directly.

## Architecture

```
server.cjs  (node:http — no Express in this project)
   │
   ├─ /api/ai/*  ──► AIProviderManager (index.cjs)
   │                    ├─ ProviderRegistry   (registry.cjs)  adapters + runtime status
   │                    │    ├─ OpenRouterAdapter      (providers/openrouter.cjs)
   │                    │    ├─ OllamaAdapter          (providers/ollama.cjs)
   │                    │    ├─ OpenAIAdapter          (providers/openai.cjs)
   │                    │    └─ OpenAICompatibleAdapter(providers/openai-compatible.cjs)
   │                    ├─ AIRequestRouter   (router.cjs)    retry + fallback policy
   │                    ├─ ModelDiscovery    (per adapter: listModels)
   │                    ├─ ConnectionTester   (registry.testConnection — 3 stages)
   │                    ├─ UsageLogger        (usage.cjs)
   │                    └─ ConfigStore        (store.cjs) + Crypto (crypto.cjs) + SSRF guard (ssrf.cjs)
   │
   └─ processGiftEvent → ai.isTextGenerationEnabled() → ai.generateText() → announce()
```

### Connection testing is three separate facts

| Stage | Meaning | How |
|---|---|---|
| reachable | the endpoint answered | `GET /models` (OpenRouter/OpenAI), `GET /api/version` (Ollama) |
| authenticated | credentials were accepted | `GET /key` (OpenRouter), `GET /models` with key (OpenAI), n/a (Ollama) |
| canGenerate | a real completion succeeded | the “Đọc thử AI” button |

**Verified fact:** OpenRouter's `GET /models` is public and answers `200` even with
an invalid key. It is therefore used for *discovery only*. Authentication is
checked with `GET /key`, which correctly returns `401 {"error":{"message":"User not found."}}`.

A provider with no key is reported as **NOT CONFIGURED** and no request is sent.

## Configuration files

| File | Contents | Git |
|---|---|---|
| `app/ai/ai_config.json` | providers, model choice, routing, text settings | tracked |
| `app/ai/secrets.enc.json` | AES-256-GCM ciphertext per provider key | ignored |
| `app/ai/.master.key` | local fallback master key (only if env key absent) | ignored |
| `app/ai/ai_usage.json` | last 500 routing records | ignored |

`ai_config.json` never contains credentials, and runtime status (reachable /
authenticated / last error) is **memory-only**, so a stale “connected” badge
cannot survive a restart.

### Shape

```jsonc
{
  "version": 1,
  "providers": [
    { "id": "pv_x", "type": "openrouter|ollama|openai|openai-compatible",
      "name": "OpenRouter", "baseUrl": "https://openrouter.ai/api/v1",
      "model": "openrouter/free", "timeoutMs": 30000, "enabled": true,
      "createdAt": "...", "updatedAt": "..." }
  ],
  "defaultProviderId": "pv_x",
  "fallback": { "enabled": true, "providerId": "pv_y", "model": "",
                "maxAttempts": 2, "timeoutMs": 20000 },
  "text": { "enabled": false, "temperature": 0.8, "maxTokens": 120,
            "timeoutMs": 6000,
            "tasks": { "gift_thankyou": true, "marry_crown": true, "guest_wish": false } },
  "limits": { "maxProviders": 12, "maxPromptChars": 4000 }
}
```

### Environment (existing values keep working, never overwritten)

| Variable | Used for |
|---|---|
| `REACTIVE_AI_API_KEY` | seeds the OpenRouter provider (also accepts `OPENROUTER_API_KEY`, `REACTIVE_AI_OPENROUER_API_KEY` — the typo that exists in this project's `.env` — and any `REACTIVE_AI_*API_KEY`) |
| `REACTIVE_AI_BASE_URL` | seed base URL for OpenRouter |
| `REACTIVE_AI_MODEL` | seed default model |
| `LLM_SECRETS_MASTER_KEY` | master key for API-key encryption (falls back to a generated `.master.key`) |
| `OLLAMA_BASE_URL` | seed URL for the Ollama provider (default `http://10.0.0.142:11434`) |

`.env` is read by `env.cjs` with a **no-overwrite** rule, so a real environment
variable always wins.

If `LLM_SECRETS_MASTER_KEY` is removed or changed, previously stored blobs become
undecryptable. The manager then re-encrypts the OpenRouter key from `.env` when one
is available, and otherwise marks the provider `secretState: "unreadable"` so the
dashboard asks for the key again instead of silently showing "no key".

## Fallback policy

1. Primary provider is tried once.
2. Transient failures (429, timeout, network, 5xx) may be retried **only when no
   fallback is configured** — retrying first would consume the attempt budget and
   the fallback would never run.
3. Authentication / quota / model-missing / invalid-response failures hand over to
   the fallback provider.
4. `invalid_request`, `cancelled` and `blocked_target` never fall back.
5. Total attempts are capped by `fallback.maxAttempts` (1–5), so loops are impossible.
6. The response always states `fallbackUsed`, `fallbackReason`, and the full
   `attempts` chain; the usage log records the provider/model that actually answered.

## HTTP API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/ai/providers` | config + masked keys + runtime status |
| POST | `/api/ai/providers` | add provider |
| PATCH/PUT | `/api/ai/providers/:id` | edit (omit `apiKey` to keep, `null` to delete, value to replace) |
| DELETE | `/api/ai/providers/:id` | remove provider and its key |
| POST | `/api/ai/providers/:id/enable` \| `disable` | toggle |
| POST | `/api/ai/providers/:id/test-connection` | reachability + auth |
| POST | `/api/ai/providers/:id/test-generation` | real completion |
| GET | `/api/ai/providers/:id/models?refresh=1` | model discovery (5 min cache) |
| POST | `/api/ai/default` | set primary |
| POST | `/api/ai/fallback` | set fallback + limits |
| POST | `/api/ai/text-settings` | MC text generation settings |
| POST | `/api/ai/generate` | unified generation |
| GET | `/api/ai/status` \| `/api/ai/usage` | runtime status / statistics |
| DELETE | `/api/ai/usage` | clear the activity log |

All `/api/ai/*` routes require a same-origin request (foreign `Origin` → 403),
are rate limited (30 writes / 240 reads per minute per IP) and cap bodies at 32 KB.

## Security

- API keys are write-only from the browser; responses contain only `sk-••••••••8702`.
- Keys are encrypted at rest (AES-256-GCM) and never logged; `redact()` scrubs
  `sk-…`, `Bearer …` and `api_key` patterns from any provider error text.
- SSRF guard: `http`/`https` only, no credentials in URL, cloud-metadata
  (`169.254.169.254`), loopback and RFC1918 blocked for `openai-compatible`,
  `openai` and `openrouter`; hostnames are re-resolved at connect time so a public
  name cannot be re-pointed at an internal address. `ollama` deliberately allows
  LAN addresses (that is the point of a LAN Ollama) but never metadata endpoints.
- Usage log stores routing metadata only — no prompts, no responses.

## AI text for the MC (opt-in, default OFF)

When `text.enabled` is true, `processGiftEvent` asks the manager for a thank-you /
crown line, speaks it, and falls back to the existing scripted template on any
error or timeout. The `focus` and `state` SSE payloads are unchanged either way,
so the overlay contract is preserved.

## Tests

```bash
cd app
PORT=3917 ../runtime/node.exe server.cjs &        # or any port
AI_TEST_BASE=http://127.0.0.1:3917 ../runtime/node.exe ai/tests/run-tests.mjs
```

50 checks: real OpenRouter and LAN Ollama connection/discovery/generation, invalid
key, timeout, missing model, 5xx, invalid JSON, fallback, no-fallback-on-invalid,
attempt capping, cancellation, masking, SSRF, cross-origin, persistence, usage-log
hygiene and wedding regressions (7 ceremonies, TTS, SSE, overlay).

`app/ai/tests/mock-ollama.mjs` provides deterministic failure modes.
