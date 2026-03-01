"use client";

import { useState, useRef, useCallback } from "react";

export function useCamera() {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const open = useCallback(async (videoElement: HTMLVideoElement) => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment", // 后置摄像头
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      streamRef.current = stream;
      videoRef.current = videoElement;
      videoElement.srcObject = stream;
      await videoElement.play();
      setIsOpen(true);
    } catch {
      setError("无法访问摄像头，请检查权限设置");
      setIsOpen(false);
    }
  }, []);

  const capture = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video) return null;

    const canvas = document.createElement("canvas");
    canvas.width = Math.min(video.videoWidth, 1920);
    canvas.height = Math.min(video.videoHeight, 1080);

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // 返回 base64 (去掉 data:image/jpeg;base64, 前缀)
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    return dataUrl.split(",")[1] ?? null;
  }, []);

  const close = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current = null;
    }
    setIsOpen(false);
  }, []);

  return {
    isOpen,
    error,
    open,
    capture,
    close,
  };
}
