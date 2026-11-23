# 28 November release checklist

## P0 external blockers

- [ ] `clariway-1262e` accepts a real `gemini-3.5-flash-lite` cloud request.
- [ ] **Test cloud AI** returns `via in cloud`.
- [ ] The second-opinion flow returns a visible **Cloud · Gemini** result.

## Build and repository

- [x] `npm ci` (clean read-only-source container gate on Node 26.12, satisfying
  the declared Node `>=24.12` engine)
- [x] `npm run verify`
- [x] `npm audit --omit=dev`
- [x] `git diff --check`
- [x] No tracked `.env.local`, debug token, browser profile data, or recorded
  secret pattern in the current diff.
- [ ] Apache-2.0 is visible and README instructions work from a clean checkout.
- [ ] Public repository created only after explicit approval.

## Chrome acceptance

- [x] Reload `dist` from `chrome://extensions`.
- [x] Audit W3C CityLights and confirm deterministic totals: 42/42 images,
  36 missing, 0 ignored.
- [x] Test on-device AI and capture the actual `on device` inference source.
- [x] Describe one visible missing image; verify no Firebase/Google resource before consent.
- [ ] Review exact consent payload, decline once, and confirm nothing sent.
- [ ] Approve once; verify App Check, cloud result, badge, focus, and routing counter.
- [x] Apply and Undo the alt preview; confirm missing count `36 → 35 → 36`.
- [x] Apply 125% scale/high contrast and reset; confirm the original presentation
  is restored.
- [ ] Speak a fresh selection and main-page text with a local voice.
- [ ] Verify keyboard-only traversal at 320 px panel width and 200% browser zoom.
- [x] Exercise the non-responsive local-model path; add a 45-second timeout and
  immediate batch short-circuit. Automated regression passes; reload the rebuilt
  `dist` before the final recording.

## Demo and Devpost

- [ ] Record 2:40–2:50 English video using `docs/demo-script.md`.
- [ ] Hide email, unrelated tabs, DevTools tokens, and private Firebase data.
- [ ] Upload publicly to YouTube only after explicit approval.
- [ ] Paste and proofread `docs/submission.md`.
- [ ] Add public repository and optional install/test URL.
- [ ] Confirm the selected platform is Web/Chrome.
- [ ] Submit before 30 November 2026, 2:00 PM PST.
