import { z } from 'zod';

import type { Clock } from './clock';
import type { Message, Model, TextBlock, ToolResultBlock, ToolUseBlock } from '../model/protocol';
import { type Decision, decisionSchema } from '../tickets/schema';
import type { ToolDefinition } from '../tools/registry';
import type { Session } from '../tools/store';
import { LoopDidNotSettleError } from './errors';

export interface TriageOptions {
  /** The most characters one tool result may take up in the conversation. */
  maxResultChars: number;
  /** The most times this may go round before it gives up. */
  maxTurns: number;
  /** How many times an unusable answer may be sent back to be done again. */
  maxRepairs: number;
  /** How many times a rate limit may be waited out on one request. */
  maxWaits: number;
}

export interface TriageDeps {
  model: Model;
  /** From the signed-in connection. Nothing in an argument may replace it. */
  session: Session;
  tools: ToolDefinition[];
  clock: Clock;
}

/**
 * The tool-call loop from part one, with the answer read as a decision instead
 * of handed back as text. It works on a model that sends what it is asked for.
 *
 * TODO: it also takes any reply at face value. A reply that stopped because it
 * ran out of room is treated as an answer, a reply that does not fit the schema
 * takes the whole triage down rather than being sent back, and a rate limit is
 * not handled at all. `maxRepairs`, `maxWaits` and `deps.clock` are here for
 * that and are unused. See brief.md.
 */
export class Triage {
  constructor(
    private readonly options: TriageOptions,
    private readonly deps: TriageDeps
  ) {}

  async decide(question: string): Promise<Decision> {
    const messages: Message[] = [{ content: [{ text: question, type: 'text' }], role: 'user' }];

    for (let turn = 0; turn < this.options.maxTurns; turn += 1) {
      const reply = await this.deps.model.complete({ messages });
      messages.push({ content: reply.content, role: 'assistant' });

      const calls = reply.content.filter((block) => block.type === 'tool_use');
      if (calls.length > 0) {
        messages.push({ content: calls.map((call) => this.answerCall(call)), role: 'user' });
        continue;
      }

      return decisionSchema.parse(JSON.parse(textOf(reply.content)));
    }

    throw new LoopDidNotSettleError(this.options.maxTurns);
  }

  /** Every call gets one of these, including the ones that never ran. */
  private answerCall(call: ToolUseBlock): ToolResultBlock {
    try {
      return { content: this.cap(this.execute(call)), tool_use_id: call.id, type: 'tool_result' };
    } catch (error) {
      return {
        content: this.cap(describe(error)),
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

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
