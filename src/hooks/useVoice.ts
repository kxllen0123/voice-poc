"use client";

import { useState, useRef, useCallback, useEffect } from "react";

function detectMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const mime of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return "audio/webm";
}

export type VoiceStatus = "idle" | "recording" | "processing" | "playing";

interface UseVoiceOptions {
  onAudioCaptured: (blob: Blob) => void;
}

export function useVoice({ onAudioCaptured }: UseVoiceOptions) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const statusRef = useRef<VoiceStatus>("idle");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingQueueRef = useRef(false);
  const isFinalReceivedRef = useRef(false);

  const updateStatus = useCallback((s: VoiceStatus) => {
    statusRef.current = s;
    setStatus(s);
  }, []);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  /** 按下开始录音 */
  const startRecording = useCallback(async () => {
    if (statusRef.current !== "idle") return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = detectMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        stopStream();

        if (blob.size > 0) {
          onAudioCaptured(blob);
        } else {
          updateStatus("idle");
        }
      };

      recorder.start(100);
      updateStatus("recording");
    } catch {
      updateStatus("idle");
    }
  }, [onAudioCaptured, stopStream, updateStatus]);

  /** 松开停止录音并发送 */
  const stopRecording = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state === "recording") {
      rec.stop(); // triggers onstop → onAudioCaptured
    } else {
      stopStream();
      updateStatus("idle");
    }
  }, [stopStream, updateStatus]);

  /** 播放 AI 回复 */
  const playAudio = useCallback((base64: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      // 如果正在录音，先停掉（丢弃）
      const rec = mediaRecorderRef.current;
      if (rec && rec.state === "recording") {
        rec.ondataavailable = null;
        rec.onstop = null;
        rec.stop();
      }
      stopStream();

      updateStatus("playing");
      const audioBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const blob = new Blob([audioBytes], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      const cleanup = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        updateStatus("idle");
      };

      audio.onended = () => { cleanup(); resolve(); };
      audio.onerror = () => { cleanup(); reject(new Error("音频播放失败")); };
      audio.play().catch(reject);
    });
  }, [stopStream, updateStatus]);
  /** 清空音频队列 */
  const flushQueue = useCallback(() => {
    audioQueueRef.current = [];
    isPlayingQueueRef.current = false;
    isFinalReceivedRef.current = false;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, []);

  /** 播放队列中的下一个音频 */
  const playNextInQueue = useCallback(() => {
    if (audioQueueRef.current.length === 0) {
      if (isFinalReceivedRef.current) {
        updateStatus("idle");
        isPlayingQueueRef.current = false;
      } else {
        isPlayingQueueRef.current = false;
      }
      return;
    }

    const base64 = audioQueueRef.current.shift()!;
    const audioBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const blob = new Blob([audioBytes], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioRef.current = audio;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      audioRef.current = null;
    };

    audio.onended = () => {
      cleanup();
      playNextInQueue();
    };
    audio.onerror = () => {
      cleanup();
      playNextInQueue();
    };
    audio.play().catch(() => {
      cleanup();
      playNextInQueue();
    });
  }, [updateStatus]);

  /** 将音频加入队列并播放 */
  const queueAudio = useCallback((base64: string, isFinal: boolean) => {
    audioQueueRef.current.push(base64);
    if (isFinal) isFinalReceivedRef.current = true;

    if (!isPlayingQueueRef.current) {
      isPlayingQueueRef.current = true;
      updateStatus("playing");
      playNextInQueue();
    }
  }, [updateStatus, playNextInQueue]);

  /** 标记为处理中（发送到 Agent 期间） */
  const setProcessing = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state === "recording") {
      rec.ondataavailable = null;
      rec.onstop = null;
      rec.stop();
    }
    stopStream();
    updateStatus("processing");
  }, [stopStream, updateStatus]);

  /** 恢复 idle */
  const setIdle = useCallback(() => {
    updateStatus("idle");
  }, [updateStatus]);

  useEffect(() => {
    return () => {
      stopStream();
      flushQueue();
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    };
  }, [stopStream]);

  return {
    status,
    startRecording,
    stopRecording,
    playAudio,
    queueAudio,
    flushQueue,
    setProcessing,
    setIdle,
  };
}
