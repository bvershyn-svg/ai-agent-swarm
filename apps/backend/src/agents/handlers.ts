import { chat } from './conversational';
import type { Agent, ChatMessage, AttachedFile } from '@swarm/shared';

// Тип обработчика: агент + сообщение + projectId + файл → ответ с историей
export type AgentHandler = (
  agent: Agent,
  message: string,
  projectId?: number,
  file?: AttachedFile,
) => Promise<{ reply: string; history: ChatMessage[] }>;

// Реестр специальных обработчиков по slug-у.
// Если агент не в реестре — используется стандартный conversational.
// Личность каждого агента задаётся через system_prompt в базе данных.
const registry: Partial<Record<string, AgentHandler>> = {
  // Пример добавления специального обработчика в будущем:
  // programmer: async (agent, message) => { /* специальная логика */ }
};

export function getHandler(slug: string): AgentHandler {
  return registry[slug] ?? chat;
}
