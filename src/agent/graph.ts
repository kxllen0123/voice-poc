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

/** 入口路由：根据阶段决定下一个节点 */
function routeByPhase(state: AgentStateType): string {
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

/** greeting 后路由：需要用户输入时暂停，否则链到下一步 */
function routeAfterGreeting(state: AgentStateType): string {
  if (state.phase === "generating_steps") {
    return "generate_steps"; // 用户已回答房屋结构，自动生成步骤
  }
  return END; // phase="asking_layout"，等待用户回答
}

/** generate_steps 后路由：生成完步骤自动给出导航指引 */
function routeAfterGenerateSteps(state: AgentStateType): string {
  if (state.phase === "guiding") {
    return "guide"; // 自动链到导航指引
  }
  return END; // 异常回退
}

/** validate_photo 后路由：合格继续分析，不合格等待重拍 */
function routeAfterValidation(state: AgentStateType): string {
  if (state.photoValid) {
    return "identify_items"; // 照片合格，自动识别物品
  }
  return END; // 照片不合格，等待用户重拍
}

/** confirm_materials 后路由：需要用户输入时暂停，否则自动推进 */
function routeAfterConfirm(state: AgentStateType): string {
  switch (state.phase) {
    case "confirming_materials":
    case "asking_frequency":
      return END; // 等待用户确认材质或回答清洗频率
    case "guiding":
      return "guide"; // 当前步骤完成，自动导航到下一个
    case "generating_report":
      return END; // 暂停：先播放语音提示，前端再触发报告生成
    default:
      return END;
  }
}

export function createAgentGraph() {
  const graph = new StateGraph(AgentState)
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

    // greeting → 等待用户 或 自动生成步骤
    .addConditionalEdges("greeting", routeAfterGreeting)

    // generate_steps → 自动导航 或 回退
    .addConditionalEdges("generate_steps", routeAfterGenerateSteps)

    // guide → END (等待用户拍照或语音)
    .addEdge("guide", END)

    // validate_photo → 合格自动分析 或 等待重拍
    .addConditionalEdges("validate_photo", routeAfterValidation)

    // identify_items → 自动进入材质确认（内部步骤，无需用户输入）
    .addEdge("identify_items", "confirm_materials")

    // confirm_materials → 等待用户 或 自动推进
    .addConditionalEdges("confirm_materials", routeAfterConfirm)

    // generate_report → END
    .addEdge("generate_report", END)

    // handle_question → END
    .addEdge("handle_question", END);

  return graph.compile();
}
