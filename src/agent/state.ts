import { Annotation } from "@langchain/langgraph";
import type {
  HouseLayout,
  InspectionStep,
  StepData,
  RiskReport,
  AgentPhase,
} from "@/lib/types";

/** 对话消息 */
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export const AgentState = Annotation.Root({
  /** 对话历史 */
  messages: Annotation<ChatMessage[]>({
    reducer: (prev, next) => prev.concat(next),
    default: () => [],
  }),

  /** 当前阶段 */
  phase: Annotation<AgentPhase>({
    reducer: (_, next) => next,
    default: () => "greeting" as AgentPhase,
  }),

  /** 用户本轮输入的文本 (语音转文字或直接文字) */
  userText: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),

  /** 用户本轮上传的照片 base64 */
  userPhoto: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),

  /** AI 本轮回复的文本 */
  aiText: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),

  /** 房屋结构 */
  houseLayout: Annotation<HouseLayout | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  /** 检查步骤列表 */
  inspectionSteps: Annotation<InspectionStep[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  /** 当前步骤索引 */
  currentStepIndex: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),

  /** 当前步骤采集的数据 */
  currentStepData: Annotation<StepData | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  /** 所有已完成步骤的数据 */
  collectedData: Annotation<StepData[]>({
    reducer: (prev, next) => prev.concat(next),
    default: () => [],
  }),

  /** 照片验证结果 */
  photoValid: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),

  /** 最终报告 */
  report: Annotation<RiskReport | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  /** 是否正在处理用户的域外提问 */
  isHandlingQuestion: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),

  /** 处理提问前的阶段 (用于回归流程) */
  previousPhase: Annotation<AgentPhase | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
});

export type AgentStateType = typeof AgentState.State;
