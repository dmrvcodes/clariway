# Platform boundary and portability

The release candidate is intentionally Chrome-first because the contest's Web
track targets Gemini Nano through Firebase AI Logic in Chrome. Portability is
designed at the domain boundary, not claimed through untested manifests.

## Reusable domain layer

- `src/core/alt-text.ts`: bounded context, prompt, and response validation.
- `src/core/hybrid-routing.ts`: fail-closed local-first decision and immutable consent.
- `src/core/image-crop.ts`: viewport-to-capture geometry.
- `src/core/messages.ts`: runtime-validated contracts.
- `src/firebase/ai.ts`: Firebase AI Logic modes and model calls.

## Chrome adapters

- `src/background/index.ts`: `activeTab`, injection, capture, side panel, DOM mutation routing.
- `src/content/index.ts`: bounded page/media audit and reversible page presentation.
- `src/core/tts.ts`: Chrome TTS voice discovery and speech.
- `public/manifest.json`: MV3 and Chrome side-panel declaration.

## Edge and other Chromium browsers

The WebExtensions and side-panel surfaces are close, but the release must first
verify Firebase's on-device adapter and multimodal `LanguageModel` availability.
If local AI is absent, Clariway must show the consent card; it must never silently
convert the build into cloud-only behavior.

## Firefox

Use a Firefox sidebar adapter and WebExtensions namespace shim. Treat local AI
as unavailable until Firebase exposes a supported on-device runtime. Cloud use
still requires the same visible payload and explicit consent. A separate
manifest is safer than conditional permissions in the Chrome submission.

## Android

Reuse prompts, Zod-equivalent schemas, routing states, and consent wording in a
native UI. Replace `activeTab` with an Android share/accessibility input adapter,
Chrome TTS with Android `TextToSpeech`, and the Web Firebase SDK with the Android
Firebase AI Logic SDK. Do not send AccessibilityService data without a per-action
review screen.

## iOS

Reuse the domain contracts and consent semantics. Replace Gemini Nano with Apple
Foundation Models through Firebase AI Logic, browser capture with a Share
Extension/Safari Web Extension adapter, and TTS with `AVSpeechSynthesizer`.

## Deferred portability work

- Cross-browser CI and signed extension packages.
- Mobile UI implementations and store compliance.
- Live captions, microphone access, and background audio processing.
- Shared encrypted history or authenticated synchronization.
