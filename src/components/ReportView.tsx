import type { RiskReport, RiskLevel } from "@/lib/types";

interface ReportViewProps {
  report: RiskReport;
}

const RISK_COLORS: Record<RiskLevel, { bg: string; text: string; label: string }> = {
  low: { bg: "bg-green-500/10", text: "text-green-400", label: "低风险" },
  medium: { bg: "bg-yellow-500/10", text: "text-yellow-400", label: "中等风险" },
  high: { bg: "bg-red-500/10", text: "text-red-400", label: "高风险" },
};

export default function ReportView({ report }: ReportViewProps) {
  const overall = RISK_COLORS[report.overallRisk];

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
      {/* 总体风险 */}
      <div className={`rounded-2xl ${overall.bg} p-5 text-center`}>
        <p className="text-[13px] text-white/40">尘螨风险等级</p>
        <p className={`mt-1 text-2xl font-bold ${overall.text}`}>
          {overall.label}
        </p>
        <p className="mt-2 text-[14px] text-white/60">{report.summary}</p>
      </div>

      {/* 详细项目 */}
      <div className="space-y-3">
        {report.items.map((item, i) => {
          const risk = RISK_COLORS[item.riskLevel];
          return (
            <div
              key={i}
              className="rounded-xl bg-white/[0.04] p-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-[14px] text-white/80">
                  {item.location} · {item.item}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] ${risk.bg} ${risk.text}`}
                >
                  {risk.label}
                </span>
              </div>
              <p className="mt-1 text-[13px] text-white/40">
                材质：{item.material}
              </p>
              <div className="mt-2 flex items-center gap-2 text-[13px]">
                <span className={item.isCorrect ? "text-green-400" : "text-red-400"}>
                  {item.isCorrect ? "✓" : "✕"}
                </span>
                <span className="text-white/50">
                  当前：{item.currentFrequency} → 建议：{item.recommendedFrequency}
                </span>
              </div>
              {!item.isCorrect && (
                <p className="mt-1 text-[13px] text-yellow-400/70">
                  💡 {item.advice}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
