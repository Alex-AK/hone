/**
 * What triage throws when it will not go round again. The checkpoints assert on
 * the classes and on what they carry.
 *
 * Given to you, and not part of the exercise.
 */

export class LoopDidNotSettleError extends Error {
  constructor(readonly turns: number) {
    super(`the model was still asking for tool calls after ${turns} turns`);
    this.name = 'LoopDidNotSettleError';
  }
}

/**
 * The model was asked for a decision as many times as it was going to be, and
 * never sent one that fits. `last` is the reason the final attempt was rejected,
 * which is the only part of this a person reading the log can act on.
 */
export class NoUsableDecisionError extends Error {
  constructor(
    readonly attempts: number,
    readonly last: string
  ) {
    super(`no usable decision after ${attempts} attempts: ${last}`);
    this.name = 'NoUsableDecisionError';
  }
}
