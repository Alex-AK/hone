/**
 * The wire shapes of the model this service talks to, and the two ways it
 * refuses a request. Nothing here reaches a network: the checkpoints put a
 * recorded transcript behind `Model`.
 *
 * Given to you, and not part of the exercise.
 */

export interface TextBlock {
  type: 'text';
  text: string;
}

/** A request to call something. Nothing has run when one of these arrives. */
export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  /** Whatever the model wrote. No schema has been applied to it. */
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  /** The `id` of the `tool_use` block this answers. */
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ContentBlock = TextBlock | ToolResultBlock | ToolUseBlock;

export interface Message {
  role: 'assistant' | 'user';
  content: ContentBlock[];
}

export interface ModelReply {
  stopReason: 'end_turn' | 'tool_use';
  content: (TextBlock | ToolUseBlock)[];
}

export interface Model {
  complete(request: { messages: Message[] }): Promise<ModelReply>;
}

/** A 400. The conversation you sent is not one the API accepts. */
export class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolError';
  }
}

/** The prompt no longer fits. Also a 400, and it arrives mid-conversation. */
export class ContextWindowExceededError extends Error {
  constructor(
    readonly tokens: number,
    readonly window: number
  ) {
    super(`the conversation is ${tokens} tokens and the window is ${window}`);
    this.name = 'ContextWindowExceededError';
  }
}
