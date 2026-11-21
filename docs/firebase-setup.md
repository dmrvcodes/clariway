# Firebase setup for local development

Clariway uses the existing Firebase project `clariway-1262e` and Firebase AI
Logic with the Gemini Developer API backend.

## 1. Enable Firebase AI Logic

In Firebase Console, open **Build > AI Logic** for `clariway-1262e`, choose the
Gemini Developer API provider, and complete the activation flow. The extension
already contains its public Firebase web configuration in `src/firebase/app.ts`.

## 2. Enable App Check development mode

Firebase AI Logic requires App Check. In the project root, create the ignored
file `.env.local` with:

    VITE_APP_CHECK_DEBUG=true

Build the extension and load `dist` from `chrome://extensions`. Open the
extension's service-worker inspector, trigger either **Test on-device AI** or
**Test cloud AI**, and copy the App Check debug token Firebase logs there.

In Firebase Console, go to **Build > App Check > Apps > Manage debug tokens**.
Register that token. Rebuild/reload the extension and run the diagnostic again.

Keep the token local. It authorizes development traffic and must never be put in
the repository, a demo video, or the Devpost submission.

## 3. Verify enforcement after confirmation

Firebase AI Logic should be marked **Enforced** in **Security > App Check > APIs**.
Firebase's AI Logic setup normally enables this automatically. Once both
diagnostics succeed, verify that status and re-run them, including the on-device
path on Chrome 139 or newer.

## Production note

The debug provider is only for the hackathon development build. A public browser
release needs a production attestation strategy registered in App Check. Do not
publish this build with `VITE_APP_CHECK_DEBUG=true`.
