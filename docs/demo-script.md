# Three-minute demo script

Language: English. Target duration: 2:40–2:50. Record a clean Chrome profile with
only Clariway pinned. Never show DevTools console output containing an App Check
debug token.

## 0:00–0:20 — problem and promise

> The web still contains unlabeled images, inaccessible media, and pages that are
> hard to read. Clariway is a privacy-first accessibility companion for blind,
> low-vision, and hard-of-hearing users. It uses Firebase AI Logic on-device by
> default and makes every cloud boundary visible.

Show the W3C CityLights inaccessible demo and open the Clariway side panel.

## 0:20–0:45 — bounded local audit

Click **Audit current page**. Point out the total, missing image descriptions,
and media/caption states. State that Clariway requests `activeTab`, not blanket
access to browsing history.

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
show exact restoration. Then choose 125% scale plus higher contrast, apply it,
and reset it.

## 2:20–2:40 — speech and hearing support

Show a detected caption/transcript entry or select English text and click
**Speak selected English**. Mention that local voices are preferred and online
voices are labelled.

## 2:40–2:50 — close

> Clariway turns hybrid inference into an accessibility and privacy guarantee:
> fast and private on-device help, explicit cloud quality when the user chooses,
> and reversible changes throughout.

## Recording fallback

Do not record the raw `403 project-unavailable` state as the final demo. If cloud
access is still blocked on 28 November, record all local and consent steps, then
pause publication until the Firebase project is repaired. Never fake a cloud badge.
