import { getDashscope } from "@/lib/dashscope";
import { models } from "@/lib/models";
import type { AgentStateType } from "../state";
import { SYSTEM_PROMPT, GENERATE_REPORT_PROMPT } from "../prompts";
import type { RiskReport } from "@/lib/types";

export async function generateReportNode(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const client = getDashscope();

  const dataForReport = state.collectedData.map((d) => ({
    stepId: d.stepId,
    items: d.items.map((i) => ({
      name: i.name,
      material: i.material,
    })),
    cleaningFrequency: d.cleaningFrequency,
  }));

  const prompt = GENERATE_REPORT_PROMPT.replace(
    "{collectedData}",
    JSON.stringify(dataForReport, null, 2)
  );

  const completion = await client.chat.completions.create({
    model: models.chat_strong,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let report: RiskReport;
  try {
    report = JSON.parse(raw) as RiskReport;
    report.generatedAt = new Date().toISOString();
  } catch {
    report = {
      overallRisk: "medium",
      summary: "报告生成异常，请重试。",
      items: [],
      generatedAt: new Date().toISOString(),
    };
  }

  // 生成口语化总结
  const correctCount = report.items.filter((i) => i.isCorrect).length;
  const totalCount = report.items.length;
  const aiText = `报告已生成！您家的尘螨风险等级为${
    report.overallRisk === "high"
      ? "高"
      : report.overallRisk === "medium"
        ? "中等"
        : "低"
  }。在${totalCount}项检查中，有${correctCount}项做法是正确的。${report.summary}`;

  return {
    phase: "completed",
    aiText,
    report,
    messages: [{ role: "assistant", content: aiText }],
  };
}
