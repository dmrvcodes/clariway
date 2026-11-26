import type { MediaAuditItem, PageContext, ReadingProfile } from "../../core/messages";
import type { VoiceOption } from "../../core/tts";
import type { RoutingActivity } from "../types";

interface AdditionalAccessibilityToolsProps {
  mediaAudit: PageContext["mediaAudit"] | null;
  readingProfile: ReadingProfile;
  routingActivity: RoutingActivity;
  voices: VoiceOption[];
  voiceName: string;
  isBusy: boolean;
  isSpeaking: boolean;
  onReadingProfileChange: (profile: ReadingProfile) => void;
  onUpdateReadingProfile: (reset: boolean) => void;
  onSpeakSelection: () => void;
  onSpeakPage: () => void;
  onSpeakTranscript: (item: MediaAuditItem) => void;
  onStopSpeech: () => void;
  onVoiceChange: (voiceName: string) => void;
}

const mediaStateLabel = (item: MediaAuditItem): string => {
  if (item.state === "captioned") return "Caption track available";
  if (item.state === "transcript") return "Transcript available";
  return "No caption or transcript found";
};

const formatDuration = (duration: number | null): string | null => {
  if (duration === null) return null;
  const minutes = Math.floor(duration / 60);
  const seconds = Math.floor(duration % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
};

export function AdditionalAccessibilityTools({
  mediaAudit,
  readingProfile,
  routingActivity,
  voices,
  voiceName,
  isBusy,
  isSpeaking,
  onReadingProfileChange,
  onUpdateReadingProfile,
  onSpeakSelection,
  onSpeakPage,
  onSpeakTranscript,
  onStopSpeech,
  onVoiceChange,
}: AdditionalAccessibilityToolsProps) {
  return (
    <details className="secondary-tools">
      <summary>More accessibility tools</summary>
      {mediaAudit && mediaAudit.total > 0 && (
        <section className="media-report" aria-labelledby="media-title">
          <h2 id="media-title">Captions and transcripts</h2>
          <dl className="report-summary">
            <div><dt>Media checked</dt><dd>{mediaAudit.audited} of {mediaAudit.total}</dd></div>
            <div><dt>Without text alternative</dt><dd>{mediaAudit.missing}</dd></div>
          </dl>
          {mediaAudit.total > 20 && <p className="hint">Showing the first 20 media elements.</p>}
          <ul className="media-audit">
            {mediaAudit.items.map((item) => {
              const duration = formatDuration(item.duration);
              return (
                <li key={item.id} data-state={item.state}>
                  <strong>{mediaStateLabel(item)}</strong>
                  <span>{item.title || `${item.element === "video" ? "Video" : "Audio"}${duration ? ` · ${duration}` : ""}`}</span>
                  {item.tracks.length > 0 && (
                    <p className="track-summary">
                      {item.tracks.map((track) =>
                        `${track.kind}${track.language ? ` (${track.language})` : ""}`,
                      ).join(", ")}
                    </p>
                  )}
                  {item.hasTranscriptLink && !item.transcript && (
                    <p className="track-summary">A transcript link is present on the page.</p>
                  )}
                  {item.transcript && (
                    <details>
                      <summary>Read available transcript</summary>
                      <p className="transcript-preview">{item.transcript}</p>
                        <button
                          type="button"
                          className="small-button secondary"
                          disabled={isBusy}
                          onClick={() => onSpeakTranscript(item)}
                        >
                        Speak this transcript
                      </button>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="reading-title">
        <h2 id="reading-title">Reading comfort</h2>
        <p className="hint">Changes apply to this tab and stay in the browser.</p>
        <label className="control-label">
          Page scale
          <select
            value={readingProfile.textScale}
            onChange={(event) => onReadingProfileChange({
              ...readingProfile,
              textScale: Number(event.target.value) as ReadingProfile["textScale"],
            })}
          >
            <option value={100}>100%</option>
            <option value={125}>125%</option>
            <option value={150}>150%</option>
          </select>
        </label>
        <label className="checkbox-control">
          <input
            type="checkbox"
            checked={readingProfile.highContrast}
            onChange={(event) => onReadingProfileChange({
              ...readingProfile,
              highContrast: event.target.checked,
            })}
          />
          Increase page contrast and focus visibility
        </label>
        <div className="actions">
          <button type="button" disabled={isBusy} onClick={() => onUpdateReadingProfile(false)}>Apply to this tab</button>
          <button type="button" className="secondary" disabled={isBusy} onClick={() => onUpdateReadingProfile(true)}>Reset page presentation</button>
        </div>
      </section>

      <section aria-labelledby="speech-title">
        <h2 id="speech-title">Read text aloud</h2>
        <div className="actions">
            <button type="button" className="secondary" disabled={isBusy} onClick={onSpeakSelection}>Speak selected English</button>
            <button type="button" className="secondary" disabled={isBusy} onClick={onSpeakPage}>Speak page text</button>
          {isSpeaking && <button type="button" className="secondary" onClick={onStopSpeech}>Stop speaking</button>}
        </div>
        {voices.length > 0 && (
          <label className="voice-select">
            English voice
            <select value={voiceName} onChange={(event) => onVoiceChange(event.target.value)}>
              {voices.map((voice) => (
                <option key={voice.voiceName} value={voice.voiceName}>
                  {voice.voiceName} ({voice.lang}){voice.remote ? " · network voice" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      <section aria-labelledby="routing-title">
        <h2 id="routing-title">Privacy routing</h2>
        <dl className="routing-stats">
          <div><dt>On-device results</dt><dd>{routingActivity.onDeviceResults}</dd></div>
          <div><dt>Cloud consent given</dt><dd>{routingActivity.approvedCloudSends}</dd></div>
        </dl>
        <p className="hint">Counts reset on the next audit. Clariway sends no analytics or background telemetry.</p>
      </section>
    </details>
  );
}
