# Clariway

Clariway helps people who use screen readers understand images that have no alt
text. It audits the current page locally, creates a candidate description with
Gemini Nano when available, and lets the user review and apply the change as a
reversible tab-only preview.

Cloud inference is a user-controlled option. Before any cloud request, Clariway
shows the exact image crop and bounded page context. Nothing is sent until the
user approves that preview. The core flow is built around image access; caption
audits, speech, and reading controls remain available as secondary tools.

Page code is injected only after a user action through `activeTab`. Clariway
requests no blanket host permissions and sends no analytics or background
telemetry.

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
npm ci
npm run verify
```

Audits, speech, and on-device descriptions work without Firebase setup.
Cloud descriptions and **Test cloud AI** need Firebase AI Logic and App Check:
follow [docs/firebase-setup.md](docs/firebase-setup.md). Do not commit
`.env.local` or an App Check debug token. The Firebase project also needs Gemini
API free-tier or hackathon quota access; App Check alone does not grant model
access.

Load the unpacked extension from `chrome://extensions`:

1. Enable **Developer mode**.
2. Select **Load unpacked**.
3. Choose the generated `dist` directory.
4. Open a regular HTTP or HTTPS page and click the Clariway toolbar action.

Versioned Chrome packages will appear in [GitHub Releases](https://github.com/dmrvcodes/clariway/releases)
after a release tag is published. Until then, build from this checkout with the
commands above and select the generated `dist` directory in **Load unpacked**.
Release archives contain the built extension, not project credentials.

On-device image descriptions need Chrome 139 or newer with the multimodal
Prompt API available.

## Project details

- [Firebase setup for local development](docs/firebase-setup.md)
- [Security and privacy model](docs/security.md)
- [Three-minute demo script](docs/demo-script.md)
- [Devpost submission draft](docs/submission.md)

## License

Apache-2.0. See [LICENSE](LICENSE).

## Judge site and CI

Firebase Hosting serves the judge page from `site/`; it does not host the
extension runtime. GitHub Actions builds a judge-downloadable package from a
version tag and deploys the judge page only through the protected
`firebase-hosting` environment. The quality workflow never receives Firebase
App Check credentials.
