import { getDashscope } from "@/lib/dashscope";
import { models } from "@/lib/models";
import type { AgentStateType } from "../state";
import { SYSTEM_PROMPT, GUIDE_PROMPT } from "../prompts";

export async function guideNode(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const client = getDashscope();
  const step = state.inspectionSteps[state.currentStepIndex];

  if (!step) {
    return {
      phase: "generating_report",
      aiText: "所有检查点都已完成，我来为您生成报告。",
    };
  }

  const prompt = GUIDE_PROMPT
    .replace("{currentStep}", String(state.currentStepIndex + 1))
    .replace("{totalSteps}", String(state.inspectionSteps.length))
    .replace("{location}", step.location)
    .replace("{target}", step.target)
    .replace("{description}", step.description);

  const completion = await client.chat.completions.create({
    model: models.chat_fast,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...state.messages.slice(-6), // 保留最近上下文
      { role: "user", content: prompt },
    ],
  });

  const aiText =
    completion.choices[0]?.message?.content ??
    `请前往${step.location}，拍摄${step.target}。`;

  return {
    phase: "waiting_photo",
    aiText,
    messages: [{ role: "assistant", content: aiText }],
  };
}
