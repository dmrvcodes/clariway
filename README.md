# Clariway

Context-aware accessibility assistant built for the Firebase #BuildHybridAI
2026 hackathon.

## Local build

```bash
npm install
npm run build
```

Before using either AI diagnostic, configure Firebase AI Logic and App Check
following [docs/firebase-setup.md](docs/firebase-setup.md). Do not commit
`.env.local` or an App Check debug token.

Delivery notes and acceptance checks:

- [19 November foundation](docs/progress-2026-11-19.md)
- [20 November hybrid image descriptions](docs/progress-2026-11-20.md)
- [21 November media accessibility audit](docs/progress-2026-11-21.md)

Load the unpacked extension from `chrome://extensions`:

1. Enable **Developer mode**.
2. Select **Load unpacked**.
3. Choose the generated `dist` directory.
4. Open a regular HTTP or HTTPS page and click the Clariway toolbar action.

Clariway audits up to the first 50 images, generates grounded English alt text
for visible images with Firebase hybrid inference, exposes the actual inference
source, and applies reviewed descriptions as reversible tab-local previews. It
also audits audio/video captions and transcript references, reads available
English text-track cues aloud, speaks selected English text, and exposes explicit
on-device/cloud diagnostics. Page inspection, media auditing, cropping, and TTS
stay on-device. Page code is injected only after a user action through
`activeTab`; the extension requests no blanket host permissions.
