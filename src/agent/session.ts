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
