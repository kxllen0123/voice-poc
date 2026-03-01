import type { InspectionStep } from "@/lib/types";

interface StepProgressProps {
  steps: InspectionStep[];
  currentIndex: number;
  stepPhotos: Map<string, string>;
  onStepTap: (stepId: string) => void;
}

export default function StepProgress({
  steps,
  currentIndex,
  stepPhotos,
  onStepTap,
}: StepProgressProps) {
  if (steps.length === 0) return null;

  return (
    <div className="flex-none bg-black/80 backdrop-blur-sm border-t border-white/10 px-3 py-3 pb-[env(safe-area-inset-bottom,12px)]">
      <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {steps.map((step, i) => {
          const photo = stepPhotos.get(step.id);
          const isDone = i < currentIndex;
          const isCurrent = i === currentIndex;

          return (
            <button
              key={step.id}
              type="button"
              onClick={() => photo && onStepTap(step.id)}
              className={`flex-none w-[88px] rounded-xl overflow-hidden border-2 transition-all
                ${isCurrent ? "border-blue-500" : isDone ? "border-green-500/50" : "border-white/10"}
                ${photo ? "cursor-pointer active:scale-95" : "cursor-default"}
              `}
            >
              {/* Photo thumbnail or placeholder */}
              <div className="relative h-[64px] bg-white/5 flex items-center justify-center">
                {photo ? (
                  <img
                    src={`data:image/jpeg;base64,${photo}`}
                    className="h-full w-full object-cover"
                    alt={step.location}
                  />
                ) : (
                  <span className={`text-2xl ${isCurrent ? "opacity-100" : "opacity-30"}`}>
                    {isDone ? "✓" : isCurrent ? "📷" : "○"}
                  </span>
                )}
                {isDone && photo && (
                  <div className="absolute inset-0 bg-green-500/10 flex items-center justify-center">
                    <span className="text-green-400 text-lg">✓</span>
                  </div>
                )}
              </div>
              {/* Step name */}
              <div
                className={`px-1 py-1 text-center text-[10px] truncate leading-tight
                  ${isCurrent ? "text-blue-300" : isDone ? "text-green-400" : "text-white/30"}
                `}
              >
                {step.location}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
