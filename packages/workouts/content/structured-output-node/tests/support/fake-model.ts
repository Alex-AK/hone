import {
  type Message,
  type Model,
  type ModelReply,
  ProtocolError,
  RateLimitedError,
  type TextBlock,
  type ToolResultBlock,
  type ToolUseBlock,
} from '../../src/model/protocol';

/**
 * One recorded reply, and the conversation it is recorded for. `at` is how many
 * assistant turns the conversation already holds, so the transcript is indexed
 * by where triage has got to rather than by how many times this object has been
 * called: send the same conversation twice and the same reply comes back.
 *
 * `when` and `told` are the reactive parts. `when` reads the results of the last
 * turn; `told` reads what the last user message said, which is how a transcript
 * records that a model answers a true complaint differently from a false one. A
 * model told a field is missing from an answer that was merely cut off sends the
 * same answer again, because nothing about it was wrong.
 *
 * `refuse` is the one stateful thing in here, and it has to be: a 429 that
 * refused for ever would not be a rate limit, it would be an outage.
 */
export interface RecordedTurn {
  at: 'any' | number;
  reply: ModelReply;
  when?: (results: ToolResultBlock[]) => boolean;
  told?: (text: string) => boolean;
  /** The provider refuses this many requests before it answers this turn. */
  refuse?: { retryAfterMs: number; times: number };
}

/**
 * A model that samples nothing. Every reply is read off a recorded transcript,
 * and every refusal is one the real API makes: a `tool_use` block nobody
 * answered, a `tool_result` answering nothing, results that are not the first
 * thing in the message, and a request the provider declined to serve.
 */
export class FakeModel implements Model {
  /** Test-only. Every conversation this was sent, oldest first. */
  readonly calls: Message[][] = [];
  private readonly refused = new Map<RecordedTurn, number>();

  constructor(private readonly transcript: RecordedTurn[]) {}

  async complete(request: { messages: Message[] }): Promise<ModelReply> {
    const messages = structuredClone(request.messages);
    this.calls.push(messages);

    refuseMalformed(messages);

    const turn = messages.filter((message) => message.role === 'assistant').length;
    const last = messages.at(-1);
    const results = resultsIn(last);
    const told = textIn(last);
    const recorded = this.transcript.find(
      (entry) =>
        (entry.at === 'any' || entry.at === turn) &&
        (entry.when?.(results) ?? true) &&
        (entry.told?.(told) ?? true)
    );
    if (!recorded) {
      throw new ProtocolError(`the transcript has nothing recorded for turn ${turn}`);
    }

    const already = this.refused.get(recorded) ?? 0;
    if (recorded.refuse && already < recorded.refuse.times) {
      this.refused.set(recorded, already + 1);
      throw new RateLimitedError(recorded.refuse.retryAfterMs);
    }

    return structuredClone(recorded.reply);
  }
}

function refuseMalformed(messages: Message[]): void {
  if (messages.length === 0) throw new ProtocolError('messages must not be empty');
  if (messages[0]?.role !== 'user')
    throw new ProtocolError('the conversation starts with a user message');

  for (const message of messages) {
    if (message.content.length === 0) throw new ProtocolError('a message with no content blocks');
    for (const block of message.content) {
      if (block.type === 'text' && block.text.length === 0) {
        throw new ProtocolError('a text block with no text');
      }
    }
  }

  const last = messages.at(-1);
  if (last?.role !== 'user') throw new ProtocolError('the last message must be from the user');

  const asked = toolUsesIn(messages.at(-2));
  const given = resultsIn(last);

  const firstOther = last.content.findIndex((block) => block.type !== 'tool_result');
  if (firstOther !== -1 && last.content.slice(firstOther).some((b) => b.type === 'tool_result')) {
    throw new ProtocolError('tool_result blocks come before anything else in the message');
  }

  for (const call of asked) {
    const answers = given.filter((result) => result.tool_use_id === call.id);
    if (answers.length === 0) {
      throw new ProtocolError(`no tool_result for tool_use ${call.id} (${call.name})`);
    }
    if (answers.length > 1) {
      throw new ProtocolError(`${answers.length} tool_results for tool_use ${call.id}`);
    }
  }

  for (const result of given) {
    if (!asked.some((call) => call.id === result.tool_use_id)) {
      throw new ProtocolError(`tool_result ${result.tool_use_id} answers no tool_use`);
    }
  }
}

function toolUsesIn(message: Message | undefined): ToolUseBlock[] {
  if (message?.role !== 'assistant') return [];
  return message.content.filter((block): block is ToolUseBlock => block.type === 'tool_use');
}

function resultsIn(message: Message | undefined): ToolResultBlock[] {
  if (!message) return [];
  return message.content.filter((block): block is ToolResultBlock => block.type === 'tool_result');
}

function textIn(message: Message | undefined): string {
  if (!message) return '';
  return message.content
    .filter((block): block is TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join(' ');
}
