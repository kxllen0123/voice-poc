import { getDashscope } from "@/lib/dashscope";
import { models } from "@/lib/models";
import type { AgentStateType } from "../state";
import { SYSTEM_PROMPT, DOMAIN_QA_PROMPT } from "../prompts";

export async function handleQuestionNode(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const client = getDashscope();
  const step = state.inspectionSteps[state.currentStepIndex];

  const prompt = DOMAIN_QA_PROMPT
    .replace("{question}", state.userText)
    .replace("{currentStep}", String(state.currentStepIndex + 1))
    .replace("{currentTarget}", step ? `${step.location}的${step.target}` : "检查流程");

  const completion = await client.chat.completions.create({
    model: models.chat_medium,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...state.messages.slice(-4),
      { role: "user", content: prompt },
    ],
  });

  const aiText =
    completion.choices[0]?.message?.content ?? "这个问题我不太确定，我们继续检查吧。";

  // 恢复到提问前的阶段
  const returnPhase = state.previousPhase ?? state.phase;

  return {
    phase: returnPhase,
    aiText,
    isHandlingQuestion: false,
    previousPhase: null,
    messages: [
      { role: "user", content: state.userText },
      { role: "assistant", content: aiText },
    ],
  };
}
