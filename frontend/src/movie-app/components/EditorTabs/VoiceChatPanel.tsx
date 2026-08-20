import { useEffect, useRef, useState } from "react";
import { useVoiceChatStore } from "../../stores/voiceChatStore";

interface Props {
  projectId: string;
}

// ========== SVG Icons ==========

const MicIcon = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
  </svg>
);

const UploadIcon = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const SendIcon = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const AudioIcon = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

const SpinnerIcon = (
  <svg
    className="animate-spin text-tiffany-600"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
    <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="0.75" />
  </svg>
);

// ========== Component ==========

export default function VoiceChatPanel({ projectId }: Props) {
  const store = useVoiceChatStore();

  const fileRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const [sttError, setSttError] = useState<string | null>(null);

  // Clean up any active recognition on unmount.
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      await store.uploadRefAudio(base64, file.name, projectId);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    store.setListening(false);
  };

  const startListening = () => {
    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      setSttError("Speech recognition is not supported in this browser.");
      return;
    }

    setSttError(null);

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      const trimmed = transcript.trim();
      if (trimmed) {
        store.setText(trimmed);
        // Auto-send: speak → transcribe → fill the box → generate voice.
        store.generate(projectId);
      }
    };
    recognition.onerror = () => {
      store.setListening(false);
      recognitionRef.current = null;
    };
    recognition.onend = () => {
      store.setListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    store.setListening(true);
    recognition.start();
  };

  const handleMic = () => {
    if (store.listening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleSend = () => {
    store.generate(projectId);
  };

  const canSend =
    !store.generating &&
    store.text.trim().length > 0 &&
    store.refAudioFilename != null;

  return (
    <div className="border border-ink-200 rounded-2xl p-5 flex flex-col gap-6">
      <div className="flex items-center gap-2">
        {AudioIcon}
        <span className="text-sm font-semibold text-ink-900">
          Voice Chat
        </span>
      </div>

      {/* Reference voice upload */}
      <div className="flex flex-col gap-2">
        <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider">
          Reference Voice
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            onChange={handleUpload}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={store.generating}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-ink-200 bg-white text-ink-600 text-xs font-medium cursor-pointer hover:border-ink-300 hover:bg-ink-100 transition-colors disabled:opacity-50"
          >
            {UploadIcon}
            {store.refAudioFilename ? "Replace" : "Upload"}
          </button>
          {store.refAudioFilename && (
            <span className="text-[11px] text-ink-600 truncate max-w-[200px]">
              {store.refAudioFilename}
            </span>
          )}
        </div>
        {store.refAudioUrl && (
          <audio
            controls
            src={store.refAudioUrl}
            className="w-full max-w-[320px] h-9"
          />
        )}
      </div>

      {/* Text input */}
      <div className="flex items-end gap-2">
        <textarea
          value={store.text}
          onChange={(e) => store.setText(e.target.value)}
          rows={2}
          placeholder="Type or dictate what the cloned voice should say..."
          disabled={store.generating}
          className="flex-1 px-3 py-2 bg-ink-50 border border-ink-200 rounded-2xl text-ink-900 text-sm placeholder-ink-500/40 focus:outline-none focus:border-tiffany-500 focus:ring-2 focus:ring-tiffany-500/30 transition-all resize-none disabled:opacity-50"
        />
        <button
          onClick={handleMic}
          disabled={store.generating}
          className={`flex items-center justify-center w-10 h-10 shrink-0 rounded-2xl border transition-all ${
            store.listening
              ? "bg-red-500 border-red-500 text-white animate-pulse"
              : "border-ink-200 text-ink-600 hover:border-ink-300 hover:bg-ink-100"
          } disabled:opacity-50`}
          title={store.listening ? "Stop listening" : "Speak"}
        >
          {MicIcon}
        </button>
        {store.generating ? (
          <div className="flex items-center justify-center gap-2 px-4 py-2.5 bg-ink-100 text-ink-700 text-sm font-medium rounded-2xl">
            {SpinnerIcon}
            Speaking...
          </div>
        ) : (
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-tiffany-500 hover:bg-tiffany-600 active:bg-tiffany-700 disabled:bg-ink-200 disabled:text-ink-500 text-ink-950 text-sm font-semibold rounded-2xl transition-all duration-150 shadow-sm"
          >
            {SendIcon}
            Send
          </button>
        )}
      </div>

      {store.listening && (
        <p className="text-xs text-red-600 -mt-1">Listening… speak now.</p>
      )}
      {sttError && <p className="text-xs text-red-600">{sttError}</p>}

      {/* Result */}
      {store.resultUrl && (
        <div>
          <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
            Response
          </label>
          <audio
            controls
            autoPlay
            src={store.resultUrl}
            className="w-full max-w-[360px] h-9"
          />
        </div>
      )}

      {/* Error */}
      {store.error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-xs">
          {store.error}
        </div>
      )}

      {/* Logs */}
      {store.logs.length > 0 && (
        <div className="p-4 bg-ink-50 border border-ink-200 rounded-2xl max-h-32 overflow-y-auto">
          <pre className="text-xs text-ink-600 font-mono whitespace-pre-wrap">
            {store.logs.join("")}
          </pre>
        </div>
      )}
    </div>
  );
}
