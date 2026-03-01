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

// Minimal silent WAV (44 bytes) — used to "bless" the Audio element on mobile
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

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

  // Single persistent Audio element — created once, reused for all playback.
  // Mobile browsers require .play() to originate from a user gesture;
  // once the element is "blessed" via unlockAudio(), subsequent .src changes
  // + .play() calls work even outside gesture context.
  const persistentAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentBlobUrlRef = useRef<string | null>(null);

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

  const revokeCurrentUrl = useCallback(() => {
    if (currentBlobUrlRef.current) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }
  }, []);

  const getAudio = useCallback((): HTMLAudioElement => {
    if (!persistentAudioRef.current) {
      persistentAudioRef.current = new Audio();
    }
    return persistentAudioRef.current;
  }, []);

  /**
   * Unlock audio playback on mobile browsers.
   * MUST be called synchronously from a user gesture handler (click/touchend).
   * Plays a silent WAV to "bless" the persistent Audio element so that
   * future .play() calls succeed even outside gesture context.
   */
  const unlockAudio = useCallback(async () => {
    const audio = getAudio();
    audio.src = SILENT_WAV;
    audio.play().then(() => {
      audio.pause();
      audio.currentTime = 0;
    }).catch(() => {});

    // Pre-request mic permission so PTT doesn't trigger a dialog mid-gesture
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {}
  }, [getAudio]);

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

  /** 播放 AI 回复 (single audio, non-queued) */
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
      revokeCurrentUrl();

      const audioBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const blob = new Blob([audioBytes], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);
      currentBlobUrlRef.current = url;

      const audio = getAudio();

      const cleanup = () => {
        revokeCurrentUrl();
        updateStatus("idle");
      };

      audio.onended = () => { cleanup(); resolve(); };
      audio.onerror = () => { cleanup(); reject(new Error("音频播放失败")); };
      audio.src = url;
      audio.play().catch(reject);
    });
  }, [stopStream, updateStatus, revokeCurrentUrl, getAudio]);

  /** 清空音频队列 */
  const flushQueue = useCallback(() => {
    audioQueueRef.current = [];
    isPlayingQueueRef.current = false;
    isFinalReceivedRef.current = false;
    revokeCurrentUrl();
    const audio = persistentAudioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
  }, [revokeCurrentUrl]);

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

    revokeCurrentUrl();

    const base64 = audioQueueRef.current.shift()!;
    const audioBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const blob = new Blob([audioBytes], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    currentBlobUrlRef.current = url;

    const audio = getAudio();

    audio.onended = () => {
      playNextInQueue();
    };
    audio.onerror = () => {
      playNextInQueue();
    };
    audio.src = url;
    audio.play().catch(() => {
      playNextInQueue();
    });
  }, [updateStatus, revokeCurrentUrl, getAudio]);

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
      if (persistentAudioRef.current) {
        persistentAudioRef.current.pause();
        persistentAudioRef.current = null;
      }
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
    unlockAudio,
  };
}
