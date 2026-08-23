/**
 * A clock that records waits instead of taking them. `sleep` resolves at once
 * and remembers how long it was asked for, so a checkpoint can read back what
 * the code decided to wait without any checkpoint taking a second to run.
 *
 * Given to you, and not part of the exercise. Use it for anything that waits:
 * a real `setTimeout` waits in real time, which the checkpoints do not.
 */
export class Clock {
  /** Test-only. Every wait, in milliseconds, oldest first. */
  readonly slept: number[] = [];

  async sleep(ms: number): Promise<void> {
    this.slept.push(ms);
  }
}
