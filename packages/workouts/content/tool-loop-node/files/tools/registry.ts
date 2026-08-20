import { z } from 'zod';

import type { Session, Store } from './store';

/**
 * The three tools this assistant is given. `input` is our schema, and it is the
 * only thing standing between what the model wrote and `run`: the arguments
 * arrive as whatever the model produced, so `run` is typed for the parsed value
 * and takes `unknown` because nothing has parsed it yet.
 *
 * Given to you, and not part of the exercise.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  input: z.ZodType;
  run: (args: unknown, session: Session) => string;
}

function defineTool<S extends z.ZodType>(tool: {
  description: string;
  input: S;
  name: string;
  run: (args: z.output<S>, session: Session) => string;
}): ToolDefinition {
  return {
    description: tool.description,
    input: tool.input,
    name: tool.name,
    run: (args, session) => tool.run(args as z.output<S>, session),
  };
}

export function toolsFor(store: Store): ToolDefinition[] {
  return [
    defineTool({
      description: 'Read one order belonging to the signed-in customer.',
      input: z.strictObject({ order_id: z.string() }),
      name: 'get_order',
      run: (args, session) => JSON.stringify(store.getOrder(args.order_id, session)),
    }),
    defineTool({
      description: 'Refund an order, in cents, to the original payment method.',
      input: z.strictObject({ amount_cents: z.int().positive(), order_id: z.string() }),
      name: 'refund_order',
      run: (args, session) => store.refundOrder(args.order_id, args.amount_cents, session),
    }),
    defineTool({
      description: 'Search the published refund policy.',
      input: z.strictObject({ query: z.string() }),
      name: 'search_policy',
      run: (args) => store.searchPolicy(args.query),
    }),
  ];
}
