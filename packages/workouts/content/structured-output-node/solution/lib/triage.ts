import { z } from 'zod';

import type { Clock } from './clock';
import {
  type Message,
  type Model,
  type ModelReply,
  RateLimitedError,
  type TextBlock,
  type ToolResultBlock,
  type ToolUseBlock,
} from '../model/protocol';
import { type Decision, decisionSchema } from '../tickets/schema';
import type { ToolDefinition } from '../tools/registry';
import type { Session } from '../tools/store';
import { LoopDidNotSettleError, NoUsableDecisionError } from './errors';

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

/** Either the decision, or what to tell the model about why it is not one. */
type Reading = { ok: true; decision: Decision } | { ok: false; complaint: string };

const CUT_OFF = [
  'Your last answer stopped before it was finished, so I could not read it.',
  'Send the decision object on its own, with nothing around it.',
].join(' ');

export class Triage {
  constructor(
    private readonly options: TriageOptions,
    private readonly deps: TriageDeps
  ) {}

  async decide(question: string): Promise<Decision> {
    const messages: Message[] = [{ content: [{ text: question, type: 'text' }], role: 'user' }];
    let attempts = 0;
    let last = '';

    for (let turn = 0; turn < this.options.maxTurns; turn += 1) {
      const reply = await this.complete(messages);
      messages.push({ content: reply.content, role: 'assistant' });

      const calls = reply.content.filter((block) => block.type === 'tool_use');
      if (calls.length > 0) {
        messages.push({ content: calls.map((call) => this.answerCall(call)), role: 'user' });
        continue;
      }

      // The turn that stopped asking is the one carrying the decision, and the
      // stop reason is read before the text is: a reply that ran out of room is
      // a fragment, and the model did not get anything wrong by being cut off.
      // Telling it a field is missing is a false accusation, and the answer to a
      // false accusation is the same answer again.
      attempts += 1;
      const reading: Reading =
        reply.stopReason === 'max_tokens'
          ? { complaint: CUT_OFF, ok: false }
          : read(textOf(reply.content));

      if (reading.ok) return reading.decision;

      last = reading.complaint;
      if (attempts > this.options.maxRepairs) {
        throw new NoUsableDecisionError(attempts, last);
      }
      messages.push({ content: [{ text: reading.complaint, type: 'text' }], role: 'user' });
    }

    throw new LoopDidNotSettleError(this.options.maxTurns);
  }

  /**
   * A rate limit read nothing and charged nothing, so the conversation to send
   * is the one already built. Waiting here rather than around `decide` is what
   * keeps the tools that already ran from running again: their results are in
   * `messages`, and `messages` is what goes back.
   */
  private async complete(messages: Message[]): Promise<ModelReply> {
    for (let waited = 0; ; waited += 1) {
      try {
        return await this.deps.model.complete({ messages });
      } catch (error) {
        if (!(error instanceof RateLimitedError) || waited >= this.options.maxWaits) throw error;
        await this.deps.clock.sleep(error.retryAfterMs);
      }
    }
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

function read(text: string): Reading {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch (error) {
    return {
      complaint: `That is not JSON: ${describe(error)}. Send the decision object on its own.`,
      ok: false,
    };
  }

  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) {
    // The whole of what the model has to work with, so it names the field.
    return { complaint: `That is not a decision: ${z.prettifyError(parsed.error)}`, ok: false };
  }
  return { decision: parsed.data, ok: true };
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
