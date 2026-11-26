import { AdditionalAccessibilityTools } from "./components/AdditionalAccessibilityTools";
import { ImageAuditResults } from "./components/ImageAuditResults";
import { useClariwayPanel } from "./useClariwayPanel";
import "./styles.css";

export function App() {
  const { state, actions } = useClariwayPanel();

  return (
    <main>
      <header>
        <span className="eyebrow">For people who use screen readers</span>
        <h1>Clariway</h1>
        <p>
          Find images without alt text. Get a description on this device and review it before
          it changes the page.
        </p>
      </header>

      <section aria-labelledby="audit-title" aria-busy={state.isInspecting}>
        <h2 id="audit-title">Scan this page</h2>
        <p className="hint">
          Clariway checks the first 50 images locally. It does not send page content to the cloud
          during an audit.
        </p>
        <div className="actions">
          <button
            type="button"
            disabled={state.isBusy}
            onClick={() => void actions.inspectPage()}
          >
            {state.isInspecting ? "Scanning page…" : "Find missing image descriptions"}
          </button>
        </div>
      </section>

      {state.context && (
        <ImageAuditResults
          context={state.context}
          descriptions={state.descriptions}
          isBusy={state.isBusy}
          isBatching={state.isBatching}
          busyImageId={state.busyImageId}
          onDescribeVisible={() => void actions.describeVisibleMissing()}
          onDescribeOne={(item) => void actions.describeOne(item)}
          onSendToCloud={(item) => void actions.sendToCloud(item)}
          onDeclineCloud={actions.declineCloud}
          onToggleApply={(item, restore) => void actions.mutateAlt(item, restore)}
          onRequestCloud={actions.requestCloudDescription}
        />
      )}

      <AdditionalAccessibilityTools
        mediaAudit={state.context?.mediaAudit ?? null}
        readingProfile={state.readingProfile}
        routingActivity={state.routingActivity}
        voices={state.voices}
        voiceName={state.voiceName}
        isBusy={state.isBusy}
        isSpeaking={state.isSpeaking}
        onReadingProfileChange={actions.setReadingProfile}
        onUpdateReadingProfile={(reset) => void actions.updateReadingProfile(reset)}
        onSpeakSelection={() => void actions.speakSelection()}
        onSpeakPage={() => void actions.speakPage()}
        onSpeakTranscript={(item) => void actions.speakTranscript(item)}
        onStopSpeech={() => void actions.stopSpeech()}
        onVoiceChange={actions.setVoiceName}
      />

      <details className="advanced-tools">
        <summary>Developer diagnostics</summary>
        <p className="hint">
          Firebase AI Logic checks. The displayed result source must match the selected route.
        </p>
        <div className="actions">
          <button
            type="button"
            className="secondary"
            disabled={state.isProbing || state.isBusy}
            onClick={() => void actions.runProbe("on-device")}
          >
            Test on-device AI
          </button>
          <button
            type="button"
            className="secondary"
            disabled={state.isProbing || state.isBusy}
            onClick={() => void actions.runProbe("in-cloud")}
          >
            Test cloud AI
          </button>
        </div>
      </details>

      <p className="status" role="status" aria-live="polite" aria-atomic="true">
        {state.status}
      </p>
    </main>
  );
}
