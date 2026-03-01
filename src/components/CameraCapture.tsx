"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import { useCamera } from "@/hooks/useCamera";

interface CameraCaptureProps {
  /** 是否显示拍照按钮（仅在等待拍照阶段显示） */
  showCapture: boolean;
  onCapture: (photoBase64: string) => void;
}

export default function CameraCapture({
  showCapture,
  onCapture,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const camera = useCamera();
  const [preview, setPreview] = useState<string | null>(null);
  const cameraOpenRef = useRef(false);

  // 应用启动时自动打开摄像头，且保持常驻
  useEffect(() => {
    if (videoRef.current && !cameraOpenRef.current) {
      cameraOpenRef.current = true;
      camera.open(videoRef.current);
    }
    return () => {
      if (cameraOpenRef.current) {
        cameraOpenRef.current = false;
        camera.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 进入拍照阶段时清除上一张预览
  useEffect(() => {
    if (showCapture) {
      setPreview(null);
      // 如果摄像头因某种原因关闭了（如 handleConfirm 后重拍），重新打开
      if (videoRef.current && !cameraOpenRef.current) {
        cameraOpenRef.current = true;
        camera.open(videoRef.current);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCapture]);

  const handleCapture = useCallback(() => {
    const base64 = camera.capture();
    if (base64) setPreview(base64);
  }, [camera]);

  const handleConfirm = useCallback(() => {
    if (preview) {
      onCapture(preview);
      setPreview(null);
      // 摄像头保持打开，不做 close/open 操作
    }
  }, [preview, onCapture]);

  const handleRetake = useCallback(() => {
    setPreview(null);
    if (videoRef.current && !cameraOpenRef.current) {
      cameraOpenRef.current = true;
      camera.open(videoRef.current);
    }
  }, [camera]);

  return (
    <div className="w-full h-full relative overflow-hidden bg-black">
      {/* video 始终渲染且可见，preview 时由绝对定位的 img 覆盖，避免 invisible 导致浏览器停止解码帧 */}
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted
        className="h-full w-full object-cover"
      />
      {preview && (
        <img
          src={`data:image/jpeg;base64,${preview}`}
          alt="拍摄预览"
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      {/* 错误提示 */}
      {camera.error && (
        <div className="absolute left-4 right-4 top-4 rounded-xl bg-red-500/20 px-4 py-3 text-center text-sm text-red-400">
          {camera.error}
        </div>
      )}

      {/* 拍照控制区：仅在 showCapture 阶段显示 */}
      {showCapture && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-6 py-4 pb-[env(safe-area-inset-bottom,16px)]">
          {preview ? (
            <div className="flex items-center justify-center gap-8">
              <button
                type="button"
                onClick={handleRetake}
                className="rounded-xl bg-white/10 px-6 py-2.5 text-white text-sm"
              >
                重拍
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="rounded-xl bg-[#2563eb] px-6 py-2.5 text-white text-sm"
              >
                使用照片
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center">
              <button
                type="button"
                onClick={handleCapture}
                className="flex h-[64px] w-[64px] items-center justify-center rounded-full border-4 border-white bg-white/20 transition-all active:scale-90"
              >
                <span className="h-[48px] w-[48px] rounded-full bg-white" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
