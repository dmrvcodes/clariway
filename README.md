# Clariway

Context-aware accessibility assistant built for the Firebase #BuildHybridAI
2026 hackathon.

Clariway audits up to the first 50 images, generates grounded English alt text
for visible images, and applies reviewed descriptions as reversible tab-local
previews. It also audits audio/video captions and transcript references, reads
available English text-track cues aloud, and speaks selected or bounded main-page
English text. A reversible reading profile provides 100/125/150% page scaling,
stronger contrast, and focus visibility. Page code is injected only after a
user action through `activeTab`; the extension requests no blanket host
permissions.

## Hybrid AI routing

| Feature | Where it runs | Firebase AI Logic mode |
| --- | --- | --- |
| Page, image, and media audit; image cropping | This browser, no AI | none |
| Image description (default) | Gemini Nano in Chrome, on this device | `ONLY_ON_DEVICE` |
| Image description in the cloud | Gemini, only after the user approves the exact crop and page text | `ONLY_IN_CLOUD` |
| AI diagnostics | Explicit test buttons with a fixed test prompt | `ONLY_ON_DEVICE` / `ONLY_IN_CLOUD` |

No feature uses an automatic fallback mode. When on-device AI is unavailable or
fails, nothing is sent: the image card shows the exact crop and page text a
cloud request would contain, and the user chooses **Send to cloud** or
**Don't send**. On-device results also offer **Ask the cloud model instead**
behind the same consent step. The cloud call accepts only a consent object
created by that click, which carries the approved payload. Every result shows
the actual `inferenceSource` reported by Firebase.

On-device generation is bounded to 45 seconds. If Chrome's local runtime stops
responding, the panel recovers, nothing is sent, and the same review/consent
flow is shown. A failed item also short-circuits the remaining local attempts in
that batch instead of making the user wait through the same runtime failure.

Two safeguards close gaps in the default SDK behavior (`@firebase/ai` 3.1.0):

- Firebase AI Logic creates its on-device adapter only when Chrome exposes
  `LanguageModel`. Without it, even `ONLY_ON_DEVICE` requests go to the cloud.
  Clariway checks for the Prompt API first and fails closed.
- On-device inference runs on a separate Firebase app instance without App
  Check, so local work makes no Firebase network request. Cloud requests use
  the App Check-protected instance.

Speech uses Chrome text-to-speech. Local voices are listed first; voices
labelled "network voice" are synthesized by an online service.

## Local build

Requires Node.js 24.12 or newer.

```bash
npm install
npm run build
```

Audits, speech, and on-device descriptions work without Firebase setup.
Cloud descriptions and **Test cloud AI** need Firebase AI Logic and App Check:
follow [docs/firebase-setup.md](docs/firebase-setup.md). Do not commit
`.env.local` or an App Check debug token. The Firebase project must also have
Gemini API free-tier access or billing enabled; App Check alone is not enough.

Load the unpacked extension from `chrome://extensions`:

1. Enable **Developer mode**.
2. Select **Load unpacked**.
3. Choose the generated `dist` directory.
4. Open a regular HTTP or HTTPS page and click the Clariway toolbar action.

On-device image descriptions need Chrome 139 or newer with the multimodal
Prompt API available.

Delivery notes and acceptance checks:

- [19 November foundation](docs/progress-2026-11-19.md)
- [20 November hybrid image descriptions](docs/progress-2026-11-20.md)
- [21 November media audit and cloud consent](docs/progress-2026-11-21.md)
- [22–28 November delivery plan](docs/plan-2026-11-22-to-28.md)
- [22–28 November implementation and acceptance](docs/progress-2026-11-22-to-28.md)
- [Security and privacy model](docs/security.md)
- [Platform roadmap](docs/platform-roadmap.md)
- [Three-minute demo script](docs/demo-script.md)
- [Devpost submission draft](docs/submission.md)
- [28 November release checklist](docs/release-checklist.md)

## License

Apache-2.0. See [LICENSE](LICENSE).

## Judge site and CI

Firebase Hosting serves the static judge page from `site/`; it does not host the
extension runtime. GitHub Actions packages the unpacked extension and deploys the
judge page only through the protected `firebase-hosting` environment. The CI
workflow never receives Firebase App Check credentials. Cloud integration checks
are manual and must use a separate protected environment and debug token.
