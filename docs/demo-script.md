# Three-minute demo script

Language: English. Target duration: 2:30–2:45. The primary audience is people who
use screen readers. Record a clean Chrome profile with only Clariway pinned.
Never show DevTools console output containing an App Check debug token.

## 0:00–0:20 — problem and promise

> People who use screen readers still meet images with no alt text. Clariway
> finds those gaps and creates reviewable descriptions, starting on-device. A
> cloud request only happens after the user inspects and approves its payload.

Show the W3C CityLights inaccessible demo and open the Clariway side panel.

## 0:20–0:45 — bounded local audit

Click **Find missing image descriptions**. Show the page name, audited image
count, and missing-alt count. State that the page audit is local and Clariway
requests `activeTab`, not blanket access to browsing history.

## 0:45–1:25 — real on-device multimodal AI

Click **Describe this image** on the heat-wave image. While it runs:

> The screenshot is cropped locally. Firebase AI Logic calls Gemini Nano with
> `ONLY_ON_DEVICE`; this path uses no App Check instance and makes no Firebase
> request.

Show the **On device** badge, generated alt text, explanation, and routing count.

## 1:25–1:55 — explicit cloud boundary

Click **Ask the cloud model instead**. Expand **Text sent with the image**.

> Cloud is never an automatic fallback. Clariway freezes exactly this crop and
> bounded context. Nothing leaves the device until I click Send to cloud.

Click **Send to cloud** only when project access is fixed. Show the
**Cloud · Gemini** badge and approved-cloud-send count.

## 1:55–2:20 — user control

Click **Apply preview fix** and show the missing count decrease. Click Undo and
show exact restoration. This is a temporary preview; Clariway does not edit the
site's source code or publish a change.

## 2:20–2:40 — speech and hearing support

Open **More accessibility tools**. Briefly show caption/transcript detection and
the option to read selected English text aloud. Mention that local voices are
preferred and online voices are labelled.

## 2:40–2:50 — close

> Clariway gives screen-reader users a way to review missing image descriptions,
> with local-first AI, explicit cloud consent, and reversible page changes.

## Recording fallback

Do not record the raw `403 project-unavailable` state as the final demo. If cloud
access is still blocked on 28 November, record all local and consent steps, then
pause publication until the Firebase project is repaired. Never fake a cloud badge.
