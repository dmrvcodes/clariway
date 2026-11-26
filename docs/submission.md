# Devpost submission draft

## Project name

Clariway

## Tagline

Reviewable, privacy-first image descriptions for people who use screen readers.

## Inspiration

People who use screen readers still encounter images with no alternative text.
AI description tools can also send page content to the cloud before a user has
seen what is included. Clariway treats image access and cloud-sharing control as
one workflow.

## What it does

Clariway is a Chrome accessibility companion for people who use screen readers.
It audits up to 50 images on the active page and identifies images with no alt
attribute. For a visible image, it captures and crops the relevant pixels in the
browser, then asks Gemini Nano for a concise English description on-device. The
user reviews the description before applying it as a reversible tab-only preview.

When local AI is unavailable or the user wants a second opinion, Clariway shows
the exact image crop and bounded page context that would be sent to Gemini through
Firebase AI Logic. The user must explicitly approve that payload before the cloud
call can start. Clariway also checks caption and transcript availability, reads
selected or page text aloud, prefers local TTS voices, and provides reversible
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

- Real multimodal on-device descriptions without Firebase network requests.
- A cloud boundary the user can inspect, decline, and verify.
- Bounded image/media audits with no blanket browsing permission.
- Keyboard and screen-reader focus management after asynchronous AI state changes.
- Reversible alt text and page-presentation previews.

## What is next

Validate the image workflow with screen-reader users, add more Chromium browser
packages, and explore mobile adapters using the same consent contract.

## Required links before submission

- Public source repository: https://github.com/dmrvcodes/clariway
- Public Chrome build: add a versioned GitHub Release URL after the release package is published.
- Hosted judge page: https://clariway-1262e.web.app/
- Public YouTube demo, at most three minutes, in English or with English subtitles: pending recording.
