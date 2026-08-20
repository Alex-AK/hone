/** What the broker recorded about one accepted publish. */
export interface PublishedMessage {
  readonly topic: string;
  readonly payload: unknown;
  /** The relay's idea of which outbox row this is. Duplicates share it. */
  readonly messageId: string;
}

export interface PublishOptions {
  /** How a consumer recognises the same message arriving twice. */
  readonly messageId: string;
}

/**
 * A broker in one file, with the awkward parts kept. Given to you, and not part
 * of the exercise.
 *
 * `publish` is genuinely asynchronous, because the real one is a network call:
 * it settles on a later turn of the event loop, and whatever your relay is
 * holding while it waits, it holds for that whole time.
 *
 * It accepts duplicates without complaint. Sending the same `messageId` twice
 * records it twice, which is the broker declining to solve a problem it cannot
 * see: whether the work already happened is a fact in somebody's database and
 * not in the broker.
 */
export class FakeBroker {
  private readonly accepted: PublishedMessage[] = [];
  private readonly refuse = new Set<string>();
  private observer: (() => void) | null = null;

  /** Send one message. Rejects if this messageId is one the broker is refusing. */
  async publish(topic: string, payload: unknown, options: PublishOptions): Promise<void> {
    this.observer?.();
    await tick();
    if (this.refuse.has(options.messageId)) {
      throw new Error(`the broker refused message ${options.messageId}`);
    }
    this.accepted.push({ topic, payload, messageId: options.messageId });
  }

  /** Test-only. Everything the broker accepted, in the order it arrived. */
  published(): PublishedMessage[] {
    return [...this.accepted];
  }

  /** Test-only. The message ids it accepted, in order. Duplicates included. */
  publishedIds(): string[] {
    return this.accepted.map((message) => message.messageId);
  }

  /** Test-only. Every publish of this id fails, until `accept` is called. */
  refuseEvery(messageId: string): void {
    this.refuse.add(messageId);
  }

  /** Test-only. Stop refusing that id. */
  accept(messageId: string): void {
    this.refuse.delete(messageId);
  }

  /**
   * Test-only. Runs at the moment a publish is entered, before it settles, which
   * is how a checkpoint sees what the relay was holding at the time.
   */
  observeEachPublish(fn: () => void): void {
    this.observer = fn;
  }
}

/** A real turn of the event loop, so "in flight" means something. */
function tick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
