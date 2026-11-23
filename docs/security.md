# Security and privacy model

## Protected assets

- Page text, selected text, image pixels, captions, and transcripts.
- The mapping between a page and generated descriptions.
- Firebase App Check debug tokens and local development configuration.
- The integrity of the current page when a preview fix is applied and undone.

## Trust boundaries

```text
Untrusted web page
  │ activeTab + bounded extraction
  ▼
Injected content adapter ──► side panel state ──► Chrome on-device model
                                  │
                                  └─ explicit consent object ─► App Check ─► Gemini
```

Page text is data, never an instruction. The alt-text prompt marks page title,
description, and nearby text as untrusted. AI output is parsed against a bounded
schema before it reaches the UI or DOM.

## Enforced properties

- No blanket host permissions and no persistent content script.
- No automatic `PREFER_*` inference mode.
- `LanguageModel` must exist before the SDK's on-device adapter is called.
- On-device inference uses a Firebase app instance without App Check, preventing
  token exchange and Firebase traffic on the local path.
- Cloud inference accepts only a frozen `CloudConsent` containing the crop and
  bounded fields shown to the user.
- A cloud request starts only from **Send to cloud**. Declining removes the
  pending payload from React state.
- Reading comfort is implemented with a dedicated style element and data
  attributes; reset removes only Clariway-owned state.
- Preview `alt` mutation records whether the original attribute existed and
  restores that exact state.
- Local TTS voices are sorted first. Online voices are explicitly labelled.
- The repository ignores all `.env.*` files except `.env.example`.

## Known risks and mitigations

| Risk | Mitigation | Residual risk |
| --- | --- | --- |
| Prompt injection in nearby page text | Delimited untrusted context and strict output schema | A model can still produce a poor but schema-valid description; user review remains required |
| SDK silently routes local work to cloud | Fail-closed `LanguageModel` check and `ONLY_ON_DEVICE` | Future SDK behavior must be regression-tested on upgrade |
| Local model never settles | 45-second UI timeout; remaining batch items skip the failed runtime and stay local pending consent | The SDK exposes no cancellation handle here, so the abandoned task may finish later in the browser process |
| Accidental disclosure through TTS | Local voices first; remote voices labelled | User can deliberately select a network voice |
| Stale DOM target | Image id plus expected source validation before Apply/Undo | A page can replace an image with the same source between checks |
| Debug token disclosure | Ignored local env, documentation warning, no token in screenshots | A public dev build must never ship with debug App Check enabled |
| Cloud provider unavailable | Typed actionable error; local workflow remains usable | Cloud result cannot be demonstrated until project access is restored |

## Non-goals for the contest build

- No user accounts, analytics, behavioral telemetry, remote audit history, or page storage.
- No live microphone/tab-audio capture.
- No automated changes to a site's source or persistent publishing of generated `alt` text.
