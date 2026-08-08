---
title: Prompt caching, and what invalidates it
question: The prompt is identical every turn. Why is `cache_read_input_tokens` still zero?
order: 9
practise:
  - ai-cache-prefix-invalidated
  - ai-cache-breakpoint-placement
  - ai-cache-never-reads
sources:
  - author: Anthropic
    title: Prompt caching
    url: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
  - author: OpenAI
    title: Prompt caching
    url: https://developers.openai.com/api/docs/guides/prompt-caching
verified: 2026-08-07
---

Caching is the only lever on a model bill that costs nothing to pull and breaks without saying so.
[What inference costs you](./what-inference-costs.md) prices it. This page is about why the same
18,000 tokens are nearly free on one turn and full price on the next, and it is the Claude API's
mechanics unless it says otherwise. The multipliers were read on the `verified` date.

## The model

**A cache entry is a prefix, and its key is the exact bytes.** You mark one content block with
`cache_control`, and what is stored is everything from the start of the request up to and including
that block. A later request reads that entry only if the whole span matches: Anthropic's wording is
"100% identical prompt segments, including all text and images up to and including the block marked
with cache control". One character different anywhere in the span and there is no entry to read, so
the request writes a new one instead.

**Render order is `tools`, then `system`, then `messages`**, and the three form a hierarchy where a
change at one level invalidates that level and every level after it:

```
tools ──────► system ──────► messages
  │              │               │
  edit a tool    edit the        append a turn
  and all        prompt and      and nothing
  three go       system and      before it
  cold           messages go     moves
                 cold
```

That ordering is why the expensive mistakes are structural rather than careless. Each of these is one
line, none of them reads as a caching change in review, and each costs the whole prefix behind it:

- **A timestamp built into the system prompt.** Every request has a different prefix, so every
  request writes and none reads.
- **A tool list assembled per request**, from a config object or a per-user feature-flag map. Tools
  render first, so a set that varies by user caches across nobody, and one that reorders between
  processes stops caching across a deploy.
- **A session id, a request id or the user's name in the preamble.** The same failure, one line
  above where anyone thinks to look.

**The price is a ratio, and the ratio decides how many reads you need.** A cache write costs 1.25
times base input at the default five-minute lifetime, or twice base input at the one-hour lifetime. A
read costs a tenth either way. So a five-minute entry pays for itself on the first read, 1.25 + 0.1
against 2 for two uncached requests, and a one-hour entry needs two, 2 + 0.2 against 3. The lifetime
is refreshed for free every time the entry is used and runs from the start of the request rather than
the end of the response, so a busy prefix stays warm indefinitely.

You get up to four breakpoints per request, or one `cache_control` at the top level and the API
places it on the last cacheable block. The cache is scoped to the model, so an A/B test across two
models pays two write premiums and reads neither one's entry with the other.

**Every response says which of the two happened.** Three fields in `usage`, and they are the only
honest evidence that any of this is working:

| Field                         | What it counts                                               |
| ----------------------------- | ------------------------------------------------------------ |
| `cache_creation_input_tokens` | tokens written into a new entry, billed at the write premium |
| `cache_read_input_tokens`     | tokens served from an entry, billed at a tenth               |
| `input_tokens`                | everything after the last breakpoint, billed in full         |

A hit reads and writes nothing. A miss writes and reads nothing. Both zero on a request you marked
means no entry exists at all, which is the first trap below. Total input is the three fields added
together, so `input_tokens` on a cached request is the uncached remainder and not the prompt size,
which is the reading that catches dashboards reporting a tenth of their real traffic.

**On OpenAI the prefix rule holds and the controls do not.** Caching there works automatically with
no code change, so on most models there is no breakpoint to place, and the cached count comes back as
`cached_tokens` inside the request's token details rather than as a field of its own. Everything here
about what invalidates a prefix carries over. Nothing about where you put the marker does.

## Worked example

An assistant with a fixed tool list and a long playbook in the system prompt. One breakpoint, on the
last system block, which caches the tools and the system prompt together and leaves every message
free to vary:

```js
const request = {
  model,
  tools, // renders first
  system: [{ type: 'text', text: playbook, cache_control: { type: 'ephemeral' } }],
  messages, // renders last, entirely behind the breakpoint
};
```

Turn one writes the entry and turn two, a minute later, reads it:

```json
{ "input_tokens": 41, "cache_creation_input_tokens": 18204, "cache_read_input_tokens": 0 }
{ "input_tokens": 96, "cache_creation_input_tokens": 0, "cache_read_input_tokens": 18204 }
```

Then somebody adds a line to the playbook so the assistant knows the date:

```js
text: `${playbook}\n\nToday is ${new Date().toISOString()}.`,
```

and turn three, and every turn after it, looks like turn one again:

```json
{ "input_tokens": 96, "cache_creation_input_tokens": 18221, "cache_read_input_tokens": 0 }
```

Nothing errored and the answers are still right. Those 18,000 tokens now cost 1.25 times base input
on every single turn instead of a tenth, which is twelve and a half times more for the same tokens,
and the only signal is a field nobody was watching. The fix is not to drop the date. It is to move it
behind the breakpoint, into the messages, which is where a per-turn value belongs.

## Traps

**You marked a block, nothing errored, and `cache_creation_input_tokens` came back zero.** The prefix
is shorter than the model's minimum cacheable length, and a request under it is processed without
caching and returns no error. That minimum is per model and is not ordered by how new or how large
the model is: 512 tokens on Opus 5, 1,024 on Opus 4.8 and Sonnet 5, 2,048 on Opus 4.7, and 4,096 on
Opus 4.6 and Haiku 4.5. A 3,000-token prefix caches on three of those and silently does not on the
other two, so the number is checked against the model you are actually calling.

**It hit for the first few turns of an agent run and then stopped hitting.** A breakpoint looks back
at most twenty content blocks to find a previous entry, counting itself as the first. A turn that
fans out into several tool calls adds a `tool_use` and a `tool_result` block for each one, so a
handful of calls can push the last write out of range while the prefix is still byte-identical. Four
breakpoints exist for this: leave one on the static prefix and move a second forward through the
conversation as it grows.

**Reads are always zero and the bill went up rather than down.** The breakpoint is sitting on the
part that varies. A prompt with a large shared preamble and a different question at the end caches
nothing when the marker is on the last block: every request stores an entry keyed to its own
question, no request ever reads one, and you have bought the 1.25 premium on the whole preamble. The
marker goes on the last block that is identical on every call, which is the end of the shared part
and not the end of the prompt.
