import { readFileSync } from "fs";
import { join } from "path";
import { parse } from "yaml";

/** prompts.yaml 中的所有 key */
interface PromptMap {
  system: string;
  greeting: string;
  parse_layout: string;
  generate_steps: string;
  guide: string;
  validate_photo: string;
  identify_items: string;
  confirm_materials: string;
  ask_frequency: string;
  generate_report: string;
  domain_qa: string;
  detect_question: string;
}

/** 读取并缓存 prompts.yaml */
let _cache: PromptMap | null = null;

function loadPrompts(): PromptMap {
  if (_cache) return _cache;

  const filePath = join(process.cwd(), "src/agent/prompts.yaml");
  const raw = readFileSync(filePath, "utf-8");
  _cache = parse(raw) as PromptMap;
  return _cache;
}

/** 重新加载（开发时热更新用） */
export function reloadPrompts(): void {
  _cache = null;
  loadPrompts();
}

// ---- 保持原有导出名称不变，方便现有代码无缝使用 ----

export const SYSTEM_PROMPT = (() => loadPrompts().system)();
export const GREETING_PROMPT = (() => loadPrompts().greeting)();
export const PARSE_LAYOUT_PROMPT = (() => loadPrompts().parse_layout)();
export const GENERATE_STEPS_PROMPT = (() => loadPrompts().generate_steps)();
export const GUIDE_PROMPT = (() => loadPrompts().guide)();
export const VALIDATE_PHOTO_PROMPT = (() => loadPrompts().validate_photo)();
export const IDENTIFY_ITEMS_PROMPT = (() => loadPrompts().identify_items)();
export const CONFIRM_MATERIALS_PROMPT = (() => loadPrompts().confirm_materials)();
export const ASK_FREQUENCY_PROMPT = (() => loadPrompts().ask_frequency)();
export const GENERATE_REPORT_PROMPT = (() => loadPrompts().generate_report)();
export const DOMAIN_QA_PROMPT = (() => loadPrompts().domain_qa)();
export const DETECT_QUESTION_PROMPT = (() => loadPrompts().detect_question)();
