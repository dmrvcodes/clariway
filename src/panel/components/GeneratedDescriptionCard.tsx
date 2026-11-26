import type { ImageDescriptionResult } from "../../firebase/ai";

interface GeneratedDescriptionCardProps {
  id: string;
  imageDataUrl: string;
  result: ImageDescriptionResult;
  applied: boolean;
  isBusy: boolean;
  onToggleApply: () => void;
  onRequestCloud: () => void;
}

const sourceLabel = (source: ImageDescriptionResult["source"]): string => {
  if (source === "on_device") return "On device";
  if (source === "in_cloud") return "Cloud · Gemini";
  return "Unknown source";
};

export function GeneratedDescriptionCard({
  id,
  imageDataUrl,
  result,
  applied,
  isBusy,
  onToggleApply,
  onRequestCloud,
}: GeneratedDescriptionCardProps) {
  return (
    <div className="generated-description">
      <img src={imageDataUrl} alt="Image crop described by Clariway" />
      <div>
        <span className="source-badge" data-source={result.source}>
          {sourceLabel(result.source)}
        </span>
        <p id={`description-${id}`} tabIndex={-1}>{result.altText}</p>
        <small>{result.explanation}</small>
      </div>
      <button
        type="button"
        className="small-button"
        disabled={isBusy}
        onClick={onToggleApply}
      >
        {applied ? "Undo preview fix" : "Apply preview fix"}
      </button>
      {result.source === "on_device" && !applied && (
        <button
          type="button"
          className="small-button secondary"
          disabled={isBusy}
          onClick={onRequestCloud}
        >
          Ask the cloud model instead
        </button>
      )}
    </div>
  );
}
