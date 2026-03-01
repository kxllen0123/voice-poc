import { getDashscope } from "@/lib/dashscope";
import { models } from "@/lib/models";
import type { AgentStateType } from "../state";
import { IDENTIFY_ITEMS_PROMPT } from "../prompts";
import type { IdentifiedItem } from "@/lib/types";

/** 每种 target 必须识别的物品列表 */
const REQUIRED_ITEMS: Record<string, string[]> = {
  "床": ["被子", "枕头", "床单", "床垫"],
  "沙发": ["沙发"],
};

export async function identifyItemsNode(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const client = getDashscope();
  const step = state.inspectionSteps[state.currentStepIndex];

  if (!step || !state.userPhoto) {
    return { phase: "waiting_photo" };
  }

  const requiredNames = REQUIRED_ITEMS[step.target] ?? [step.target];

  const prompt = IDENTIFY_ITEMS_PROMPT
    .replace("{target}", step.target)
    .replace("{location}", step.location)
    .replace("{requiredItems}", requiredNames.join("、"));

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

  const raw = completion.choices[0]?.message?.content ?? "[]";
  let items: IdentifiedItem[];
  try {
    const parsed = JSON.parse(raw);
    items = Array.isArray(parsed) ? parsed : [];
  } catch {
    items = [];
  }

  // Force confirmed: false on ALL items
  items = items.map((item) => ({ ...item, confirmed: false }));

  // Filter: only keep required items (fuzzy match by name)
  items = items.filter((item) =>
    requiredNames.some((req) => item.name.includes(req) || req.includes(item.name))
  );

  // Ensure ALL required items are present — fill missing ones
  for (const reqName of requiredNames) {
    const found = items.some(
      (item) => item.name.includes(reqName) || reqName.includes(item.name)
    );
    if (!found) {
      items.push({
        name: reqName,
        material: "需确认",
        condition: "未能清晰辨认",
        confirmed: false,
      });
    }
  }

  return {
    phase: "confirming_materials",
    currentStepData: {
      stepId: step.id,
      photoBase64: state.userPhoto,
      items,
      cleaningFrequency: {},
      notes: "",
    },
  };
}
