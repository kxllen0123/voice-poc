import { getDashscope } from "@/lib/dashscope";
import { models } from "@/lib/models";
import type { AgentStateType } from "../state";
import { SYSTEM_PROMPT, GENERATE_STEPS_PROMPT } from "../prompts";
import type { InspectionStep } from "@/lib/types";

export async function generateStepsNode(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const client = getDashscope();
  const layout = state.houseLayout;

  if (!layout) {
    return {
      aiText: "抱歉，我还没有了解到您的房屋结构。请告诉我您家是几室几厅。",
      phase: "asking_layout",
    };
  }

  const prompt = GENERATE_STEPS_PROMPT.replace(
    "{layout}",
    JSON.stringify(layout, null, 2)
  );

  const completion = await client.chat.completions.create({
    model: models.chat_medium,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content ?? "[]";
  let steps: InspectionStep[];
  try {
    const parsed = JSON.parse(raw);
    steps = Array.isArray(parsed) ? parsed : parsed.steps ?? [];
  } catch {
    // 默认步骤
    steps = [
      {
        id: "step_1",
        location: "主卧室",
        target: "床",
        description: "请拍摄主卧室的床，包括被子、枕头、床单和床垫",
      },
    ];
  }

  // 强制过滤：target 只允许 "床" 或 "沙发"，且 hasSofa=false 时不允许沙发步骤
  const VALID_TARGETS = new Set(["床", "沙发"]);
  steps = steps.filter((s) => {
    if (!VALID_TARGETS.has(s.target)) return false;
    if (s.target === "沙发" && !layout.hasSofa) return false;
    return true;
  });

  // 安全网：确保至少有一个卧室步骤
  if (steps.length === 0) {
    steps = [
      {
        id: "step_1",
        location: "主卧室",
        target: "床",
        description: "请拍摄主卧室的床，包括被子、枕头、床单和床垫",
      },
    ];
  }

  // 生成总结话术
  const locationList = steps.map((s) => `${s.location}的${s.target}`).join("、");
  const aiText = `好的，根据您的房屋情况，我们需要检查${steps.length}个地方：${locationList}。我们现在开始吧！`;

  return {
    phase: "guiding",
    inspectionSteps: steps,
    currentStepIndex: 0,
    aiText,
    messages: [{ role: "assistant", content: aiText }],
  };
}
