import type { ImageAuditItem, PageContext } from "../../core/messages";
import { CloudConsentCard } from "./CloudConsentCard";
import { GeneratedDescriptionCard } from "./GeneratedDescriptionCard";
import type { DescriptionEntries } from "../types";

interface ImageAuditResultsProps {
  context: PageContext;
  descriptions: DescriptionEntries;
  isBusy: boolean;
  isBatching: boolean;
  busyImageId: string | null;
  onDescribeVisible: () => void;
  onDescribeOne: (item: ImageAuditItem) => void;
  onSendToCloud: (item: ImageAuditItem) => void;
  onDeclineCloud: (item: ImageAuditItem) => void;
  onToggleApply: (item: ImageAuditItem, restore: boolean) => void;
  onRequestCloud: (item: ImageAuditItem) => void;
}

const imageStateLabel = (item: ImageAuditItem): string => {
  if (item.state === "missing") return "Missing alt text";
  if (item.state === "ignored") return "Hidden from screen readers";
  return "Has alt text";
};

export function ImageAuditResults({
  context,
  descriptions,
  isBusy,
  isBatching,
  busyImageId,
  onDescribeVisible,
  onDescribeOne,
  onSendToCloud,
  onDeclineCloud,
  onToggleApply,
  onRequestCloud,
}: ImageAuditResultsProps) {
  return (
    <section aria-labelledby="context-title" aria-busy={isBusy}>
      <h2 id="context-title" tabIndex={-1}>Image results</h2>
      <p className="page-title" title={context.title}>{context.title || "Untitled page"}</p>
      <dl className="report-summary">
        <div><dt>Checked</dt><dd>{context.imageAudit.audited} of {context.imageAudit.total}</dd></div>
        <div><dt>Missing alt</dt><dd>{context.imageAudit.missing}</dd></div>
      </dl>

      {context.imageAudit.missing > 0 && (
        <div className="hybrid-action">
          <button type="button" disabled={isBusy} onClick={onDescribeVisible}>
            {isBatching ? "Preparing descriptions…" : "Describe up to 3 visible images"}
          </button>
          <p className="hint">
            Gemini Nano runs on-device when available. If cloud help is needed, you will review the exact crop and context first.
          </p>
        </div>
      )}
      {context.imageAudit.missing === 0 && (
        <p className="empty-state">No images without alt text were found in the audited set.</p>
      )}
      {context.imageAudit.total > 50 && (
        <p className="hint">Showing the first 50 images for a fast local audit.</p>
      )}

      {context.imageAudit.items.length > 0 && (
        <ul className="image-audit">
          {context.imageAudit.items.map((item) => {
            const entry = descriptions[item.id];
            return (
              <li key={item.id} data-state={item.state}>
                <strong>{imageStateLabel(item)}</strong>
                <span className="existing-alt">{item.alt || "No alternative text"}</span>
                {item.nearbyText && <small>{item.nearbyText}</small>}
                {item.state === "missing" && !entry && (
                  <button
                    type="button"
                    id={`describe-${item.id}`}
                    className="small-button secondary"
                    disabled={isBusy}
                    onClick={() => onDescribeOne(item)}
                  >
                    {busyImageId === item.id ? "Describing…" : "Describe this image"}
                  </button>
                )}
                {entry?.cloudRequest && (
                  <CloudConsentCard
                    id={item.id}
                    input={entry.input}
                    request={entry.cloudRequest}
                    hasLocalResult={entry.result !== null}
                    localDescription={entry.result?.altText}
                    isBusy={isBusy}
                    isSending={busyImageId === item.id}
                    onSend={() => onSendToCloud(item)}
                    onDecline={() => onDeclineCloud(item)}
                  />
                )}
                {entry?.result && !entry.cloudRequest && (
                  <GeneratedDescriptionCard
                    id={item.id}
                    imageDataUrl={entry.input.imageDataUrl}
                    result={entry.result}
                    applied={entry.applied}
                    isBusy={isBusy}
                    onToggleApply={() => onToggleApply(item, entry.applied)}
                    onRequestCloud={() => onRequestCloud(item)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
