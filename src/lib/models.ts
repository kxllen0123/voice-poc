/**
 * 模型配置：从环境变量读取，方便切换和调试
 *
 * 三层分级：
 *   fast   — 高频交互（问候、引导、确认材质、判断提问）
 *   medium — 中等推理（解析户型、生成步骤、回答提问）
 *   strong — 强力分析（生成报告）
 *   vision — 图像理解（照片验证、物品识别）
 *   stt    — 语音识别
 *   tts    — 语音合成
 */
export const models = {
  /** 快速交互层 */
  chat_fast: process.env.MODEL_CHAT_FAST || "qwen-turbo",
  /** 中等推理层 */
  chat_medium: process.env.MODEL_CHAT_MEDIUM || "qwen-plus",
  /** 强力分析层 */
  chat_strong: process.env.MODEL_CHAT_STRONG || "qwen-max",
  /** 视觉模型 */
  vision: process.env.MODEL_VISION || "qwen-vl-max",
  /** 语音识别 */
  stt: process.env.MODEL_STT || "qwen3-asr-flash",
  /** 语音合成 */
  tts: process.env.MODEL_TTS || "qwen3-tts-flash",
} as const;
