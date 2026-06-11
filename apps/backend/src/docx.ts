// Генерация Word-документа с результатами прогона
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } from 'docx';
import type { Run, Task } from '@swarm/shared';

const AGENT_NAMES: Record<string, string> = {
  strategist:   'Стратег',
  scriptwriter: 'Сценарист',
  producer:     'Продюсер',
  visual:       'Визуал',
  factchecker:  'Фактчекер',
  critic:       'Критик',
};

// Разбивает текст на параграфы, сохраняя переносы строк
function textToParagraphs(text: string): Paragraph[] {
  return text.split('\n').map(
    (line) => new Paragraph({ children: [new TextRun({ text: line, size: 24 })] }),
  );
}

export async function buildRunDocx(run: Run, tasks: Task[]): Promise<Buffer> {
  const date = new Date(run.created_at).toLocaleDateString('ru-RU', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  const children: Paragraph[] = [];

  // Заголовок документа
  children.push(
    new Paragraph({
      children: [new TextRun({ text: run.goal, bold: true, size: 36, color: '1a1a1a' })],
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.LEFT,
      spacing: { after: 200 },
    }),
  );

  // Метаданные
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: `Прогон #${run.id}  ·  ${date}  ·  ${tasks.filter(t => t.result).length} агентов`, color: '888888', size: 20 }),
      ],
      spacing: { after: 400 },
    }),
  );

  // Итоговая сводка
  if (run.summary) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: 'Итоговая сводка', bold: true, size: 28 })],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 160 },
        border: { bottom: { color: 'cccccc', style: BorderStyle.SINGLE, size: 1 } },
      }),
    );
    children.push(...textToParagraphs(run.summary));
    children.push(new Paragraph({ text: '', spacing: { after: 300 } }));
  }

  // Результаты каждого агента
  for (const task of tasks) {
    if (!task.result) continue;

    const agentName = AGENT_NAMES[task.agent_slug] ?? task.agent_slug;

    // Заголовок агента
    children.push(
      new Paragraph({
        children: [new TextRun({ text: agentName, bold: true, size: 28 })],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 400, after: 120 },
        border: { bottom: { color: 'cccccc', style: BorderStyle.SINGLE, size: 1 } },
      }),
    );

    // Описание задачи курсивом
    children.push(
      new Paragraph({
        children: [new TextRun({ text: task.description, italics: true, color: '888888', size: 20 })],
        spacing: { after: 200 },
      }),
    );

    // Результат
    children.push(...textToParagraphs(task.result));
    children.push(new Paragraph({ text: '', spacing: { after: 200 } }));
  }

  const doc = new Document({
    creator: 'Рой ИИ-агентов',
    title: run.goal,
    description: `Прогон #${run.id}`,
    sections: [{ children }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
