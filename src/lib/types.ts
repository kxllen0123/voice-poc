/** 房屋结构 */
export interface HouseLayout {
  bedrooms: number;        // 卧室数量
  livingRooms: number;     // 客厅数量
  hasChildRoom: boolean;   // 是否有儿童房
  hasSofa: boolean;        // 是否有沙发
  otherNotes: string;      // 其他备注
}

/** 检查步骤定义 */
export interface InspectionStep {
  id: string;
  location: string;        // 场所名称，如"主卧室"
  target: string;          // 拍摄目标，如"床"
  description: string;     // 详细说明
}

/** 识别到的物品 */
export interface IdentifiedItem {
  name: string;            // 物品名称，如"被子"
  material: string;        // 材质，如"棉"
  condition: string;       // 状况描述
  confirmed: boolean;      // 用户是否已确认
}

/** 步骤采集数据 */
export interface StepData {
  stepId: string;
  photoBase64: string;     // 拍摄的照片
  items: IdentifiedItem[]; // 识别到的物品
  cleaningFrequency: Record<string, string>; // 物品名 -> 清洗频率
  notes: string;           // 备注
}

/** 风险等级 */
export type RiskLevel = "low" | "medium" | "high";

/** 风险报告中的单条建议 */
export interface RiskItem {
  location: string;
  item: string;
  material: string;
  currentFrequency: string;
  recommendedFrequency: string;
  riskLevel: RiskLevel;
  advice: string;
  isCorrect: boolean;      // 用户做法是否正确
}

/** 尘螨风险报告 */
export interface RiskReport {
  overallRisk: RiskLevel;
  summary: string;
  items: RiskItem[];
  generatedAt: string;
}

/** Agent 交互阶段 */
export type AgentPhase =
  | "greeting"              // 问候
  | "asking_layout"         // 询问房屋结构
  | "generating_steps"      // 生成检查步骤
  | "guiding"               // 指导前往场所
  | "waiting_photo"         // 等待拍照
  | "validating_photo"      // 验证照片
  | "identifying_items"     // 识别物品
  | "confirming_materials"  // 确认材质
  | "asking_frequency"      // 询问清洗频率
  | "answering_question"    // 回答用户提问
  | "generating_report"     // 生成报告
  | "completed";            // 已完成

/** 前端发送给后端的消息类型 */
export type UserInputType = "voice" | "photo" | "text";

export interface UserInput {
  type: UserInputType;
  audioBase64?: string;     // voice 类型时
  photoBase64?: string;     // photo 类型时
  text?: string;            // text 类型时 (备用)
}

/** 后端返回给前端的响应 */
export interface AgentResponse {
  sessionId: string;
  phase: AgentPhase;
  aiText: string;           // AI 的文字回复
  audioBase64?: string;     // AI 的语音回复
  userText?: string;        // 用户语音转的文字
  steps?: InspectionStep[]; // 检查步骤列表 (generating_steps 阶段)
  currentStepIndex?: number;
  photoValidation?: {
    valid: boolean;
    reason: string;
  };
  identifiedItems?: IdentifiedItem[];
  report?: RiskReport;      // 最终报告
  expectInput: UserInputType[]; // 前端应该展示哪些输入方式
  collectedData?: StepData[]; // 已采集的步骤数据
}
