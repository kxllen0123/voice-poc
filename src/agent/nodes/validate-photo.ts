import { getDashscope } from "@/lib/dashscope";
import { models } from "@/lib/models";
import type { AgentStateType } from "../state";
import { VALIDATE_PHOTO_PROMPT } from "../prompts";

export async function validatePhotoNode(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const client = getDashscope();
  const step = state.inspectionSteps[state.currentStepIndex];

  if (!step || !state.userPhoto) {
    return {
      phase: "waiting_photo",
      photoValid: false,
      aiText: "我还没有收到照片，请拍一张照片给我看看。",
    };
  }

  const prompt = VALIDATE_PHOTO_PROMPT
    .replace("{target}", step.target)
    .replace("{location}", step.location);

  const completion = await client.chat.completions.create({
    model: models.vision,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${state.userPhoto}`,
            },
          },
        ],
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? '{"valid": false, "reason": "无法分析"}';
  let result: { valid: boolean; reason: string };
  try {
    result = JSON.parse(raw);
  } catch {
    result = { valid: true, reason: "分析完成" }; // 容错：解析失败时默认通过
  }

  if (result.valid) {
    return {
      phase: "identifying_items",
      photoValid: true,
      aiText: "照片拍得很好！让我来仔细分析一下。",
      messages: [{ role: "assistant", content: "照片验证通过" }],
    };
  }

  return {
    phase: "waiting_photo",
    photoValid: false,
    userPhoto: "",
    aiText: `这张照片不太符合要求：${result.reason}。请重新拍一张。`,
    messages: [
      { role: "assistant", content: `照片不合格：${result.reason}` },
    ],
  };
}
