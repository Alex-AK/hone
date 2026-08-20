import { Agent, type AgentOptions } from '../../src/lib/agent';
import type { Message, ToolResultBlock } from '../../src/model/protocol';
import { toolsFor } from '../../src/tools/registry';
import { type Session, Store } from '../../src/tools/store';
import { FakeModel, type RecordedTurn } from './fake-model';

/** The signed-in customer. A-1187 and A-9000 are theirs; B-2001 is not. */
const SESSION: Session = { customerId: 'C-9' };

const CONTEXT_WINDOW = 2_000;

export const OPTIONS: AgentOptions = { maxResultChars: 400, maxTurns: 5 };

export function harness(
  transcript: RecordedTurn[],
  overrides: Partial<AgentOptions> = {}
): { agent: Agent; model: FakeModel; store: Store } {
  const store = new Store();
  const model = new FakeModel(transcript, { contextWindow: CONTEXT_WINDOW });
  const agent = new Agent(
    { ...OPTIONS, ...overrides },
    { model, session: SESSION, tools: toolsFor(store) }
  );
  return { agent, model, store };
}

/** The conversation as it stood on the last request, which is the fullest one. */
export function conversation(model: FakeModel): Message[] {
  return model.calls.at(-1) ?? [];
}

export function resultsSent(model: FakeModel): ToolResultBlock[] {
  return conversation(model).flatMap((message) =>
    message.content.filter((block): block is ToolResultBlock => block.type === 'tool_result')
  );
}

export function resultFor(model: FakeModel, id: string): ToolResultBlock | undefined {
  return resultsSent(model).find((result) => result.tool_use_id === id);
}
