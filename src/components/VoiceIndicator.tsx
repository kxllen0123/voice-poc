"use client";

import type { VoiceStatus } from "@/hooks/useVoice";

interface VoiceIndicatorProps {
  status: VoiceStatus;
  needsVoice: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  className?: string;
}

const STATUS_CONFIG: Record<VoiceStatus, { label: string; dotColor: string; textColor: string }> = {
  idle: { label: "点击说话", dotColor: "bg-white/30", textColor: "text-white/40" },
  recording: { label: "点击发送", dotColor: "bg-red-400", textColor: "text-red-300" },
  processing: { label: "思考中...", dotColor: "bg-yellow-400", textColor: "text-yellow-300" },
  playing: { label: "正在回复...", dotColor: "bg-green-400", textColor: "text-green-300" },
};

export default function VoiceIndicator({
  status,
  needsVoice,
  onStartRecording,
  onStopRecording,
  className = "",
}: VoiceIndicatorProps) {
  const config = STATUS_CONFIG[status];

  if (!needsVoice || status === "processing" || status === "playing") {
    return (
      <div className={`inline-flex items-center gap-2 rounded-full bg-black/50 backdrop-blur-sm px-3 py-1.5 ${className}`}>
        <div className="relative flex h-2.5 w-2.5 flex-none items-center justify-center">
          <span className={`relative h-2 w-2 rounded-full ${config.dotColor} animate-pulse`} />
        </div>
        <span className={`text-[12px] tracking-wide ${config.textColor}`}>{config.label}</span>
        {status === "playing" && (
          <span className="flex items-center gap-[2px]">
            {[...Array(3)].map((_, j) => (
              <span
                key={j}
                className="inline-block w-[2px] rounded-full bg-green-400/60 animate-[waveBar_0.6s_ease-in-out_infinite_alternate]"
                style={{ height: "10px", animationDelay: `${j * 0.1}s` }}
              />
            ))}
          </span>
        )}
      </div>
    );
  }

  const handleClick = () => {
    if (status === "idle") {
      onStartRecording();
    } else if (status === "recording") {
      onStopRecording();
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`
        flex items-center justify-center gap-2.5 rounded-full backdrop-blur-sm min-w-[160px] min-h-[48px] px-6 py-3
        select-none transition-all duration-150
        ${status === "recording"
          ? "bg-red-500/30 border border-red-400/50 scale-110"
          : "bg-black/50 border border-white/10 active:scale-105"
        }
        ${className}
      `}
    >
      <div className="relative flex h-3 w-3 flex-none items-center justify-center">
        {status === "recording" && (
          <span className="absolute inset-0 animate-ping rounded-full bg-red-400/40" />
        )}
        <span className={`relative h-2.5 w-2.5 rounded-full ${config.dotColor}`} />
      </div>

      <span className={`text-[13px] font-medium tracking-wide ${config.textColor}`}>
        {config.label}
      </span>

      {status === "recording" && (
        <span className="flex items-center gap-[2px]">
          {[...Array(5)].map((_, j) => (
            <span
              key={j}
              className="inline-block w-[2px] rounded-full bg-red-400/70 animate-[waveBar_0.5s_ease-in-out_infinite_alternate]"
              style={{
                height: `${7 + Math.random() * 6}px`,
                animationDelay: `${j * 0.08}s`,
              }}
            />
          ))}
        </span>
      )}
    </button>
  );
}
