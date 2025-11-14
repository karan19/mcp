import type { ToolCatalogEntry } from './toolCatalog';

interface DecisionPromptOptions {
  userMessage: string;
  historyTranscript: string;
  catalogText: string;
}

interface AnswerPromptOptions {
  toolId: string;
  userMessage: string;
  historyTranscript: string;
  toolOutput: string;
}

/**
 * Builds the planner prompt that instructs the model to choose between calling
 * a tool or replying directly.
 */
export function buildDecisionPrompt({ userMessage, historyTranscript, catalogText }: DecisionPromptOptions): string {
  const parts: string[] = [];
  if (historyTranscript) {
    parts.push('Conversation so far:', historyTranscript, '');
  }

  parts.push(
    `User message: ${userMessage}`,
    '',
    'Available tools:',
    catalogText,
    '',
    'Instructions:',
    '- RESPOND WITH JSON ONLY. Do not add any explanatory text, code fences, or commentary.',
    '- If the user is asking about your own capabilities (e.g., "what tools can you use"), do not call an external tool. Instead, respond with {"action":"respond","response":"<natural language answer>"}.',
    '- Tool ids are the identifiers shown in parentheses above (e.g., "tool id: query.dynamodb.example"). When returning {"action":"call_tool",...}, always use the tool id value exactly.',
    '- If an external tool is needed, respond with {"action":"call_tool","tool":"<tool_id>","arguments":{...}}.',
    '- If you can answer immediately without a tool, respond with {"action":"respond","response":"<answer>"} in plain English.',
    '- Prefer calling tools when the question needs fresh or factual data.',
    '',
    'Examples:',
    '{"action":"respond","response":"I already know the answer."}',
    '{"action":"call_tool","tool":"query.dynamodb.example_table","arguments":{"partitionKeyValue":"example","limit":5}}'
  );

  return parts.join('\n');
}

/**
 * Normalises tool outputs into a single string so the answer prompt remains
 * concise.
 */
export function summarizeToolOutput(content: Array<{ type: string; text?: string }>): string {
  return content
    .map((item) => (typeof item.text === 'string' ? item.text : ''))
    .filter((text) => text.trim().length > 0)
    .join('\n\n');
}

/**
 * Builds the answer-generation prompt that instructs the model to cite the tool
 * results while responding to the user.
 */
export function buildAnswerPrompt({ toolId, userMessage, historyTranscript, toolOutput }: AnswerPromptOptions): string {
  const lines: string[] = [`You requested tool "${toolId}" to help answer a question.`];

  if (historyTranscript) {
    lines.push('Previous conversation context:', historyTranscript, '');
  }

  lines.push(
    `User message: ${userMessage}`,
    '',
    'Tool output:',
    toolOutput,
    '',
    'Compose a helpful answer using only the tool output.',
    `- Cite the source as (${toolId}) when referencing the data.`,
    '- Do not introduce external information or definitions unless they appear in the tool output.',
    '- Skip generic disclaimers about accuracy.'
  );

  return lines.join('\n');
}
