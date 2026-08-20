import type { Message, Model } from '../model/protocol';
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

/**
 * Right now this asks once and hands back whatever the model said, so a turn
 * that asked for a tool call is read as the answer.
 *
 * TODO: run what the model asked for, answer every call, and stop. See brief.md.
 */
export class Agent {
  constructor(
    private readonly options: AgentOptions,
    private readonly deps: AgentDeps
  ) {
    void this.options;
    void LoopDidNotSettleError;
  }

  async answer(question: string): Promise<string> {
    const messages: Message[] = [{ content: [{ text: question, type: 'text' }], role: 'user' }];

    const reply = await this.deps.model.complete({ messages });

    return reply.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join(' ');
  }
}
