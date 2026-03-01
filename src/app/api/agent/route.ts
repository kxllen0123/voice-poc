import { NextRequest, NextResponse } from "next/server";
import { getDashscope, transcribeAudio, synthesizeSpeech, splitSentences } from "@/lib/dashscope";
import { createAgentGraph } from "@/agent/graph";
import {
  getSession,
  setSession,
  createSessionId,
} from "@/agent/session";
import type { AgentStateType } from "@/agent/state";
import type { AgentResponse, UserInputType } from "@/lib/types";
import {
  DETECT_QUESTION_PROMPT,
} from "@/agent/prompts";

import { models } from "@/lib/models";
const graph = createAgentGraph();

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const sessionId = (formData.get("sessionId") as string) || createSessionId();
    const inputType = (formData.get("inputType") as UserInputType) || "voice";

    // 获取或创建 session 状态
    let state = getSession(sessionId);
    const isNew = !state;

    // 处理用户输入
    let userText = "";
    let userPhoto = "";

    if (inputType === "voice") {
      const audioBlob = formData.get("audio");
      if (audioBlob && audioBlob instanceof Blob) {
        const buffer = Buffer.from(await audioBlob.arrayBuffer());
        const audioBase64 = buffer.toString("base64");
        const mimeType = audioBlob.type || "audio/webm";
        userText = await transcribeAudio(audioBase64, mimeType);
      }
    } else if (inputType === "photo") {
      const photoBlob = formData.get("photo");
      if (photoBlob && photoBlob instanceof Blob) {
        const buffer = Buffer.from(await photoBlob.arrayBuffer());
        userPhoto = buffer.toString("base64");
      }
    } else if (inputType === "text") {
      userText = (formData.get("text") as string) || "";
    }

    // ---- 防护：空转录 / 回声检测 ----
    // 语音输入但转录为空（环境噪音），直接返回当前状态
    if (inputType === "voice" && !userText.trim() && state) {
      return NextResponse.json(buildNoopResponse(sessionId, state));
    }

    // 回声检测：麦克风拾取到扬声器播放的 AI 回复
    if (inputType === "voice" && userText && state?.aiText && isEcho(userText, state.aiText)) {
      console.log("Echo detected, skipping:", userText.slice(0, 40));
      return NextResponse.json(buildNoopResponse(sessionId, state));
    }

    // 构建输入状态
    const inputState: Partial<AgentStateType> = {
      userText,
      userPhoto,
    };

    // 如果不是新 session 且用户有文本输入，检测是否在提问
    if (state && userText && state.phase !== "greeting" && state.phase !== "asking_layout") {
      const isQuestion = await detectQuestion(userText, state.phase);
      if (isQuestion) {
        inputState.isHandlingQuestion = true;
        inputState.previousPhase = state.phase;
      }
    }

    // 如果用户上传了照片，切到验证阶段
    if (userPhoto && state?.phase === "waiting_photo") {
      inputState.phase = "validating_photo";
    }

    // 合并状态
    if (state) {
      state = { ...state, ...inputState };
    } else {
      // 新会话，使用默认初始状态
      state = {
        messages: [],
        phase: "greeting",
        userText: "",
        userPhoto: "",
        aiText: "",
        houseLayout: null,
        inspectionSteps: [],
        currentStepIndex: 0,
        currentStepData: null,
        collectedData: [],
        photoValid: false,
        report: null,
        isHandlingQuestion: false,
        previousPhase: null,
        ...inputState,
      };
    }

    // 运行 graph
    const result = await graph.invoke(state);

    // 保存状态
    setSession(sessionId, result);

    // 决定前端应该展示哪些输入方式
    const expectInput: UserInputType[] = [];
    switch (result.phase) {
      case "asking_layout":
      case "confirming_materials":
      case "asking_frequency":
        expectInput.push("voice");
        break;
      case "waiting_photo":
        expectInput.push("photo");
        expectInput.push("voice"); // 用户也可以语音提问
        break;
      case "generating_report":
      case "completed":
        break; // 无需用户输入
      default:
        expectInput.push("voice");
    }

    const response: AgentResponse = {
      sessionId,
      phase: result.phase,
      aiText: result.aiText,
      audioBase64: undefined,
      userText: userText || undefined,
      steps: result.inspectionSteps.length > 0 ? result.inspectionSteps : undefined,
      currentStepIndex: result.currentStepIndex,
      photoValidation: result.phase === "waiting_photo" && !result.photoValid && result.userPhoto
        ? { valid: false, reason: result.aiText }
        : undefined,
      identifiedItems: result.currentStepData?.items,
      report: result.report ?? undefined,
      expectInput,
      collectedData: result.collectedData.length > 0 ? result.collectedData : undefined,
    };

    // Split aiText into sentences for per-sentence TTS streaming
    const sentences = splitSentences(result.aiText);
    console.log(`[SSE] aiText length=${result.aiText.length}, sentences=${sentences.length}:`, sentences.map((s, i) => `[${i}] "${s.slice(0, 30)}..."`));
    if (!sentences.length) {
      // No audio to stream, return JSON as before
      return NextResponse.json(response);
    }

    // Create SSE stream — TTS sequentially to avoid rate limits,
    // stream each chunk immediately as it completes
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (event: string, data: object) => {
          controller.enqueue(encoder.encode(
            `event: ${event}
data: ${JSON.stringify(data)}

`
          ));
        };

        // Send state first
        send("state", response);

        // TTS each sentence sequentially with retry on 429
        for (let i = 0; i < sentences.length; i++) {
          const isLast = i === sentences.length - 1;
          let base64 = "";
          let success = false;

          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const buffer = await synthesizeSpeech(sentences[i]);
              base64 = buffer.toString("base64");
              success = true;
              break;
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : "";
              const isRetryable = errMsg.includes("429") || errMsg.includes("500");
              if (isRetryable && attempt < 2) {
                const delay = (attempt + 1) * 1000;
                console.warn(`[SSE] TTS chunk ${i} error (attempt ${attempt + 1}), retry in ${delay}ms`);
                await new Promise(r => setTimeout(r, delay));
              } else {
                console.error(`[SSE] TTS chunk ${i} failed after ${attempt + 1} attempts:`, err);
                break;
              }
            }
          }

          if (success && base64) {
            send("audio", { chunk: base64, index: i, isFinal: isLast });
          } else if (isLast) {
            send("audio", { chunk: "", index: i, isFinal: true });
          }
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (err: unknown) {
    console.error("Agent API error:", err);
    const message = err instanceof Error ? err.message : "服务器内部错误";
    return NextResponse.json(
      { error: `Agent 处理出错：${message}` },
      { status: 500 }
    );
  }
}

async function detectQuestion(userText: string, phase: string): Promise<boolean> {
  try {
    const prompt = DETECT_QUESTION_PROMPT
      .replace("{userText}", userText)
      .replace("{phase}", phase);

    const completion = await getDashscope().chat.completions.create({
      model: models.chat_fast,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? '{"isQuestion": false}';
    const result = JSON.parse(raw);
    return result.isQuestion === true;
  } catch {
    return false;
  }
}

/** 回声检测：转录文本与上一轮 AI 回复的相似度过高 */
function isEcho(userText: string, aiText: string): boolean {
  // 标准化：去标点、空格，转小写
  const normalize = (s: string) =>
    s.replace(/[\s\p{P}]/gu, "").toLowerCase();
  const u = normalize(userText);
  const a = normalize(aiText);
  if (!u || !a) return false;
  // 完全包含：用户转录是 AI 文本的子串（或反之）
  if (a.includes(u) || u.includes(a)) return true;
  // 高重叠：取较短串，检查连续子串命中率
  const shorter = u.length < a.length ? u : a;
  const longer = u.length < a.length ? a : u;
  // 取前 20 个字符做子串匹配
  const probe = shorter.slice(0, 20);
  if (probe.length >= 6 && longer.includes(probe)) return true;
  return false;
}

/** 构造无操作响应（echo / 空转录时返回） */
function buildNoopResponse(
  sessionId: string,
  state: AgentStateType
): AgentResponse {
  const expectInput: UserInputType[] = [];
  switch (state.phase) {
    case "asking_layout":
    case "confirming_materials":
    case "asking_frequency":
      expectInput.push("voice");
      break;
    case "waiting_photo":
      expectInput.push("photo");
      expectInput.push("voice");
      break;
    case "completed":
      break;
    default:
      expectInput.push("voice");
  }
  return {
    sessionId,
    phase: state.phase,
    aiText: "",
    expectInput,
    steps: state.inspectionSteps.length > 0 ? state.inspectionSteps : undefined,
    currentStepIndex: state.currentStepIndex,
    report: state.report ?? undefined,
  };
}
