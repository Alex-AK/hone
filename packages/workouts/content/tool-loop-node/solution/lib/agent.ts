import { z } from 'zod';

import type { Message, Model, TextBlock, ToolResultBlock, ToolUseBlock } from '../model/protocol';
import type { ToolDefinition } from '../tools/registry';
import type { Session } from '../tools/store';
import { LoopDidNotSettleError } from './errors';

export interface AgentOptions {
  /** The most characters one tool result may take up in the conversation. */
  maxResultChars: number;
  /** The most times this may go round before it gives up. */
  maxTurns: number;
}

export interface AgentDeps {
  model: Model;
  /** From the signed-in connection. Nothing in an argument may replace it. */
  session: Session;
  tools: ToolDefinition[];
}

export class Agent {
  constructor(
    private readonly options: AgentOptions,
    private readonly deps: AgentDeps
  ) {}

  async answer(question: string): Promise<string> {
    const messages: Message[] = [{ content: [{ text: question, type: 'text' }], role: 'user' }];

    for (let turn = 0; turn < this.options.maxTurns; turn += 1) {
      const reply = await this.deps.model.complete({ messages });
      messages.push({ content: reply.content, role: 'assistant' });

      const calls = reply.content.filter((block) => block.type === 'tool_use');
      // The turn that asks for nothing is the only one whose text is an answer.
      if (calls.length === 0) return textOf(reply.content);

      messages.push({ content: calls.map((call) => this.answerCall(call)), role: 'user' });
    }

    throw new LoopDidNotSettleError(this.options.maxTurns);
  }

  /** Every call gets one of these, including the ones that never ran. */
  private answerCall(call: ToolUseBlock): ToolResultBlock {
    try {
      return { content: this.cap(this.execute(call)), tool_use_id: call.id, type: 'tool_result' };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return {
        content: this.cap(reason),
        is_error: true,
        tool_use_id: call.id,
        type: 'tool_result',
      };
    }
  }

  private execute(call: ToolUseBlock): string {
    const tool = this.deps.tools.find((candidate) => candidate.name === call.name);
    if (!tool) throw new Error(`There is no tool named ${call.name}.`);

    const parsed = tool.input.safeParse(call.input);
    if (!parsed.success) {
      throw new Error(`${call.name} was called wrongly: ${z.prettifyError(parsed.error)}`);
    }

    return tool.run(parsed.data, this.deps.session);
  }

  private cap(content: string): string {
    if (content.length <= this.options.maxResultChars) return content;
    return `${content.slice(0, this.options.maxResultChars - 1)}…`;
  }
}

function textOf(content: (TextBlock | ToolUseBlock)[]): string {
  return content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join(' ');
}
