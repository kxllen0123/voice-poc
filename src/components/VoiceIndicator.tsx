"use client";

import { useRef, useCallback } from "react";
import type { VoiceStatus } from "@/hooks/useVoice";

interface VoiceIndicatorProps {
  status: VoiceStatus;
  needsVoice: boolean;
  onPttStart: () => void;
  onPttEnd: () => void;
  className?: string;
}

const STATUS_CONFIG: Record<VoiceStatus, { label: string; dotColor: string; textColor: string }> = {
  idle: { label: "按住说话", dotColor: "bg-white/30", textColor: "text-white/40" },
  recording: { label: "松开发送", dotColor: "bg-red-400", textColor: "text-red-300" },
  processing: { label: "思考中...", dotColor: "bg-yellow-400", textColor: "text-yellow-300" },
  playing: { label: "正在回复...", dotColor: "bg-green-400", textColor: "text-green-300" },
};

export default function VoiceIndicator({
  status,
  needsVoice,
  onPttStart,
  onPttEnd,
  className = "",
}: VoiceIndicatorProps) {
  const config = STATUS_CONFIG[status];
  const isPressing = useRef(false);
  const isTouchRef = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (!needsVoice || status !== "idle") return;
    isTouchRef.current = true;
    isPressing.current = true;
    onPttStart();
  }, [needsVoice, status, onPttStart]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (!isPressing.current) return;
    isPressing.current = false;
    onPttEnd();
  }, [onPttEnd]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isTouchRef.current) return;
    e.preventDefault();
    if (!needsVoice || status !== "idle") return;
    isPressing.current = true;
    onPttStart();
  }, [needsVoice, status, onPttStart]);

  const handleMouseEnd = useCallback((e: React.MouseEvent) => {
    if (isTouchRef.current) { isTouchRef.current = false; return; }
    e.preventDefault();
    if (!isPressing.current) return;
    isPressing.current = false;
    onPttEnd();
  }, [onPttEnd]);

  // 不需要语音输入 或 正在处理/播放 → 只显示状态指示
  if (!needsVoice || status === "processing" || status === "playing") {
    return (
      <div className={`inline-flex items-center gap-2 rounded-full bg-black/50 backdrop-blur-sm px-3 py-1.5 ${className}`}>
        <div className="relative flex h-2.5 w-2.5 flex-none items-center justify-center">
          <span className={`relative h-2 w-2 rounded-full ${config.dotColor} animate-pulse`} />
        </div>
        <span className={`text-[12px] tracking-wide ${config.textColor}`}>{config.label}</span>
        {/* 播放波形 */}
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

  // PTT 按钮
  return (
    <button
      type="button"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseEnd}
      onMouseLeave={handleMouseEnd}
      className={`
        flex items-center justify-center gap-2.5 rounded-full backdrop-blur-sm min-w-[160px] min-h-[48px] px-6 py-3
        select-none touch-none transition-all duration-150
        ${status === "recording"
          ? "bg-red-500/30 border border-red-400/50 scale-110"
          : "bg-black/50 border border-white/10 active:scale-105"
        }
        ${className}
      `}
    >
      {/* 麦克风图标 + 动态圆点 */}
      <div className="relative flex h-3 w-3 flex-none items-center justify-center">
        {status === "recording" && (
          <span className="absolute inset-0 animate-ping rounded-full bg-red-400/40" />
        )}
        <span className={`relative h-2.5 w-2.5 rounded-full ${config.dotColor}`} />
      </div>

      {/* 文字 */}
      <span className={`text-[13px] font-medium tracking-wide ${config.textColor}`}>
        {config.label}
      </span>

      {/* 录音波形 */}
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
