---
title: MCP servers
question: I am exposing my API to a model. What does an MCP server actually owe its caller?
order: 7
practise:
  - ai-tool-call-has-not-run
  - ai-tool-schema-is-the-contract
  - ai-tool-authorization-boundary
  - auth-guard-nestjs
sources:
  - author: Model Context Protocol
    title: 'Specification 2025-06-18: Tools'
    url: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
  - author: Model Context Protocol
    title: 'Specification 2025-06-18: Overview'
    url: https://modelcontextprotocol.io/specification/2025-06-18/basic
verified: 2026-08-02
---

Model Context Protocol is a standard way for an AI assistant to find out which actions your app
offers and to call them. The caller on the other end is a model. It reads only the descriptions you
wrote, guesses when they are vague, and can be talked into asking for things the person using it
should not get.

## The model

The protocol is small, and most of what makes a server good or bad is API design you have done
before.

**It is JSON-RPC 2.0.** Every message carries `jsonrpc: "2.0"`; requests carry a string or integer
`id` that must not be null and must not repeat within a session, and responses come back with the
same `id` and either `result` or `error`. Clients call `tools/list` to discover, and `tools/call`
with `{ name, arguments }` to invoke. `tools/list` is paginated with `cursor` and `nextCursor`.

**A tool definition is the entire documentation.** The spec's fields are `name`, an optional `title`
for display, a `description`, an `inputSchema` in JSON Schema, an optional `outputSchema`, and
optional `annotations`. There is no other page for the caller to read. If the description does not
say what "search" searches, nothing does.

**There are two error channels and they mean different things.** A protocol error, the JSON-RPC
`error` object, is for an unknown tool, invalid arguments, a server fault. A tool execution error is
a normal `result` with `isError: true` and the explanation in `content`, and it is for the upstream
API failing, invalid input data, business rules. Reaching for the wrong one is how a caller ends up
unable to distinguish "you called this wrong" from "the thing you asked for did not work".

**Outputs can be structured, and then they are checked.** If a tool declares an `outputSchema`, the
server **MUST** return `structuredContent` conforming to it and clients **SHOULD** validate it. That
turns "return whatever" into a contract, which is the point.

**The security section is short and it is all yours.** Servers **MUST** validate every tool input,
implement proper access controls, rate limit invocations and sanitise outputs. Clients are told to
consider tool annotations untrusted unless the server is trusted, and to keep a human able to deny an
invocation. Read that list as what it is: the caller is untrusted input with a schema attached.

## Worked example

A definition and the handler behind it. The interesting lines are the ones about who is asking:

```js
server.tool({
  name: 'search_orders',
  title: 'Search orders',
  description:
    "Search the signed-in customer's orders by status. Returns at most `limit` orders, newest first.",
  inputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['pending', 'shipped', 'cancelled'] },
      limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
    },
    required: ['status'],
  },
});

async function handleSearchOrders({ status, limit = 20 }, session) {
  // Identity comes from the session. It is never an argument, because an
  // argument is something the caller chooses.
  const orders = await db.findOrders({
    customerId: session.customerId,
    status,
    limit: Math.min(limit, 50),
  });

  if (orders.length === 0) {
    return { content: [{ type: 'text', text: `No ${status} orders.` }] };
  }
  return { content: [{ type: 'text', text: format(orders) }] };
}
```

An upstream failure comes back as `{ content: [...], isError: true }`. A caller asking for a status
that is not in the enum is a protocol error, and the schema is what makes that automatic.

## Traps

**One call returns four thousand rows and the request dies.** The tool has no `limit`, which is a
review comment you would have made on an HTTP endpoint without thinking about it. Note that the
spec's pagination covers `tools/list`, the list of tools: bounding what a tool itself returns is
yours to design, and nothing will remind you.

**A `user_id` parameter in the schema.** The description asking the caller to pass the current user
is a request, not a control, and it is being read by something that can be talked into passing
another one. Identity comes from the authenticated session; anything in `arguments` is a claim.

**Errors as prose.** `{ type: 'text', text: 'Something went wrong' }` with `isError` unset tells the
caller nothing went wrong, so it treats the sentence as the answer. Set `isError: true`, say which
thing failed, and say whether retrying is worth it.

**A vague description gets guessed at.** `"search orders"` with one free-text `query` parameter
invites the caller to invent a query language you never implemented. The fix is the same as it is for
a public endpoint: name the parameters, constrain them in the schema, and say in the description what
comes back.
