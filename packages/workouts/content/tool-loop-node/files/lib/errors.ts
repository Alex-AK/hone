/**
 * What the loop throws when it will not go round again. The checkpoints assert
 * on the class and on `turns`.
 *
 * Given to you, and not part of the exercise.
 */
export class LoopDidNotSettleError extends Error {
  constructor(readonly turns: number) {
    super(`the model was still asking for tool calls after ${turns} turns`);
    this.name = 'LoopDidNotSettleError';
  }
}
