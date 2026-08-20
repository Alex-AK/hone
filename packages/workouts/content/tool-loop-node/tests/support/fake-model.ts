import {
  ContextWindowExceededError,
  type Message,
  type Model,
  type ModelReply,
  ProtocolError,
  type ToolResultBlock,
  type ToolUseBlock,
} from '../../src/model/protocol';

/**
 * One recorded reply, and the conversation it is recorded for. `at` is how many
 * assistant turns the conversation already holds, so the transcript is indexed
 * by where the loop has got to rather than by how many times this object has
 * been called: send the same conversation twice and the same reply comes back.
 *
 * `when` is the only reactive part, and it reads the results of the last turn.
 * A model that is told which argument was wrong sends a corrected call, and one
 * that is told "failed" cannot, which is a difference the transcript records
 * rather than a difference the checkpoints assert on directly.
 */
export interface RecordedTurn {
  at: 'any' | number;
  reply: ModelReply;
  when?: (results: ToolResultBlock[]) => boolean;
}

export interface FakeModelOptions {
  /** Prompt and completion share it, so it is spent by the conversation. */
  contextWindow: number;
}

/**
 * A model that samples nothing. Every reply is read off a recorded transcript,
 * and every refusal is one the real API makes: a `tool_use` block nobody
 * answered, a `tool_result` answering nothing, results that are not the first
 * thing in the message, and a conversation that has outgrown the window.
 */
export class FakeModel implements Model {
  /** Test-only. Every conversation this was sent, oldest first. */
  readonly calls: Message[][] = [];

  constructor(
    private readonly transcript: RecordedTurn[],
    private readonly options: FakeModelOptions = { contextWindow: 2_000 }
  ) {}

  async complete(request: { messages: Message[] }): Promise<ModelReply> {
    const messages = structuredClone(request.messages);
    this.calls.push(messages);

    refuseMalformed(messages);

    const tokens = estimateTokens(messages);
    if (tokens > this.options.contextWindow) {
      throw new ContextWindowExceededError(tokens, this.options.contextWindow);
    }

    const turn = messages.filter((message) => message.role === 'assistant').length;
    const results = resultsIn(messages.at(-1));
    const recorded = this.transcript.find(
      (entry) => (entry.at === 'any' || entry.at === turn) && (entry.when?.(results) ?? true)
    );
    if (!recorded) {
      throw new ProtocolError(`the transcript has nothing recorded for turn ${turn}`);
    }

    return structuredClone(recorded.reply);
  }
}

/** The rule of thumb, and exact here because this is what enforces the window. */
function estimateTokens(messages: Message[]): number {
  return Math.ceil(JSON.stringify(messages).length / 4);
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
