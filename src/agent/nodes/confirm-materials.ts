import { getDashscope } from "@/lib/dashscope";
import { models } from "@/lib/models";
import type { AgentStateType } from "../state";
import {
  SYSTEM_PROMPT,
  CONFIRM_MATERIALS_PROMPT,
  ASK_FREQUENCY_PROMPT,
} from "../prompts";

export async function confirmMaterialsNode(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const client = getDashscope();
  const stepData = state.currentStepData;

  if (!stepData) {
    return { phase: "waiting_photo" };
  }

  // 阶段1：确认材质 — 首次进入（无 userText），展示识别结果让用户确认
  // 注意：不再检查 hasUnconfirmed，因为 LLM 可能返回 confirmed:true 导致跳过
  if (state.phase === "confirming_materials" && !state.userText) {
    // 首次进入：告诉用户识别结果
    const itemsDesc = stepData.items
      .map((item) => `${item.name}（材质：${item.material}，状况：${item.condition}）`)
      .join("；");

    const prompt = CONFIRM_MATERIALS_PROMPT.replace("{items}", itemsDesc);

    const completion = await client.chat.completions.create({
      model: models.chat_fast,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...state.messages.slice(-4),
        { role: "user", content: prompt },
      ],
    });

    const aiText = completion.choices[0]?.message?.content ?? `我识别到了：${itemsDesc}。请确认是否正确。`;

    return {
      aiText,
      messages: [{ role: "assistant", content: aiText }],
    };
  }

  // 用户确认/纠正材质后，解析纠正内容并进入询问清洗频率
  if (state.phase === "confirming_materials" && state.userText) {
    // 用 LLM 解析用户对材质的确认/纠正
    const itemsJson = JSON.stringify(stepData.items.map((i) => ({ name: i.name, material: i.material })));
    const parseCompletion = await client.chat.completions.create({
      model: models.chat_fast,
      messages: [
        {
          role: "system",
          content: `用户正在确认或纠正AI识别的物品材质。根据用户的回答，更新每个物品的材质。
以JSON数组返回，每项包含 name 和 material。如果用户说"对的"或"没问题"，保持原材质不变。如果用户纠正了某个物品的材质，更新对应的 material。只返回JSON数组。
当前识别结果：${itemsJson}`,
        },
        { role: "user", content: state.userText },
      ],
      response_format: { type: "json_object" },
    });

    let corrections: { name: string; material: string }[] = [];
    try {
      const parsed = JSON.parse(parseCompletion.choices[0]?.message?.content ?? "[]");
      corrections = Array.isArray(parsed) ? parsed : parsed.items ?? parsed.corrections ?? [];
    } catch {
      // 解析失败，保持原材质
    }

    // 合并用户纠正到 items
    const updatedItems = stepData.items.map((item) => {
      const correction = corrections.find(
        (c) => c.name === item.name || item.name.includes(c.name) || c.name.includes(item.name)
      );
      return {
        ...item,
        material: correction?.material ?? item.material,
        confirmed: true,
      };
    });

    // 检查是否还没问清洗频率
    const needFrequency = Object.keys(stepData.cleaningFrequency).length === 0;

    if (needFrequency) {
      const itemNames = updatedItems.map((i) => i.name).join("、");
      const prompt = ASK_FREQUENCY_PROMPT.replace("{items}", itemNames);

      const completion = await client.chat.completions.create({
        model: models.chat_fast,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...state.messages.slice(-4),
          { role: "user", content: state.userText },
          { role: "user", content: prompt },
        ],
      });

      const aiText = completion.choices[0]?.message?.content ?? `请问这些物品多久清洗一次？`;

      return {
        phase: "asking_frequency",
        aiText,
        currentStepData: { ...stepData, items: updatedItems },
        messages: [
          { role: "user", content: state.userText },
          { role: "assistant", content: aiText },
        ],
      };
    }
  }

  // 阶段2：记录清洗频率
  if (state.phase === "asking_frequency" && state.userText) {
    // 用 LLM 解析清洗频率
    const completion = await client.chat.completions.create({
      model: models.chat_fast,
      messages: [
        {
          role: "system",
          content: `根据用户的回答，提取每个物品的清洗频率。以JSON对象返回，key是物品名，value是频率描述。只返回JSON。
物品列表：${stepData.items.map((i) => i.name).join("、")}`,
        },
        { role: "user", content: state.userText },
      ],
      response_format: { type: "json_object" },
    });

    let frequency: Record<string, string> = {};
    try {
      frequency = JSON.parse(
        completion.choices[0]?.message?.content ?? "{}"
      );
    } catch {
      // 使用默认值
      for (const item of stepData.items) {
        frequency[item.name] = state.userText;
      }
    }

    const completedStepData = {
      ...stepData,
      cleaningFrequency: frequency,
    };

    const step = state.inspectionSteps[state.currentStepIndex];
    const isLast = state.currentStepIndex >= state.inspectionSteps.length - 1;

    const aiText = isLast
      ? "好的，所有检查点都已完成！让我来为您生成尘螨风险评估报告。"
      : `好的，${step?.location ?? "这个地方"}的信息采集完成了。我们去下一个地方看看。`;

    return {
      phase: isLast ? "generating_report" : "guiding",
      aiText,
      currentStepIndex: isLast
        ? state.currentStepIndex
        : state.currentStepIndex + 1,
      currentStepData: null,
      collectedData: [completedStepData],
      messages: [
        { role: "user", content: state.userText },
        { role: "assistant", content: aiText },
      ],
    };
  }

  return {};
}
