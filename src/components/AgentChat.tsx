"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useVoice } from "@/hooks/useVoice";
import VoiceIndicator from "./VoiceIndicator";
import CameraCapture from "./CameraCapture";
import StepProgress from "./StepProgress";
import ReportView from "./ReportView";
import type {
  AgentResponse,
  InspectionStep,
  RiskReport,
  UserInputType,
  AgentPhase,
  StepData,
} from "@/lib/types";

export default function AgentChat() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<AgentPhase>("greeting");
  const [steps, setSteps] = useState<InspectionStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [report, setReport] = useState<RiskReport | null>(null);
  const [expectInput, setExpectInput] = useState<UserInputType[]>(["voice"]);
  const [initialized, setInitialized] = useState(false);

  // New state for photo thumbnails and detail modal
  const [stepPhotos, setStepPhotos] = useState<Map<string, string>>(new Map());
  const [detailStepId, setDetailStepId] = useState<string | null>(null);
  const [collectedData, setCollectedData] = useState<StepData[]>([]);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [showReport, setShowReport] = useState(false);

  // sessionId ref for stable sendToAgent closure
  const sessionIdRef = useRef<string | null>(null);
  sessionIdRef.current = sessionId;

  const needsVoice = expectInput.includes("voice") && phase !== "completed" && phase !== "generating_report";
  const needsPhoto = expectInput.includes("photo");

  // ---------- voice ----------

  const sendToAgentRef = useRef<(formData: FormData) => Promise<void>>(async () => {});

  const onAudioCaptured = useCallback((blob: Blob) => {
    const formData = new FormData();
    formData.append("inputType", "voice");
    formData.append("audio", blob, "recording.webm");
    sendToAgentRef.current(formData);
  }, []);

  const voice = useVoice({ onAudioCaptured });

  // PTT: 按住录音，松开发送
  const handlePttStart = useCallback(() => {
    if (voice.status !== "idle" || !needsVoice) return;
    voice.unlockAudio();
    voice.startRecording();
  }, [voice, needsVoice]);

  const handlePttEnd = useCallback(() => {
    if (voice.status !== "recording") return;
    voice.stopRecording();
  }, [voice]);

  // ---------- camera ----------

  // Camera is always embedded and open from start — no toggle needed

  // ---------- agent comms ----------

  const handleAgentResponse = useCallback(
    (response: AgentResponse) => {
      setSessionId(response.sessionId);
      setPhase(response.phase);
      setExpectInput(response.expectInput);
      if (response.steps) setSteps(response.steps);
      if (response.currentStepIndex !== undefined) setCurrentStepIndex(response.currentStepIndex);
      if (response.report) setReport(response.report);
      if (response.collectedData) setCollectedData(response.collectedData);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const sendToAgent = useCallback(
    async (formData: FormData) => {
      voice.setProcessing();
      setError(null);

      const sid = sessionIdRef.current;
      if (sid) formData.append("sessionId", sid);

      try {
        const res = await fetch("/api/agent", { method: "POST", body: formData });

        const contentType = res.headers.get("content-type") || "";

        if (contentType.includes("text/event-stream")) {
          // SSE response — parse stream
          const reader = res.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            // Process complete SSE events (separated by double newline)
            const parts = buffer.split("\n\n");
            buffer = parts.pop() || "";

            for (const part of parts) {
              if (!part.trim()) continue;

              let eventType = "message";
              let eventData = "";

              for (const line of part.split("\n")) {
                if (line.startsWith("event: ")) {
                  eventType = line.slice(7).trim();
                } else if (line.startsWith("data: ")) {
                  eventData = line.slice(6);
                }
              }

              if (!eventData) continue;

              try {
                const parsed = JSON.parse(eventData);

                if (eventType === "state") {
                  handleAgentResponse(parsed as AgentResponse);
                } else if (eventType === "audio") {
                  const { chunk, isFinal } = parsed as { chunk: string; index: number; isFinal: boolean };
                  if (chunk) {
                    voice.queueAudio(chunk, isFinal);
                  } else if (isFinal) {
                    // Empty final chunk (TTS error) — just set idle
                    voice.setIdle();
                  }
                }
              } catch {
                // JSON parse error — skip this event
              }
            }
          }
        } else {
          // JSON response (noop, echo, error, or no-audio response)
          const data = await res.json();

          if (!res.ok || data.error) {
            setError(data.error ?? "请求失败");
            voice.setIdle();
            return;
          }

          handleAgentResponse(data as AgentResponse);

          // JSON responses typically have no audio (noop/echo), set idle
          if (data.audioBase64) {
            try {
              await voice.playAudio(data.audioBase64);
            } catch {
              voice.setIdle();
            }
          } else {
            voice.setIdle();
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "网络错误";
        setError(`发送失败：${msg}`);
        voice.setIdle();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handleAgentResponse]
  );

  // 保持 ref 最新
  useEffect(() => {
    sendToAgentRef.current = sendToAgent;
  }, [sendToAgent]);

  const handleStart = useCallback(() => {
    if (initialized) return;
    voice.unlockAudio();
    setInitialized(true);
    const formData = new FormData();
    formData.append("inputType", "text");
    formData.append("text", "");
    sendToAgent(formData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, sendToAgent, voice]);

  // ---------- report generation ----------
  // When phase becomes generating_report and voice finishes, auto-trigger report
  useEffect(() => {
    if (phase !== "generating_report") return;
    if (voice.status === "playing" || voice.status === "processing") return;
    // Voice finished — start generating report
    setGeneratingReport(true);
    const formData = new FormData();
    formData.append("inputType", "text");
    formData.append("text", "");
    sendToAgent(formData).finally(() => {
      setGeneratingReport(false);
      setShowReport(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, voice.status]);

  // ---------- photo ----------

  const onPhotoCapture = useCallback(
    (photoBase64: string) => {
      // Save photo for step thumbnail
      const stepId = steps[currentStepIndex]?.id;
      if (stepId) {
        setStepPhotos((prev) => new Map(prev).set(stepId, photoBase64));
      }

      // camera stays open after capture
      const formData = new FormData();
      formData.append("inputType", "photo");
      const byteChars = atob(photoBase64);
      const byteArray = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
      const photoBlob = new Blob([byteArray], { type: "image/jpeg" });
      formData.append("photo", photoBlob, "photo.jpg");
      sendToAgent(formData);
    },
    [sendToAgent, steps, currentStepIndex]
  );

  // ---------- render ----------

  return (
    <div className="relative flex h-dvh flex-col bg-black overflow-hidden">
      {/* Header overlay */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-center px-5 py-3 bg-gradient-to-b from-black/70 to-transparent pointer-events-none">
        <h1 className="text-[14px] font-medium tracking-widest text-white/70">尘螨防控助手</h1>
      </div>

      {/* Camera fills remaining space above step strip */}
      <div className="flex-1 relative overflow-hidden">
        {phase !== "completed" && (
          <CameraCapture showCapture={needsPhoto && voice.status === "idle"} onCapture={onPhotoCapture} />
        )}

        {/* PTT button + voice status floating over camera */}
        {phase !== "completed" && (
          <div className={`absolute left-0 right-0 z-20 flex items-center justify-center ${needsPhoto ? 'bottom-28' : 'bottom-4'}`}>
            <VoiceIndicator
              status={voice.status}
              needsVoice={needsVoice}
              onPttStart={handlePttStart}
              onPttEnd={handlePttEnd}
            />
          </div>
        )}

        {/* Error banner floating */}
        {error && (
          <div className="absolute top-16 left-4 right-4 z-20 rounded-xl bg-red-500/15 backdrop-blur-sm px-4 py-2.5 text-center text-[13px] text-red-400 border border-red-500/20">
            {error}
          </div>
        )}

        {!initialized && (
          <div className="absolute inset-0 flex items-center justify-center bg-black z-30">
            <button
              type="button"
              onClick={handleStart}
              className="flex flex-col items-center gap-4 text-center active:scale-95 transition-transform"
            >
              <div className="text-5xl">🎙️</div>
              <p className="text-[16px] font-medium text-white/80">点击开始检测</p>
              <p className="text-[13px] text-white/30">轻触以启动语音助手</p>
            </button>
          </div>
        )}

        {/* Report loading overlay */}
        {generatingReport && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-30">
            <div className="flex flex-col items-center gap-4">
              <div className="reportSpinner" />
              <p className="text-[15px] text-white/60 animate-pulse">
                正在生成风险评估报告...
              </p>
            </div>
          </div>
        )}

        {/* Report card — slides up from bottom after generation */}
        {showReport && report && (
          <div className="absolute inset-0 z-40 flex flex-col bg-black/60 backdrop-blur-sm" onClick={() => setShowReport(false)}>
            <div className="flex-1" />
            <div
              className="reportSlideUp max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-[#1a1a1a] border-t border-white/10 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drag handle */}
              <div className="sticky top-0 z-10 flex justify-center py-3 bg-[#1a1a1a] rounded-t-3xl">
                <div className="h-1 w-10 rounded-full bg-white/20" />
              </div>
              <ReportView report={report} />
              <div className="px-4 pb-[env(safe-area-inset-bottom,16px)] pb-6">
                <button
                  type="button"
                  onClick={() => setShowReport(false)}
                  className="w-full rounded-xl bg-[#2563eb] py-3 text-[15px] font-medium text-white transition-colors active:bg-[#1d4ed8]"
                >
                  知道了
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Step Strip at bottom — always rendered, hidden when no steps */}
      {steps.length > 0 && phase !== "completed" && (
        <StepProgress
          steps={steps}
          currentIndex={currentStepIndex}
          stepPhotos={stepPhotos}
          onStepTap={(stepId) => setDetailStepId(stepId)}
        />
      )}

      {/* Step Detail Modal */}
      {detailStepId && (
        <div className="absolute inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <span className="text-white font-medium text-[15px]">
              {steps.find((s) => s.id === detailStepId)?.location}
            </span>
            <button
              type="button"
              onClick={() => setDetailStepId(null)}
              className="text-white/50 text-xl leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
            >
              ✕
            </button>
          </div>
          {stepPhotos.get(detailStepId) && (
            <img
              src={`data:image/jpeg;base64,${stepPhotos.get(detailStepId)}`}
              className="w-full aspect-video object-cover"
              alt=""
            />
          )}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {/* Step target info */}
            <div className="bg-white/5 rounded-xl p-3">
              <div className="text-white/40 text-[11px] uppercase tracking-wider mb-1">拍摄目标</div>
              <div className="text-white/70 text-[14px]">
                {steps.find((s) => s.id === detailStepId)?.target}
              </div>
            </div>

            {/* Items from collectedData for this step */}
            {collectedData
              .filter((d) => d.stepId === detailStepId)
              .flatMap((d) => d.items)
              .map((item, i) => (
                <div key={i} className="bg-white/5 rounded-xl p-3">
                  <div className="text-white text-[14px] font-medium">{item.name}</div>
                  <div className="text-white/50 text-[13px] mt-1">材质：{item.material}</div>
                  <div className="text-white/40 text-[12px] mt-0.5">{item.condition}</div>
                </div>
              ))}

            {/* Cleaning frequency from collectedData */}
            {collectedData
              .filter((d) => d.stepId === detailStepId)
              .map((d, i) =>
                Object.entries(d.cleaningFrequency).length > 0 ? (
                  <div key={i} className="bg-white/5 rounded-xl p-3">
                    <div className="text-white/60 text-[13px] font-medium mb-2">清洗频次</div>
                    {Object.entries(d.cleaningFrequency).map(([item, freq]) => (
                      <div key={item} className="flex justify-between text-[13px] py-1 border-b border-white/5 last:border-0">
                        <span className="text-white/60">{item}</span>
                        <span className="text-blue-300">{freq}</span>
                      </div>
                    ))}
                  </div>
                ) : null
              )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes waveBar {
          0% { transform: scaleY(0.6); }
          100% { transform: scaleY(1.4); }
        }
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .reportSlideUp {
          animation: slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .reportSpinner {
          width: 40px;
          height: 40px;
          border: 3px solid rgba(255,255,255,0.1);
          border-top-color: #2563eb;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
