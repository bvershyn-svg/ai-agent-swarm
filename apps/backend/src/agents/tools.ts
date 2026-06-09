// Инструменты (tool_use) для агентов роя
import type Anthropic from '@anthropic-ai/sdk';

// Инструмент Стратега — создание плана задач
export const PLAN_TOOL: Anthropic.Tool = {
  name: 'create_plan',
  description: 'Создать детальный план задач для роя агентов на основе цели владельца.',
  input_schema: {
    type: 'object' as const,
    properties: {
      tasks: {
        type: 'array',
        description: 'Список задач в порядке выполнения',
        items: {
          type: 'object',
          properties: {
            agent_slug: {
              type: 'string',
              description: 'Идентификатор агента-исполнителя (scriptwriter, designer и т.д.)',
            },
            description: {
              type: 'string',
              description: 'Подробное описание задачи — что именно нужно сделать и как',
            },
            depends_on: {
              type: 'array',
              items: { type: 'integer' },
              description: 'Индексы (0-based) задач из этого же списка, которые должны быть выполнены раньше',
            },
          },
          required: ['agent_slug', 'description'],
        },
      },
      needs_approval: {
        type: 'boolean',
        description: 'true если задач больше 3 и нужно одобрение владельца перед запуском',
      },
      rationale: {
        type: 'string',
        description: 'Краткое объяснение плана для владельца: почему выбраны именно эти агенты и такой порядок',
      },
    },
    required: ['tasks', 'needs_approval', 'rationale'],
  },
};

// Инструмент Критика — оценка результата задачи
export const REVIEW_TOOL: Anthropic.Tool = {
  name: 'review_result',
  description: 'Оценить качество выполненной задачи и вынести вердикт.',
  input_schema: {
    type: 'object' as const,
    properties: {
      approved: {
        type: 'boolean',
        description: 'true — результат принят; false — требует доработки',
      },
      verdict: {
        type: 'string',
        description: 'Детальная оценка: что хорошо, что плохо, соответствие задаче',
      },
      feedback: {
        type: 'string',
        description: 'Конкретные инструкции для исправления (только если approved=false)',
      },
    },
    required: ['approved', 'verdict'],
  },
};
