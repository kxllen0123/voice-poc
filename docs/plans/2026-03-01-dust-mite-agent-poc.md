# 尘螨防控AI助手 POC 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在现有语音 spike 基础上，构建完整的尘螨风险点信息采集 AI Agent POC

**Architecture:** 使用 LangGraph TS StateGraph 编排多步骤检查流程。前端通过 HTTP API 与后端 LangGraph Agent 交互，支持语音对话、拍照上传、Vision 识别三种交互模式。Agent 状态持久化在内存中（POC 阶段），支持流程中断和恢复。

**Tech Stack:** Next.js 16 + LangGraph TS (@langchain/langgraph) + DashScope API (Qwen-max, Qwen-VL, CosyVoice, Qwen-audio-turbo) + OpenAI SDK

---

## 现有代码盘点

```
voice-spike/
├── src/
│   ├── lib/dashscope.ts              # DashScope OpenAI 兼容客户端 (保留)
│   ├── app/
│   │   ├── page.tsx                  # 入口页 (将重写)
│   │   ├── layout.tsx                # 布局 (保留)
│   │   ├── globals.css               # 样式 (保留)
│   │   └── api/voice/route.ts        # 语音API (将重构为 agent API)
│   └── components/
│       └── VoiceChat.tsx             # 语音组件 (将大幅扩展)
├── .env.example                      # 环境变量模板
└── package.json                      # 依赖
```

## 目标文件结构

```
voice-spike/
├── src/
│   ├── lib/
│   │   ├── dashscope.ts              # [保留] DashScope 客户端
│   │   └── types.ts                  # [新建] 共享类型定义
│   ├── agent/
│   │   ├── state.ts                  # [新建] LangGraph Agent 状态定义
│   │   ├── graph.ts                  # [新建] LangGraph StateGraph 定义
│   │   ├── nodes/
│   │   │   ├── greeting.ts           # [新建] 问候 + 询问房屋结构
│   │   │   ├── generate-steps.ts     # [新建] 根据房屋结构生成检查步骤
│   │   │   ├── guide.ts              # [新建] 语音指导用户前往场所
│   │   │   ├── validate-photo.ts     # [新建] Vision 验证照片是否合格
│   │   │   ├── identify-items.ts     # [新建] Vision 识别物品详情
│   │   │   ├── confirm-materials.ts  # [新建] 确认材质 + 清洗频率
│   │   │   ├── generate-report.ts    # [新建] 生成尘螨风险报告
│   │   │   └── handle-question.ts    # [新建] 尘螨领域问答
│   │   ├── prompts.ts               # [新建] 所有 LLM prompt 模板
│   │   └── session.ts               # [新建] 内存 session 管理
│   ├── app/
│   │   ├── page.tsx                  # [重写] 入口页
│   │   ├── api/
│   │   │   ├── agent/
│   │   │   │   └── route.ts          # [新建] Agent 交互 API (替代 voice/route.ts)
│   │   │   ├── voice/
│   │   │   │   └── route.ts          # [保留+修改] 纯语音处理 (STT/TTS)
│   │   │   └── photo/
│   │   │       └── route.ts          # [新建] 照片上传 + Vision 分析
│   ├── components/
│   │   ├── AgentChat.tsx             # [新建] 主交互组件 (替代 VoiceChat)
│   │   ├── VoiceButton.tsx           # [新建] 录音按钮 (从 VoiceChat 提取)
│   │   ├── CameraCapture.tsx         # [新建] 摄像头拍照组件
│   │   ├── StepProgress.tsx          # [新建] 流程步骤进度条
│   │   ├── ChatBubble.tsx            # [新建] 聊天气泡
│   │   └── ReportView.tsx            # [新建] 风险报告展示
│   └── hooks/
│       ├── useVoice.ts               # [新建] 语音录制/播放 hook
│       └── useCamera.ts             # [新建] 摄像头 hook
```

---

## Task 1: 安装依赖 + 创建共享类型

**Files:**
- Modify: `package.json`
- Create: `src/lib/types.ts`

**Step 1: 安装 LangGraph TS 及相关依赖**

```bash
bun add @langchain/langgraph @langchain/core @langchain/openai uuid
bun add -d @types/uuid
```

**Step 2: 创建共享类型定义**

Create `src/lib/types.ts`:

```typescript
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
}
```

**Step 3: 验证编译**

```bash
bunx tsc --noEmit
```

Expected: 无错误。

---

## Task 2: LangGraph Agent 状态 + Graph 骨架

**Files:**
- Create: `src/agent/state.ts`
- Create: `src/agent/prompts.ts`
- Create: `src/agent/session.ts`
- Create: `src/agent/graph.ts`

**Step 1: 定义 Agent State**

Create `src/agent/state.ts`:

```typescript
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
```

**Step 2: 创建 Prompt 模板**

Create `src/agent/prompts.ts`:

```typescript
export const SYSTEM_PROMPT = `你是一个专业的尘螨防控AI助手。你正在语音指导用户完成家庭尘螨风险点的信息采集。

规则：
1. 使用简洁的口语化中文
2. 每次回复控制在2-3句话
3. 语气亲切专业，像一个耐心的家庭健康顾问
4. 只回答与尘螨防控相关的问题，其他问题礼貌拒绝
5. 回答完用户的问题后，主动引导回到当前流程步骤`;

export const GREETING_PROMPT = `请用温和的语气问候用户，然后询问他们家的房屋结构。
需要了解：
1. 几室几厅
2. 是否有儿童房
3. 是否有沙发
简洁自然地一次性问出来。`;

export const PARSE_LAYOUT_PROMPT = `根据用户的回答，提取房屋结构信息。以JSON格式返回：
{
  "bedrooms": number,
  "livingRooms": number, 
  "hasChildRoom": boolean,
  "hasSofa": boolean,
  "otherNotes": "string"
}

如果用户的回答不完整或含糊，返回你能确定的部分，不确定的用合理默认值。
只返回JSON，不要其他文字。`;

export const GENERATE_STEPS_PROMPT = `根据以下房屋结构，生成尘螨风险点检查步骤列表。

房屋结构：{layout}

每个步骤包含：场所(location)、拍摄目标(target)、说明(description)

重点检查：
- 每个卧室的床（被子、枕头、床垫）
- 儿童房要特别关注毛绒玩具
- 客厅沙发
- 地毯（如果有）

以JSON数组格式返回：
[{{"id": "step_1", "location": "主卧室", "target": "床", "description": "请拍摄主卧室的床，包括被子和枕头"}}]

按检查顺序排列。只返回JSON数组。`;

export const GUIDE_PROMPT = `请语音指导用户前往下一个检查场所进行拍照。

当前步骤：第 {currentStep} 步，共 {totalSteps} 步
场所：{location}
拍摄目标：{target}
说明：{description}

用亲切的语气告诉用户要去哪里、拍什么。提醒他们准备好后按拍照按钮。`;

export const VALIDATE_PHOTO_PROMPT = `分析这张照片，判断是否满足拍摄要求。

要求拍摄的目标：{target}（位于{location}）

请判断：
1. 照片中是否包含目标物品？
2. 照片是否清晰？
3. 拍摄角度是否能看到物品的材质和细节？

以JSON格式返回：
{{"valid": boolean, "reason": "string"}}

如果不合格，reason 中说明原因和改进建议。只返回JSON。`;

export const IDENTIFY_ITEMS_PROMPT = `仔细分析这张照片中的{target}，识别所有相关物品及其材质。

场所：{location}

请识别：
- 物品名称（如：被子、枕头、床垫、沙发垫等）
- 材质类型（如：纯棉、涤纶、丝绸、皮革、记忆棉等）
- 物品状况

以JSON数组格式返回：
[{{"name": "被子", "material": "纯棉", "condition": "使用良好", "confirmed": false}}]

只返回JSON数组。`;

export const CONFIRM_MATERIALS_PROMPT = `AI识别出以下物品和材质，请口语化地告诉用户识别结果，并请用户确认是否正确：

{items}

如果有多个物品，逐个说明。让用户告诉你哪些对、哪些需要纠正。`;

export const ASK_FREQUENCY_PROMPT = `现在需要询问用户以下物品的清洗频率：

{items}

逐个询问每个物品多久清洗一次（每周/每两周/每月/每季度等）。语气自然口语化。`;

export const GENERATE_REPORT_PROMPT = `根据以下采集到的全部数据，生成尘螨风险评估报告。

采集数据：
{collectedData}

对每个物品评估：
1. 材质是否容易滋生尘螨（纯棉>涤纶>丝绸 风险递减）
2. 清洗频率是否足够
3. 给出改进建议

清洗频率建议标准：
- 被子/床单：建议每周清洗
- 枕头/枕套：建议每周清洗
- 沙发套：建议每两周清洗
- 地毯：建议每周吸尘，每月深度清洁
- 毛绒玩具：建议每两周清洗

以JSON格式返回：
{{
  "overallRisk": "low" | "medium" | "high",
  "summary": "总结，2-3句话",
  "items": [
    {{
      "location": "场所",
      "item": "物品名",
      "material": "材质",
      "currentFrequency": "用户当前频率",
      "recommendedFrequency": "建议频率", 
      "riskLevel": "low" | "medium" | "high",
      "advice": "具体建议",
      "isCorrect": boolean
    }}
  ]
}}

只返回JSON。`;

export const DOMAIN_QA_PROMPT = `用户在尘螨检查过程中提出了一个问题。

问题：{question}

规则：
1. 如果是尘螨防控相关的问题，简洁地回答（2-3句话）
2. 如果不是尘螨相关的问题，礼貌地说"这个问题不在我的专业范围内，我们继续检查吧"
3. 回答后，提醒用户继续当前的检查流程

当前流程：第 {currentStep} 步 - {currentTarget}`;

export const DETECT_QUESTION_PROMPT = `判断用户的这句话是在回答检查流程中的问题，还是在主动提问。

用户说："{userText}"
当前阶段：{phase}

如果用户在主动提问（比如"尘螨是什么"、"为什么要每周洗"等），返回：{{"isQuestion": true}}
如果用户在正常回答流程问题，返回：{{"isQuestion": false}}

只返回JSON。`;
```

**Step 3: 创建 Session 管理**

Create `src/agent/session.ts`:

```typescript
import type { AgentStateType } from "./state";

/**
 * 简单的内存 session 管理 (POC 阶段)
 * 生产环境应使用 Redis 或数据库
 */
const sessions = new Map<string, AgentStateType>();

export function getSession(sessionId: string): AgentStateType | undefined {
  return sessions.get(sessionId);
}

export function setSession(sessionId: string, state: AgentStateType): void {
  sessions.set(sessionId, state);
}

export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export function createSessionId(): string {
  return `ses_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
```

**Step 4: 创建 Graph 骨架**

Create `src/agent/graph.ts`:

```typescript
import { StateGraph, END } from "@langchain/langgraph";
import { AgentState, type AgentStateType } from "./state";
import { greetingNode } from "./nodes/greeting";
import { generateStepsNode } from "./nodes/generate-steps";
import { guideNode } from "./nodes/guide";
import { validatePhotoNode } from "./nodes/validate-photo";
import { identifyItemsNode } from "./nodes/identify-items";
import { confirmMaterialsNode } from "./nodes/confirm-materials";
import { generateReportNode } from "./nodes/generate-report";
import { handleQuestionNode } from "./nodes/handle-question";

/** 路由函数：根据阶段决定下一个节点 */
function routeByPhase(state: AgentStateType): string {
  // 如果用户在提问，先处理问题
  if (state.isHandlingQuestion) {
    return "handle_question";
  }

  switch (state.phase) {
    case "greeting":
    case "asking_layout":
      return "greeting";
    case "generating_steps":
      return "generate_steps";
    case "guiding":
    case "waiting_photo":
      return "guide";
    case "validating_photo":
      return "validate_photo";
    case "identifying_items":
      return "identify_items";
    case "confirming_materials":
    case "asking_frequency":
      return "confirm_materials";
    case "generating_report":
      return "generate_report";
    case "completed":
      return END;
    default:
      return "greeting";
  }
}

/** 照片验证后的路由 */
function routeAfterValidation(state: AgentStateType): string {
  if (state.photoValid) {
    return "identify_items";
  }
  return "guide"; // 重新指导拍照
}

/** 确认材质后的路由 */
function routeAfterConfirm(state: AgentStateType): string {
  const { currentStepIndex, inspectionSteps } = state;
  if (currentStepIndex >= inspectionSteps.length - 1) {
    return "generate_report"; // 所有步骤完成
  }
  return "guide"; // 下一个步骤
}

/** 问题回答后回到流程 */
function routeAfterQuestion(state: AgentStateType): string {
  return routeByPhase({ ...state, isHandlingQuestion: false });
}

export function createAgentGraph() {
  const graph = new StateGraph(AgentState)
    // 添加节点
    .addNode("greeting", greetingNode)
    .addNode("generate_steps", generateStepsNode)
    .addNode("guide", guideNode)
    .addNode("validate_photo", validatePhotoNode)
    .addNode("identify_items", identifyItemsNode)
    .addNode("confirm_materials", confirmMaterialsNode)
    .addNode("generate_report", generateReportNode)
    .addNode("handle_question", handleQuestionNode)

    // 入口：根据当前阶段路由
    .addConditionalEdges("__start__", routeByPhase)

    // greeting → generate_steps
    .addEdge("greeting", "generate_steps")

    // generate_steps → guide
    .addEdge("generate_steps", "guide")

    // guide → END (等待用户输入，由下次调用继续)
    .addEdge("guide", END)

    // validate_photo → identify_items 或 guide(重拍)
    .addConditionalEdges("validate_photo", routeAfterValidation)

    // identify_items → confirm_materials
    .addEdge("identify_items", "confirm_materials")

    // confirm_materials → guide(下一步) 或 generate_report
    .addConditionalEdges("confirm_materials", routeAfterConfirm)

    // generate_report → END
    .addEdge("generate_report", END)

    // handle_question → END (回答后等待用户继续)
    .addEdge("handle_question", END);

  return graph.compile();
}
```

**Step 5: 验证编译**

```bash
bunx tsc --noEmit
```

Expected: 会报错因为节点文件还不存在——这是预期的，Task 3 创建它们。

---

## Task 3: 实现 Agent 节点 (Part 1 - 对话流程)

**Files:**
- Create: `src/agent/nodes/greeting.ts`
- Create: `src/agent/nodes/generate-steps.ts`  
- Create: `src/agent/nodes/guide.ts`
- Create: `src/agent/nodes/handle-question.ts`

**Step 1: greeting 节点**

Create `src/agent/nodes/greeting.ts`:

```typescript
import { getDashscope } from "@/lib/dashscope";
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
      model: "qwen-max",
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
      model: "qwen-max",
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
```

**Step 2: generate-steps 节点**

Create `src/agent/nodes/generate-steps.ts`:

```typescript
import { getDashscope } from "@/lib/dashscope";
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
    model: "qwen-max",
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
        description: "请拍摄主卧室的床，包括被子和枕头",
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
```

**Step 3: guide 节点**

Create `src/agent/nodes/guide.ts`:

```typescript
import { getDashscope } from "@/lib/dashscope";
import type { AgentStateType } from "../state";
import { SYSTEM_PROMPT, GUIDE_PROMPT } from "../prompts";

export async function guideNode(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const client = getDashscope();
  const step = state.inspectionSteps[state.currentStepIndex];

  if (!step) {
    return {
      phase: "generating_report",
      aiText: "所有检查点都已完成，我来为您生成报告。",
    };
  }

  const prompt = GUIDE_PROMPT
    .replace("{currentStep}", String(state.currentStepIndex + 1))
    .replace("{totalSteps}", String(state.inspectionSteps.length))
    .replace("{location}", step.location)
    .replace("{target}", step.target)
    .replace("{description}", step.description);

  const completion = await client.chat.completions.create({
    model: "qwen-max",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...state.messages.slice(-6), // 保留最近上下文
      { role: "user", content: prompt },
    ],
  });

  const aiText =
    completion.choices[0]?.message?.content ??
    `请前往${step.location}，拍摄${step.target}。`;

  return {
    phase: "waiting_photo",
    aiText,
    messages: [{ role: "assistant", content: aiText }],
  };
}
```

**Step 4: handle-question 节点**

Create `src/agent/nodes/handle-question.ts`:

```typescript
import { getDashscope } from "@/lib/dashscope";
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
    model: "qwen-max",
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
```

**Step 5: 验证编译**

```bash
bunx tsc --noEmit
```

---

## Task 4: 实现 Agent 节点 (Part 2 - 视觉分析 + 报告)

**Files:**
- Create: `src/agent/nodes/validate-photo.ts`
- Create: `src/agent/nodes/identify-items.ts`
- Create: `src/agent/nodes/confirm-materials.ts`
- Create: `src/agent/nodes/generate-report.ts`

**Step 1: validate-photo 节点**

Create `src/agent/nodes/validate-photo.ts`:

```typescript
import { getDashscope } from "@/lib/dashscope";
import type { AgentStateType } from "../state";
import { VALIDATE_PHOTO_PROMPT } from "../prompts";

export async function validatePhotoNode(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const client = getDashscope();
  const step = state.inspectionSteps[state.currentStepIndex];

  if (!step || !state.userPhoto) {
    return {
      phase: "waiting_photo",
      photoValid: false,
      aiText: "我还没有收到照片，请拍一张照片给我看看。",
    };
  }

  const prompt = VALIDATE_PHOTO_PROMPT
    .replace("{target}", step.target)
    .replace("{location}", step.location);

  const completion = await client.chat.completions.create({
    model: "qwen-vl-max",
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

  const raw = completion.choices[0]?.message?.content ?? '{"valid": false, "reason": "无法分析"}';
  let result: { valid: boolean; reason: string };
  try {
    result = JSON.parse(raw);
  } catch {
    result = { valid: true, reason: "分析完成" }; // 容错：解析失败时默认通过
  }

  if (result.valid) {
    return {
      phase: "identifying_items",
      photoValid: true,
      aiText: "照片拍得很好！让我来仔细分析一下。",
      messages: [{ role: "assistant", content: "照片验证通过" }],
    };
  }

  return {
    phase: "waiting_photo",
    photoValid: false,
    aiText: `这张照片不太符合要求：${result.reason}。请重新拍一张。`,
    messages: [
      { role: "assistant", content: `照片不合格：${result.reason}` },
    ],
  };
}
```

**Step 2: identify-items 节点**

Create `src/agent/nodes/identify-items.ts`:

```typescript
import { getDashscope } from "@/lib/dashscope";
import type { AgentStateType } from "../state";
import { IDENTIFY_ITEMS_PROMPT } from "../prompts";
import type { IdentifiedItem } from "@/lib/types";

export async function identifyItemsNode(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const client = getDashscope();
  const step = state.inspectionSteps[state.currentStepIndex];

  if (!step || !state.userPhoto) {
    return { phase: "waiting_photo" };
  }

  const prompt = IDENTIFY_ITEMS_PROMPT
    .replace("{target}", step.target)
    .replace("{location}", step.location);

  const completion = await client.chat.completions.create({
    model: "qwen-vl-max",
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
    items = [
      {
        name: step.target,
        material: "未识别",
        condition: "需用户确认",
        confirmed: false,
      },
    ];
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
```

**Step 3: confirm-materials 节点**

Create `src/agent/nodes/confirm-materials.ts`:

```typescript
import { getDashscope } from "@/lib/dashscope";
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

  // 阶段1：确认材质 — 尚未所有 item 都 confirmed
  const hasUnconfirmed = stepData.items.some((item) => !item.confirmed);

  if (state.phase === "confirming_materials" && hasUnconfirmed && !state.userText) {
    // 首次进入：告诉用户识别结果
    const itemsDesc = stepData.items
      .map((item) => `${item.name}（材质：${item.material}，状况：${item.condition}）`)
      .join("；");

    const prompt = CONFIRM_MATERIALS_PROMPT.replace("{items}", itemsDesc);

    const completion = await client.chat.completions.create({
      model: "qwen-max",
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

  // 用户确认后（简化处理：标记全部 confirmed），进入询问清洗频率
  if (state.phase === "confirming_materials" && state.userText) {
    const updatedItems = stepData.items.map((item) => ({
      ...item,
      confirmed: true,
    }));

    // 检查是否还没问清洗频率
    const needFrequency = Object.keys(stepData.cleaningFrequency).length === 0;

    if (needFrequency) {
      const itemNames = updatedItems.map((i) => i.name).join("、");
      const prompt = ASK_FREQUENCY_PROMPT.replace("{items}", itemNames);

      const completion = await client.chat.completions.create({
        model: "qwen-max",
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
      model: "qwen-max",
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
```

**Step 4: generate-report 节点**

Create `src/agent/nodes/generate-report.ts`:

```typescript
import { getDashscope } from "@/lib/dashscope";
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
    model: "qwen-max",
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
```

**Step 5: 验证编译**

```bash
bunx tsc --noEmit
```

---

## Task 5: Agent HTTP API

**Files:**
- Create: `src/app/api/agent/route.ts`
- Modify: `src/app/api/voice/route.ts` (简化为纯 STT/TTS 工具)

**Step 1: 创建 Agent API 路由**

Create `src/app/api/agent/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getDashscope } from "@/lib/dashscope";
import { toFile } from "openai";
import { createAgentGraph } from "@/agent/graph";
import {
  getSession,
  setSession,
  createSessionId,
} from "@/agent/session";
import type { AgentStateType } from "@/agent/state";
import type { AgentResponse, UserInputType } from "@/lib/types";
import {
  DETECT_QUESTION_PROMPT,
} from "@/agent/prompts";

const graph = createAgentGraph();

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const sessionId = (formData.get("sessionId") as string) || createSessionId();
    const inputType = (formData.get("inputType") as UserInputType) || "voice";

    // 获取或创建 session 状态
    let state = getSession(sessionId);
    const isNew = !state;

    // 处理用户输入
    let userText = "";
    let userPhoto = "";

    if (inputType === "voice") {
      const audioBlob = formData.get("audio");
      if (audioBlob && audioBlob instanceof Blob) {
        const audioFile = await toFile(audioBlob, "recording.webm", {
          type: audioBlob.type || "audio/webm",
        });
        const transcription =
          await getDashscope().audio.transcriptions.create({
            model: "qwen-audio-turbo",
            file: audioFile,
          });
        userText = transcription.text ?? "";
      }
    } else if (inputType === "photo") {
      const photoBlob = formData.get("photo");
      if (photoBlob && photoBlob instanceof Blob) {
        const buffer = Buffer.from(await photoBlob.arrayBuffer());
        userPhoto = buffer.toString("base64");
      }
    } else if (inputType === "text") {
      userText = (formData.get("text") as string) || "";
    }

    // 构建输入状态
    const inputState: Partial<AgentStateType> = {
      userText,
      userPhoto,
    };

    // 如果不是新 session 且用户有文本输入，检测是否在提问
    if (state && userText && state.phase !== "greeting" && state.phase !== "asking_layout") {
      const isQuestion = await detectQuestion(userText, state.phase);
      if (isQuestion) {
        inputState.isHandlingQuestion = true;
        inputState.previousPhase = state.phase;
      }
    }

    // 如果用户上传了照片，切到验证阶段
    if (userPhoto && state?.phase === "waiting_photo") {
      inputState.phase = "validating_photo";
    }

    // 合并状态
    if (state) {
      state = { ...state, ...inputState };
    } else {
      // 新会话，使用默认初始状态
      state = {
        messages: [],
        phase: "greeting",
        userText: "",
        userPhoto: "",
        aiText: "",
        houseLayout: null,
        inspectionSteps: [],
        currentStepIndex: 0,
        currentStepData: null,
        collectedData: [],
        photoValid: false,
        report: null,
        isHandlingQuestion: false,
        previousPhase: null,
        ...inputState,
      };
    }

    // 运行 graph
    const result = await graph.invoke(state);

    // 保存状态
    setSession(sessionId, result);

    // 生成 TTS 音频
    let audioBase64: string | undefined;
    if (result.aiText) {
      try {
        const mp3Response = await getDashscope().audio.speech.create({
          model: "cosyvoice-v2",
          voice: "longxiaochun",
          input: result.aiText,
          response_format: "mp3",
        });
        const audioBuffer = Buffer.from(await mp3Response.arrayBuffer());
        audioBase64 = audioBuffer.toString("base64");
      } catch (err) {
        console.error("TTS error:", err);
        // TTS 失败不阻断流程
      }
    }

    // 决定前端应该展示哪些输入方式
    const expectInput: UserInputType[] = [];
    switch (result.phase) {
      case "asking_layout":
      case "confirming_materials":
      case "asking_frequency":
        expectInput.push("voice");
        break;
      case "waiting_photo":
        expectInput.push("photo");
        expectInput.push("voice"); // 用户也可以语音提问
        break;
      case "completed":
        break;
      default:
        expectInput.push("voice");
    }

    const response: AgentResponse = {
      sessionId,
      phase: result.phase,
      aiText: result.aiText,
      audioBase64,
      userText: userText || undefined,
      steps: result.inspectionSteps.length > 0 ? result.inspectionSteps : undefined,
      currentStepIndex: result.currentStepIndex,
      photoValidation: result.phase === "waiting_photo" && !result.photoValid && result.userPhoto
        ? { valid: false, reason: result.aiText }
        : undefined,
      identifiedItems: result.currentStepData?.items,
      report: result.report ?? undefined,
      expectInput,
    };

    return NextResponse.json(response);
  } catch (err: unknown) {
    console.error("Agent API error:", err);
    const message = err instanceof Error ? err.message : "服务器内部错误";
    return NextResponse.json(
      { error: `Agent 处理出错：${message}` },
      { status: 500 }
    );
  }
}

async function detectQuestion(userText: string, phase: string): Promise<boolean> {
  try {
    const prompt = DETECT_QUESTION_PROMPT
      .replace("{userText}", userText)
      .replace("{phase}", phase);

    const completion = await getDashscope().chat.completions.create({
      model: "qwen-max",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? '{"isQuestion": false}';
    const result = JSON.parse(raw);
    return result.isQuestion === true;
  } catch {
    return false;
  }
}
```

**Step 2: 验证编译**

```bash
bunx tsc --noEmit
```

---

## Task 6: 前端 Hooks (语音 + 摄像头)

**Files:**
- Create: `src/hooks/useVoice.ts`
- Create: `src/hooks/useCamera.ts`

**Step 1: useVoice hook**

Create `src/hooks/useVoice.ts`:

```typescript
"use client";

import { useState, useRef, useCallback } from "react";

function detectMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const mime of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return "audio/webm";
}

export type VoiceStatus = "idle" | "recording" | "processing" | "playing";

interface UseVoiceOptions {
  onAudioCaptured: (blob: Blob) => void;
}

export function useVoice({ onAudioCaptured }: UseVoiceOptions) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = detectMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        if (blob.size > 0) {
          onAudioCaptured(blob);
        } else {
          setStatus("idle");
        }
      };

      recorder.start();
      setStatus("recording");
    } catch {
      setStatus("idle");
      throw new Error("无法访问麦克风，请检查权限设置");
    }
  }, [onAudioCaptured]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "recording") {
      recorder.stop();
    }
  }, []);

  const playAudio = useCallback((base64: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      setStatus("playing");
      const audioBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const audioBlob = new Blob([audioBytes], { type: "audio/mp3" });
      const audioUrl = URL.createObjectURL(audioBlob);

      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
        setStatus("idle");
        resolve();
      };

      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
        setStatus("idle");
        reject(new Error("音频播放失败"));
      };

      audio.play().catch(reject);
    });
  }, []);

  const setProcessing = useCallback(() => setStatus("processing"), []);
  const setIdle = useCallback(() => setStatus("idle"), []);

  return {
    status,
    startRecording,
    stopRecording,
    playAudio,
    setProcessing,
    setIdle,
  };
}
```

**Step 2: useCamera hook**

Create `src/hooks/useCamera.ts`:

```typescript
"use client";

import { useState, useRef, useCallback } from "react";

export function useCamera() {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const open = useCallback(async (videoElement: HTMLVideoElement) => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment", // 后置摄像头
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      streamRef.current = stream;
      videoRef.current = videoElement;
      videoElement.srcObject = stream;
      await videoElement.play();
      setIsOpen(true);
    } catch {
      setError("无法访问摄像头，请检查权限设置");
      setIsOpen(false);
    }
  }, []);

  const capture = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video) return null;

    const canvas = document.createElement("canvas");
    canvas.width = Math.min(video.videoWidth, 1920);
    canvas.height = Math.min(video.videoHeight, 1080);

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // 返回 base64 (去掉 data:image/jpeg;base64, 前缀)
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    return dataUrl.split(",")[1] ?? null;
  }, []);

  const close = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current = null;
    }
    setIsOpen(false);
  }, []);

  return {
    isOpen,
    error,
    open,
    capture,
    close,
  };
}
```

**Step 3: 验证编译**

```bash
bunx tsc --noEmit
```

---

## Task 7: 前端 UI 组件

**Files:**
- Create: `src/components/ChatBubble.tsx`
- Create: `src/components/VoiceButton.tsx`
- Create: `src/components/CameraCapture.tsx`
- Create: `src/components/StepProgress.tsx`
- Create: `src/components/ReportView.tsx`

**Step 1: ChatBubble 组件**

Create `src/components/ChatBubble.tsx`:

```tsx
interface ChatBubbleProps {
  role: "user" | "assistant";
  content: string;
}

export default function ChatBubble({ role, content }: ChatBubbleProps) {
  return (
    <div className={`flex ${role === "user" ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${
          role === "user"
            ? "bg-[#2563eb] text-white rounded-br-md"
            : "bg-white/[0.08] text-white/90 rounded-bl-md"
        }`}
      >
        {content}
      </div>
    </div>
  );
}
```

**Step 2: VoiceButton 组件**

Create `src/components/VoiceButton.tsx`:

```tsx
"use client";

import type { VoiceStatus } from "@/hooks/useVoice";

interface VoiceButtonProps {
  status: VoiceStatus;
  disabled: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
}

const STATUS_LABELS: Record<VoiceStatus, string> = {
  idle: "按住说话",
  recording: "正在录音...",
  processing: "思考中...",
  playing: "正在播放...",
};

export default function VoiceButton({
  status,
  disabled,
  onPointerDown,
  onPointerUp,
}: VoiceButtonProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
        disabled={disabled}
        className={`relative flex h-[72px] w-[72px] touch-none select-none items-center justify-center rounded-full text-3xl transition-all duration-200 ${
          status === "recording"
            ? "scale-110 bg-red-500 shadow-[0_0_32px_rgba(239,68,68,0.4)]"
            : disabled
              ? "bg-white/[0.08] text-white/30"
              : "bg-white/[0.1] text-white active:scale-95 hover:bg-white/[0.15]"
        }`}
      >
        {status === "recording" && (
          <span className="absolute inset-0 animate-ping rounded-full bg-red-500/30" />
        )}
        {status === "processing" ? (
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
        ) : status === "playing" ? (
          <span className="flex items-center gap-[3px]">
            {[...Array(4)].map((_, j) => (
              <span
                key={j}
                className="inline-block w-[3px] rounded-full bg-white/50 animate-[waveBar_0.6s_ease-in-out_infinite_alternate]"
                style={{
                  height: "16px",
                  animationDelay: `${j * 0.1}s`,
                }}
              />
            ))}
          </span>
        ) : (
          "🎤"
        )}
      </button>
      <p
        className={`text-[13px] tracking-wide ${
          status === "recording" ? "text-red-400" : "text-white/30"
        }`}
      >
        {STATUS_LABELS[status]}
      </p>
    </div>
  );
}
```

**Step 3: CameraCapture 组件**

Create `src/components/CameraCapture.tsx`:

```tsx
"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import { useCamera } from "@/hooks/useCamera";

interface CameraCaptureProps {
  visible: boolean;
  onCapture: (photoBase64: string) => void;
  onClose: () => void;
}

export default function CameraCapture({
  visible,
  onCapture,
  onClose,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const camera = useCamera();
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (visible && videoRef.current && !camera.isOpen) {
      camera.open(videoRef.current);
    }
    if (!visible && camera.isOpen) {
      camera.close();
    }
  }, [visible, camera]);

  const handleCapture = useCallback(() => {
    const base64 = camera.capture();
    if (base64) {
      setPreview(base64);
    }
  }, [camera]);

  const handleConfirm = useCallback(() => {
    if (preview) {
      onCapture(preview);
      setPreview(null);
      camera.close();
    }
  }, [preview, onCapture, camera]);

  const handleRetake = useCallback(() => {
    setPreview(null);
    if (videoRef.current) {
      camera.open(videoRef.current);
    }
  }, [camera]);

  const handleClose = useCallback(() => {
    setPreview(null);
    camera.close();
    onClose();
  }, [camera, onClose]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* 关闭按钮 */}
      <div className="absolute right-4 top-4 z-10">
        <button
          type="button"
          onClick={handleClose}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white text-xl"
        >
          ✕
        </button>
      </div>

      {/* 视频预览 / 照片预览 */}
      <div className="flex-1 relative">
        {preview ? (
          <img
            src={`data:image/jpeg;base64,${preview}`}
            alt="拍摄预览"
            className="h-full w-full object-contain"
          />
        ) : (
          <video
            ref={videoRef}
            playsInline
            autoPlay
            muted
            className="h-full w-full object-cover"
          />
        )}
      </div>

      {/* 错误提示 */}
      {camera.error && (
        <div className="absolute left-4 right-4 top-16 rounded-xl bg-red-500/20 px-4 py-3 text-center text-sm text-red-400">
          {camera.error}
        </div>
      )}

      {/* 底部控制区 */}
      <div className="flex-none bg-black/80 px-6 py-6 pb-[env(safe-area-inset-bottom,24px)]">
        {preview ? (
          <div className="flex items-center justify-center gap-8">
            <button
              type="button"
              onClick={handleRetake}
              className="rounded-xl bg-white/10 px-6 py-3 text-white"
            >
              重拍
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="rounded-xl bg-[#2563eb] px-6 py-3 text-white"
            >
              使用照片
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={handleCapture}
              className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white bg-white/20 transition-all active:scale-90"
            >
              <span className="h-[56px] w-[56px] rounded-full bg-white" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 4: StepProgress 组件**

Create `src/components/StepProgress.tsx`:

```tsx
import type { InspectionStep } from "@/lib/types";

interface StepProgressProps {
  steps: InspectionStep[];
  currentIndex: number;
}

export default function StepProgress({ steps, currentIndex }: StepProgressProps) {
  if (steps.length === 0) return null;

  return (
    <div className="flex items-center gap-1 px-4 py-2">
      {steps.map((step, i) => (
        <div key={step.id} className="flex items-center gap-1">
          <div
            className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium ${
              i < currentIndex
                ? "bg-green-500/20 text-green-400"
                : i === currentIndex
                  ? "bg-[#2563eb] text-white"
                  : "bg-white/[0.06] text-white/30"
            }`}
          >
            {i < currentIndex ? "✓" : i + 1}
          </div>
          {i < steps.length - 1 && (
            <div
              className={`h-[2px] w-4 ${
                i < currentIndex ? "bg-green-500/30" : "bg-white/[0.06]"
              }`}
            />
          )}
        </div>
      ))}
      <span className="ml-2 text-[12px] text-white/30">
        {steps[currentIndex]?.location ?? ""}
      </span>
    </div>
  );
}
```

**Step 5: ReportView 组件**

Create `src/components/ReportView.tsx`:

```tsx
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
```

**Step 6: 验证编译**

```bash
bunx tsc --noEmit
```

---

## Task 8: 主交互组件 AgentChat + 页面整合

**Files:**
- Create: `src/components/AgentChat.tsx`
- Modify: `src/app/page.tsx`

**Step 1: AgentChat 组件**

Create `src/components/AgentChat.tsx`:

```tsx
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useVoice } from "@/hooks/useVoice";
import ChatBubble from "./ChatBubble";
import VoiceButton from "./VoiceButton";
import CameraCapture from "./CameraCapture";
import StepProgress from "./StepProgress";
import ReportView from "./ReportView";
import type {
  AgentResponse,
  InspectionStep,
  RiskReport,
  UserInputType,
  AgentPhase,
} from "@/lib/types";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function AgentChat() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<AgentPhase>("greeting");
  const [steps, setSteps] = useState<InspectionStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [report, setReport] = useState<RiskReport | null>(null);
  const [expectInput, setExpectInput] = useState<UserInputType[]>(["voice"]);
  const [showCamera, setShowCamera] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 处理 Agent 响应
  const handleAgentResponse = useCallback(
    async (response: AgentResponse, playAudioFn: (base64: string) => Promise<void>) => {
      setSessionId(response.sessionId);
      setPhase(response.phase);
      setExpectInput(response.expectInput);

      if (response.steps) setSteps(response.steps);
      if (response.currentStepIndex !== undefined) setCurrentStepIndex(response.currentStepIndex);
      if (response.report) setReport(response.report);

      // 添加消息
      const newMessages: Message[] = [];
      if (response.userText) {
        newMessages.push({ role: "user", content: response.userText });
      }
      if (response.aiText) {
        newMessages.push({ role: "assistant", content: response.aiText });
      }
      if (newMessages.length > 0) {
        setMessages((prev) => [...prev, ...newMessages]);
      }

      // 播放语音
      if (response.audioBase64) {
        try {
          await playAudioFn(response.audioBase64);
        } catch {
          // 播放失败不阻断
        }
      }
    },
    []
  );

  // 发送请求到 Agent API
  const sendToAgent = useCallback(
    async (
      formData: FormData,
      playAudioFn: (base64: string) => Promise<void>,
      setProcessingFn: () => void,
      setIdleFn: () => void,
    ) => {
      setProcessingFn();
      setError(null);

      if (sessionId) formData.append("sessionId", sessionId);

      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();

        if (!res.ok || data.error) {
          setError(data.error ?? "请求失败");
          setIdleFn();
          return;
        }

        await handleAgentResponse(data as AgentResponse, playAudioFn);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "网络错误";
        setError(`发送失败：${msg}`);
        setIdleFn();
      }
    },
    [sessionId, handleAgentResponse]
  );

  // 语音输入回调
  const onAudioCaptured = useCallback(
    (blob: Blob) => {
      const formData = new FormData();
      formData.append("inputType", "voice");
      formData.append("audio", blob, "recording.webm");
      sendToAgent(formData, voice.playAudio, voice.setProcessing, voice.setIdle);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sendToAgent]
  );

  const voice = useVoice({ onAudioCaptured });

  // 初始化：自动开始对话
  useEffect(() => {
    if (initialized) return;
    setInitialized(true);

    const init = async () => {
      const formData = new FormData();
      formData.append("inputType", "text");
      formData.append("text", "");
      await sendToAgent(formData, voice.playAudio, voice.setProcessing, voice.setIdle);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized]);

  // 照片拍摄回调
  const onPhotoCapture = useCallback(
    (photoBase64: string) => {
      setShowCamera(false);
      const formData = new FormData();
      formData.append("inputType", "photo");
      const byteChars = atob(photoBase64);
      const byteArray = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteArray[i] = byteChars.charCodeAt(i);
      }
      const photoBlob = new Blob([byteArray], { type: "image/jpeg" });
      formData.append("photo", photoBlob, "photo.jpg");
      sendToAgent(formData, voice.playAudio, voice.setProcessing, voice.setIdle);
    },
    [sendToAgent, voice]
  );

  // 按键事件
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      if (voice.status !== "idle") return;
      voice.startRecording();
    },
    [voice]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      if (voice.status !== "recording") return;
      voice.stopRecording();
    },
    [voice]
  );

  const showVoice = expectInput.includes("voice") && phase !== "completed";
  const showPhoto = expectInput.includes("photo");

  return (
    <div className="flex h-dvh flex-col bg-[#0c0c0e]">
      {/* Header */}
      <header className="flex-none border-b border-white/[0.06] px-5 py-4">
        <h1 className="text-center text-[15px] font-medium tracking-wide text-white/70">
          尘螨防控助手
        </h1>
      </header>

      {/* Step Progress */}
      {steps.length > 0 && phase !== "completed" && (
        <StepProgress steps={steps} currentIndex={currentStepIndex} />
      )}

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 && voice.status === "idle" && !initialized && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="text-4xl">🎙️</div>
            <p className="text-[15px] text-white/30">正在启动助手...</p>
          </div>
        )}

        <div className="mx-auto flex max-w-lg flex-col gap-3">
          {messages.map((msg, i) => (
            <ChatBubble key={i} role={msg.role} content={msg.content} />
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Report */}
        {report && <ReportView report={report} />}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex-none px-4 pb-2">
          <div className="mx-auto max-w-lg rounded-xl bg-red-500/10 px-4 py-2.5 text-center text-[13px] text-red-400">
            {error}
          </div>
        </div>
      )}

      {/* Controls */}
      {phase !== "completed" && (
        <div className="flex-none border-t border-white/[0.06] px-4 pb-[env(safe-area-inset-bottom,16px)] pt-4">
          <div className="flex items-center justify-center gap-6">
            {showPhoto && (
              <button
                type="button"
                onClick={() => setShowCamera(true)}
                disabled={voice.status !== "idle"}
                className="flex h-[56px] w-[56px] items-center justify-center rounded-full bg-white/[0.1] text-2xl text-white transition-all hover:bg-white/[0.15] disabled:text-white/30"
              >
                📷
              </button>
            )}
            {showVoice && (
              <VoiceButton
                status={voice.status}
                disabled={voice.status !== "idle" && voice.status !== "recording"}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
              />
            )}
          </div>
        </div>
      )}

      {/* Camera Overlay */}
      <CameraCapture
        visible={showCamera}
        onCapture={onPhotoCapture}
        onClose={() => setShowCamera(false)}
      />

      {/* Inline keyframes */}
      <style>{`
        @keyframes waveBar {
          0% { transform: scaleY(0.6); }
          100% { transform: scaleY(1.4); }
        }
      `}</style>
    </div>
  );
}
```

**Step 2: 更新 page.tsx**

Modify `src/app/page.tsx`:

```tsx
import AgentChat from "@/components/AgentChat";

export default function Home() {
  return <AgentChat />;
}
```

**Step 3: 验证编译**

```bash
bunx tsc --noEmit
bun run build
```

---

## Task 9: 整体验证 + 清理

**Step 1: 清理旧 spike 组件**

删除不再使用的文件：
- `src/components/VoiceChat.tsx` (已被 AgentChat 替代)

**Step 2: 完整编译验证**

```bash
bunx tsc --noEmit
bun run build
```

**Step 3: 手动测试清单**

1. `bun run dev` 启动开发服务器
2. 打开浏览器访问 `http://localhost:3000`
3. 验证 AI 自动语音问候
4. 语音回答房屋结构
5. 验证生成检查步骤 + 进度条
6. 验证拍照功能（需手机或摄像头）
7. 验证照片上传 + Vision 分析
8. 验证材质确认 + 清洗频率询问
9. 验证报告生成
10. 验证尘螨领域问答（流程中提问）

---

## 依赖总结

```json
{
  "dependencies": {
    "next": "16.1.6",
    "react": "19.2.3",
    "react-dom": "19.2.3",
    "openai": "^6.25.0",
    "@langchain/langgraph": "latest",
    "@langchain/core": "latest",
    "@langchain/openai": "latest",
    "uuid": "latest"
  }
}
```

## 环境变量

```
DASHSCOPE_API_KEY=your_dashscope_api_key_here
```
