import OpenAI from "openai";
import { models } from "@/lib/models";

let _client: OpenAI | null = null;

export function getDashscope(): OpenAI {
  if (!_client) {
    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey) {
      throw new Error(
        "DASHSCOPE_API_KEY 未配置。请复制 .env.example 为 .env.local 并填入你的 API Key。"
      );
    }
    _client = new OpenAI({
      apiKey,
      baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    });
  }
  return _client;
}

export function getDashscopeApiKey(): string {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "DASHSCOPE_API_KEY 未配置。请复制 .env.example 为 .env.local 并填入你的 API Key。"
    );
  }
  return apiKey;
}

/**
 * STT: 使用 qwen3-asr-flash 通过 DashScope 原生 multimodal 端点
 * DashScope 不支持 OpenAI 兼容的 /audio/transcriptions
 * 也不支持通过 OpenAI compat chat/completions 处理音频
 */
export async function transcribeAudio(audioBase64: string, mimeType: string): Promise<string> {
  const apiKey = getDashscopeApiKey();
  const dataUri = `data:${mimeType};base64,${audioBase64}`;

  const url = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-DashScope-SSE": "disable",
    },
    body: JSON.stringify({
      model: models.stt,
      input: {
        messages: [
          {
            role: "user",
            content: [{ audio: dataUri }],
          },
        ],
      },
      parameters: {
        result_format: "message",
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`STT API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  // Response structure: output.choices[0].message.content (string or array)
  const content = data.output?.choices?.[0]?.message?.content;
  if (Array.isArray(content)) {
    // content is [{text: "..."}]
    return content[0]?.text ?? "";
  }
  return typeof content === "string" ? content : "";
}

/**
 * TTS: 使用 qwen3-tts-flash 通过 DashScope 原生 multimodal 端点
 * 返回 JSON 中包含 audio URL，需要再下载音频文件
 * DashScope 不支持 OpenAI 兼容的 /audio/speech
 */
export async function synthesizeSpeech(text: string): Promise<Buffer> {
  const apiKey = getDashscopeApiKey();
  const url = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-DashScope-SSE": "disable",
    },
    body: JSON.stringify({
      model: models.tts,
      input: {
        text,
        voice: "Cherry",
        language_type: "Chinese",
      },
      parameters: {
        volume: 50,
        rate: 1.0,
        pitch: 1.0,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`TTS API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  // Response structure: output.audio.url contains a downloadable WAV URL
  const audioUrl = data.output?.audio?.url;
  if (!audioUrl) {
    throw new Error(`TTS API error: no audio URL in response: ${JSON.stringify(data).substring(0, 300)}`);
  }

  // Download the audio file
  const audioResponse = await fetch(audioUrl);
  if (!audioResponse.ok) {
    throw new Error(`Failed to download TTS audio: ${audioResponse.status}`);
  }

  const arrayBuffer = await audioResponse.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/** 文本分句：将长文本拆分为适合 TTS 的句子级别片段 */
export function splitSentences(text: string): string[] {
  if (!text || !text.trim()) {
    return [];
  }

  const chunks: string[] = [];
  let current = "";

  const SENTENCE_ENDS = new Set(['。', '！', '？', '；', '.', '!', '?', '…']);
  const CLAUSE_ENDS = new Set(['，', ',', '、', '：', ':']);

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    current += char;

    const isSentenceEnd = SENTENCE_ENDS.has(char) || char.charCodeAt(0) === 10;
    const isClauseEnd = CLAUSE_ENDS.has(char);
    const isMaxLength = current.length >= 60;
    const isSoftBreak = current.length >= 15 && isClauseEnd;

    if (isSentenceEnd || isSoftBreak || isMaxLength) {
      const trimmed = current.trim();
      if (trimmed) {
        chunks.push(trimmed);
      }
      current = "";
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  // 合并短尾巴：如果最后一个片段 < 8 字符，则合并到前一个片段中
  if (chunks.length > 1) {
    const lastIdx = chunks.length - 1;
    if (chunks[lastIdx].length < 8) {
      chunks[lastIdx - 1] += chunks[lastIdx];
      chunks.pop();
    }
  }

  return chunks.filter((s) => s.length > 0);
}
