# Devpost submission draft

## Project name

Clariway

## Tagline

Privacy-first hybrid AI that makes visual and spoken web content easier to access.

## Inspiration

Accessibility tools often force an uncomfortable trade-off: keep sensitive page
content local and accept limited capability, or send it to a powerful cloud model
without a clear boundary. Clariway makes that boundary part of the interface.

## What it does

Clariway is a Chrome accessibility companion for blind, low-vision, and
hard-of-hearing users. It audits images, captions, subtitles, and transcript
references on the active page. For visible images without alternative text, it
crops only the relevant pixels and asks Gemini Nano for a concise English
description on the device. The user can review and reversibly apply the result.

When local AI is unavailable or the user wants a second opinion, Clariway shows
the exact image crop and bounded page context that would be sent to Gemini through
Firebase AI Logic. The cloud call is impossible until the user explicitly
approves that payload. Clariway also reads selected or main-page English text,
surfaces available transcripts, prefers local TTS voices, and provides reversible
page scaling and contrast controls.

## How we used Firebase

Clariway uses `@firebase/ai` hybrid inference with explicit
`ONLY_ON_DEVICE` and `ONLY_IN_CLOUD` model instances. Cloud requests are protected
by Firebase App Check. Local inference uses a separate Firebase app without App
Check, so it does not exchange a token or contact Firebase. Every result displays
the inference source reported by the SDK.

We also found and mitigated a subtle SDK edge case: when Chrome does not expose
`LanguageModel`, the SDK can lack its on-device adapter even for an
`ONLY_ON_DEVICE` request. Clariway verifies the runtime first and fails closed.

## How it is built

- React 19 and TypeScript side panel.
- MV3 service worker with `activeTab`, on-demand script injection, and no host permissions.
- Runtime-validated Zod message contracts.
- Firebase AI Logic structured multimodal output.
- Immutable cloud-consent payloads and exact reversible DOM mutations.
- Chrome TTS with local voices prioritized.

## Challenges

- Preserving Chrome user activation while initializing the on-device image model.
- Cropping the correct device-pixel region from a visible-tab capture.
- Preventing implicit SDK fallback and App Check traffic on the local path.
- Restoring the exact original `alt` attribute state after a preview.
- Auditing media without fetching cross-origin transcripts or requesting tab-audio access.

## Accomplishments

- Real multimodal on-device descriptions with zero Firebase resources before consent.
- A cloud boundary the user can inspect, decline, and verify.
- Bounded image/media audits with no blanket browsing permission.
- Keyboard and screen-reader focus management after asynchronous AI state changes.
- Reversible alt text and page-presentation previews.

## What is next

Validate with blind, low-vision, and hard-of-hearing users; add signed Chromium
packages; build Android and iOS adapters using the same routing contract; and
explore privacy-reviewed live captioning without weakening explicit consent.

## Required links before submission

- Public GitHub or GitLab repository: pending explicit publication approval.
- Public YouTube demo, at most three minutes, in English: pending recording.
- Optional hosted/testable extension URL: pending packaging decision.
