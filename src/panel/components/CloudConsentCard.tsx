import { buildAltTextContext, type ImageDescriptionInput } from "../../core/alt-text";
import type { CloudRequest } from "../types";

const consentTitles: Record<CloudRequest["reason"], string> = {
  "device-unavailable": "On-device AI is not available",
  "device-failed": "On-device AI could not describe this image",
  "second-opinion": "Ask the cloud model for another description?",
};

interface CloudConsentCardProps {
  id: string;
  input: ImageDescriptionInput;
  request: CloudRequest;
  hasLocalResult: boolean;
  localDescription?: string;
  isBusy: boolean;
  isSending: boolean;
  onSend: () => void;
  onDecline: () => void;
}

export function CloudConsentCard({
  id,
  input,
  request,
  hasLocalResult,
  localDescription,
  isBusy,
  isSending,
  onSend,
  onDecline,
}: CloudConsentCardProps) {
  const context = buildAltTextContext(input.page, input.image);
  const sentText = [
    { label: "Page title", value: context.pageTitle || "(empty)" },
    { label: "Page description", value: context.pageDescription || "(empty)" },
    { label: "Nearby text", value: context.nearbyText || "(empty)" },
    { label: "Image dimensions", value: context.intrinsicSize },
    { label: "Interactive element", value: context.interactive ? "Yes" : "No" },
  ];

  return (
    <div
      className="cloud-consent"
      id={`consent-${id}`}
      tabIndex={-1}
      role="group"
      aria-labelledby={`consent-title-${id}`}
    >
      <img src={input.imageDataUrl} alt="Preview of the exact image crop" />
      <div>
        <strong id={`consent-title-${id}`}>{consentTitles[request.reason]}</strong>
        {request.detail && <small>{request.detail}</small>}
        {localDescription && (
          <p className="local-result">
            Current on-device description (not included in the cloud request): {localDescription}
          </p>
        )}
        <p>
          Nothing has been sent. If you continue, this crop and the exact fields below go to
          Google Gemini through Firebase AI Logic.
        </p>
        <details>
          <summary>Review data sent with the image</summary>
          <dl>
            {sentText.map((field) => (
              <div key={field.label}>
                <dt>{field.label}</dt>
                <dd>{field.value}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>
      <div className="consent-actions">
        <button
          type="button"
          className="small-button"
          disabled={isBusy}
          onClick={onSend}
        >
          {isSending ? "Sending…" : "Send to cloud"}
        </button>
        <button
          type="button"
          className="small-button secondary"
          disabled={isBusy}
          onClick={onDecline}
        >
          {hasLocalResult ? "Keep on-device result" : "Don't send"}
        </button>
      </div>
    </div>
  );
}
