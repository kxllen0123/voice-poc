import { NextRequest, NextResponse } from "next/server";
import { getDashscope, transcribeAudio, synthesizeSpeech } from "@/lib/dashscope";
import { models } from "@/lib/models";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

const SYSTEM_PROMPT =
  "你是一个尘螨防控专家AI助手。用简洁的口语化中文回答。每次回复控制在三句话以内。";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioBlob = formData.get("audio");
    const historyRaw = formData.get("history");

    if (!audioBlob || !(audioBlob instanceof Blob)) {
      return NextResponse.json(
        { error: "缺少音频数据" },
        { status: 400 },
      );
    }

    // Parse conversation history
    let history: ChatMessage[] = [];
    if (typeof historyRaw === "string" && historyRaw.length > 0) {
      try {
        history = JSON.parse(historyRaw);
      } catch {
        // ignore malformed history
      }
    }

    // --- Step 1: STT (via multimodal chat completions) ---
    const audioBuffer = Buffer.from(await audioBlob.arrayBuffer());
    const audioBase64 = audioBuffer.toString("base64");
    const mimeType = audioBlob.type || "audio/webm";

    const userText = await transcribeAudio(audioBase64, mimeType);
    if (!userText || userText.trim().length === 0) {
      return NextResponse.json(
        { error: "无法识别语音，请重试" },
        { status: 422 },
      );
    }

    // --- Step 2: LLM ---
    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      { role: "user", content: userText },
    ];

    const completion = await getDashscope().chat.completions.create({
      model: models.chat_fast,
      messages,
    });

    const aiText = completion.choices[0]?.message?.content;
    if (!aiText) {
      return NextResponse.json(
        { error: "AI 未返回有效回复" },
        { status: 502 },
      );
    }

    // --- Step 3: TTS (via DashScope native REST API) ---
    const ttsBuffer = await synthesizeSpeech(aiText);
    const ttsBase64 = ttsBuffer.toString("base64");

    return NextResponse.json({
      userText,
      aiText,
      audioBase64: ttsBase64,
    });
  } catch (err: unknown) {
    console.error("Voice API error:", err);

    const message =
      err instanceof Error ? err.message : "服务器内部错误";

    return NextResponse.json(
      { error: `处理语音时出错：${message}` },
      { status: 500 },
    );
  }
}
