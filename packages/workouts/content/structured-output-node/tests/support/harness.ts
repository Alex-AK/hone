import { Clock } from '../../src/lib/clock';
import { Triage, type TriageOptions } from '../../src/lib/triage';
import type { Message, TextBlock } from '../../src/model/protocol';
import { toolsFor } from '../../src/tools/registry';
import { type Session, Store } from '../../src/tools/store';
import { FakeModel, type RecordedTurn } from './fake-model';

/** The signed-in customer. A-1187 and A-9000 are theirs; B-2001 is not. */
const SESSION: Session = { customerId: 'C-9' };

export const OPTIONS: TriageOptions = {
  maxRepairs: 2,
  maxResultChars: 400,
  maxTurns: 6,
  maxWaits: 3,
};

export function harness(
  transcript: RecordedTurn[],
  overrides: Partial<TriageOptions> = {}
): { clock: Clock; model: FakeModel; store: Store; triage: Triage } {
  const store = new Store();
  const model = new FakeModel(transcript);
  const clock = new Clock();
  const triage = new Triage(
    { ...OPTIONS, ...overrides },
    { clock, model, session: SESSION, tools: toolsFor(store) }
  );
  return { clock, model, store, triage };
}

/** The conversation as it stood on the last request, which is the fullest one. */
export function conversation(model: FakeModel): Message[] {
  return model.calls.at(-1) ?? [];
}

/** Everything triage said back to the model, oldest first. */
export function complaints(model: FakeModel): string[] {
  return conversation(model)
    .filter((message) => message.role === 'user')
    .map((message) =>
      message.content
        .filter((block): block is TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join(' ')
    )
    .filter((text) => text.length > 0)
    .slice(1);
}
