import { getDashscope } from "@/lib/dashscope";
import { models } from "@/lib/models";
import type { AgentStateType } from "../state";
import {
  SYSTEM_PROMPT,
  GREETING_PROMPT,
  PARSE_LAYOUT_PROMPT,
} from "../prompts";
import type { HouseLayout } from "@/lib/types";

export async function greetingNode(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const client = getDashscope();

  // 首次进入：发送问候
  if (state.phase === "greeting" && state.messages.length === 0) {
    const completion = await client.chat.completions.create({
      model: models.chat_fast,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: GREETING_PROMPT },
      ],
    });

    const aiText = completion.choices[0]?.message?.content ?? "您好！请告诉我您家的房屋结构。";

    return {
      phase: "asking_layout",
      aiText,
      messages: [{ role: "assistant", content: aiText }],
    };
  }

  // 用户回答了房屋结构：解析
  if (state.phase === "asking_layout" && state.userText) {
    const parseCompletion = await client.chat.completions.create({
      model: models.chat_medium,
      messages: [
        { role: "system", content: PARSE_LAYOUT_PROMPT },
        { role: "user", content: state.userText },
      ],
      response_format: { type: "json_object" },
    });

    const raw = parseCompletion.choices[0]?.message?.content ?? "{}";
    let layout: HouseLayout;
    try {
      layout = JSON.parse(raw) as HouseLayout;
    } catch {
      layout = {
        bedrooms: 2,
        livingRooms: 1,
        hasChildRoom: false,
        hasSofa: true,
        otherNotes: "",
      };
    }

    return {
      phase: "generating_steps",
      houseLayout: layout,
      messages: [{ role: "user", content: state.userText }],
    };
  }

  return {};
}
