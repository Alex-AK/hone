import { code, codeProblem, md, type ProblemDraft } from './types';

/**
 * The code around a generative dependency, which is the part that fails in
 * production and the only part that can be graded deterministically offline.
 * No model runs anywhere in here, and nothing in this file is about training,
 * architectures or the statistics underneath them.
 */
export const aiEngineeringProblems: ProblemDraft[] = [
  {
    slug: 'ai-context-window-budget',
    title: 'Room for the answer',
    category: 'ai-engineering',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'short-text',
    prompt: md(
      'The model has a context window of 8,192 tokens, counted across the prompt and the completion together. Your prompt comes to 7,800 tokens.',
      '',
      'How many tokens are left for the completion?'
    ),
    graderConfig: {
      accept: ['392', '392 tokens'],
      acceptPatterns: ['\\b392\\b'],
      nearMisses: {
        '8192': 'That is the whole window. The prompt is already sitting in it.',
        '7800': 'That is the prompt. The question is what it left behind.',
        '0': 'The prompt fits, with room to spare. Subtract it.',
      },
      hints: [
        'The window is one budget, not two.',
        'Whatever the prompt does not use is what the answer gets.',
      ],
    },
    canonicalAnswer: '392',
    solution: md('392 tokens. `8192 - 7800`, because the window is shared by both halves.'),
    explanation:
      'The context window covers the prompt and the completion together, so every token you add to the prompt is a token the answer cannot use. This is the arithmetic behind the most common report on a generative endpoint: the response stops mid-sentence, or mid-JSON. Nothing errored; the window filled up. Conversation history is where it usually goes wrong, because the prompt grows with every turn while the code asking for 500 tokens of output stays the same.',
  },

  {
    slug: 'ai-time-to-first-token',
    title: 'One number hiding two',
    category: 'ai-engineering',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'Your completion endpoint streams, and its p99 latency is 12 seconds. The team wants that under 2, and nobody can find anything slow.',
      '',
      'Name the two measurements that one number is hiding, and say which of them a waiting user actually feels.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'time to first token',
            'first token',
            'ttft',
            'first byte',
            'first chunk',
            'time to first',
          ],
          missingFeedback: 'Name the part of the wait where the user is looking at a blank screen.',
        },
        {
          synonyms: [
            'total',
            'whole response',
            'full response',
            'end to end',
            'generation time',
            'how long the answer is',
            'how many tokens',
            'length of the answer',
            'output length',
            'number of tokens',
            'tokens per second',
          ],
          missingFeedback: 'What is the rest of the twelve seconds made of?',
        },
      ],
      hints: [
        'A streaming response has a beginning and an end, and they are not the same event.',
        'One of the two is mostly decided by how long the answer turned out to be.',
      ],
    },
    canonicalAnswer:
      'It hides time to first token and total time. Time to first token is what the user feels, because that is how long they stare at a blank screen before anything appears. The total is mostly a function of output length, so a long answer looks identical to a slow service.',
    solution: md(
      '- **Time to first token**: queueing, prompt size and the provider. This is the wait the user experiences.',
      '- **Total time**: first token plus output length divided by tokens per second. Mostly a property of the answer, not of your service.',
      '',
      'Alert on the first. Track the second, because it decides cost and connection budget.'
    ),
    explanation:
      'A p99 on total latency for a streaming endpoint pages you when someone asks a question with a long answer, which is not an incident. Time to first token is the half you control and the half the user experiences: it moves when the provider is degraded, when your prompt grew, or when you queued behind your own rate limit. Splitting the two is usually the whole fix for a generative endpoint that "feels slow" and has no slow code in it.',
  },

  {
    slug: 'ai-embedding-model-mismatch',
    title: 'New model, same index',
    category: 'ai-engineering',
    difficulty: 'easy',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      'You upgraded the embedding model used for queries and left the stored document vectors as they were. Both models output 1,536 dimensions, so nothing errors, and the results are now nonsense.',
      '',
      'What has to happen to the stored vectors?'
    ),
    graderConfig: {
      accept: [
        're-embed',
        'reembed',
        're-embed everything',
        're-embed the corpus',
        'rebuild the index',
        'reindex',
        're-index',
        'regenerate the embeddings',
      ],
      acceptPatterns: [
        're-?embed',
        're-?index',
        '(rebuild|regenerate|recompute).{0,20}(index|embedding|vector)',
      ],
      nearMisses: {
        'normalise the vectors':
          'Normalising makes distances comparable within one model, not across two.',
        'normalize the vectors':
          'Normalising makes distances comparable within one model, not across two.',
        nothing: 'The arithmetic still runs, which is the problem. The numbers no longer agree.',
        'retrain the model': 'Nothing here is trained. The fix is to the stored vectors.',
      },
      hints: [
        'The dimensions match, so the maths is valid. The meaning of each coordinate is not.',
        'The embedding model is part of the index, the way a column type is part of a table.',
      ],
    },
    canonicalAnswer: 'Re-embed the whole corpus with the new model.',
    solution: md(
      'Re-embed every stored document with the new model, then switch the query side over.',
      '',
      'Two models produce coordinates that mean different things, so a distance between them is arithmetic without a meaning.'
    ),
    explanation:
      'Vectors from two different models are not comparable even when the dimensionality matches, because the axes are not the same axes. Nothing throws, which is what makes this a silent bug rather than an outage: cosine similarity is happy to compare any two float arrays of the same length. Treat the embedding model as part of the index schema. Changing it is a migration, the corpus is re-embedded first, and query and index switch together.',
  },

  {
    slug: 'ai-idle-timeout-streaming',
    title: 'The timeout that kills a good answer',
    category: 'ai-engineering',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'You put a 30-second request timeout on a streaming completion. Long answers now die at exactly 30 seconds, mid-sentence, and a provider that hangs before sending anything still takes the full 30 seconds to notice.',
      '',
      'Name the kind of timeout that fixes both, and say what you keep alongside it so a stream cannot run forever.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'idle timeout',
            'inactivity',
            'between chunks',
            'since the last chunk',
            'since the last token',
            'inter-token',
            'between tokens',
            'stall',
            'read timeout',
          ],
          missingFeedback: 'What would you measure between one chunk arriving and the next?',
        },
        {
          synonyms: [
            'overall cap',
            'total cap',
            'absolute',
            'hard limit',
            'ceiling',
            'maximum duration',
            'overall budget',
            'total budget',
            'still cap the total',
            'wall clock limit',
          ],
          missingFeedback:
            'An idle timeout alone lets a stream dribbling one token a second run all day. What else stays?',
        },
      ],
      hints: [
        'The problem is that one number is being asked to describe both a healthy long answer and a dead connection.',
        'Measure the gap between chunks rather than the elapsed total.',
        'Keep a second, much larger number so a slow drip still ends.',
      ],
    },
    canonicalAnswer:
      'Use an idle timeout that measures the gap since the last chunk arrived and resets on every chunk, so a healthy long answer stays alive and a silent provider fails in seconds. Keep an overall cap as well, a much larger absolute ceiling on total duration, so a stream that dribbles one token at a time still ends.',
    solution: md(
      '- **Idle timeout**, a few seconds: time since the last chunk, reset on every chunk. A healthy long answer keeps resetting it; a dead connection trips it almost immediately.',
      '- **Overall cap**, minutes: an absolute ceiling on the whole request, so a slow drip cannot hold a connection open forever.',
      '',
      'Both, not either. The idle timeout catches the failure fast, the cap bounds the resource.'
    ),
    explanation:
      'A single request timeout cannot tell "still generating" from "died quietly", because both look like a connection that is open and not finished. An idle timeout can: healthy generation produces chunks continuously, so the gap between them is small and predictable, while a stalled upstream produces nothing at all. Keep the overall cap anyway, because an idle timeout has no opinion about a stream that never stalls and never ends, and that connection is holding a socket, a worker and whatever you allocated per request.',
  },

  {
    slug: 'ai-retry-double-charge',
    title: 'The retry that pays twice',
    category: 'ai-engineering',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A completion request times out after 40 seconds. Your HTTP client is configured to retry on timeouts, so it sends it twice more.',
      '',
      'Say what the provider was most likely doing while your client gave up, and name two things the extra calls just spent.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'still generating',
            'still running',
            'completed',
            'finished',
            'generated',
            'kept going',
            'did the work',
            'succeeded',
            'server does not stop',
            'carried on',
          ],
          missingFeedback:
            'A timeout is your client giving up. What was the other end doing at that moment?',
        },
        {
          synonyms: ['bill', 'charge', 'cost', 'money', 'paid', 'spend', 'token cost', 'invoice'],
          missingFeedback: 'What are you charged for whether or not you ever read the response?',
        },
        {
          synonyms: [
            'rate limit',
            'quota',
            'capacity',
            'concurrency',
            'throughput',
            'queue',
            'headroom',
            'slot',
            'tokens per minute',
          ],
          missingFeedback: 'What else does an extra call consume, that your other requests wanted?',
        },
      ],
      hints: [
        'A timeout tells you nothing about what happened on the server.',
        'Generation is billed by tokens produced, not by responses you managed to read.',
        'The third attempt is also competing with your own traffic for the same limit.',
      ],
    },
    canonicalAnswer:
      'The provider was almost certainly still generating, and probably completed the request: a timeout is the client giving up, not the server stopping. So the two extra calls spent real money, because you are billed for the tokens generated whether or not you read them, and they spent rate limit and concurrency headroom that your other requests needed.',
    solution: md(
      'The first request most likely finished. A client timeout stops your side of the connection; it does not cancel the work.',
      '',
      'The retries spent:',
      '',
      '- **Money**: tokens are billed as they are generated, read or not.',
      '- **Capacity**: rate limit, quota and concurrency that your other traffic was queueing for.',
      '',
      'Retry on connection errors and on 429 and 5xx. A timeout on an expensive, slow call is the case for an idempotency key rather than a blind retry.'
    ),
    explanation:
      'Retrying a GET is nearly free, which is where the habit comes from. Retrying a generation is not: the work is expensive, it is billed on production rather than on delivery, and a timeout is the one failure mode that tells you nothing about whether it succeeded. Worse, retries arrive when the dependency is already struggling, so they are exactly the traffic that turns a slow provider into a rate-limited one. Carry an idempotency key so a retry can be answered from the first result, and give up honestly rather than paying three times for one answer.',
  },

  {
    slug: 'ai-idempotency-key-choice',
    title: 'Keying the expensive call',
    category: 'ai-engineering',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'You want a retried completion to return the first result instead of generating a second one. Two candidates for the idempotency key:',
      '',
      '1. A hash of the prompt.',
      '2. A key the caller generates once per user action and reuses across retries.',
      '',
      'Pick one, and say what goes wrong with the other.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'caller',
            'client generates',
            'per user action',
            'per action',
            'per intent',
            'uuid',
            'the second',
            'option 2',
            'generated once',
          ],
          missingFeedback: 'Which of the two knows when a new attempt is a new intent?',
        },
        {
          synonyms: [
            'ask again',
            'asked twice',
            'same prompt',
            'same question',
            'regenerate',
            'try again',
            'deliberately',
            'legitimate repeat',
            'identical prompt',
            'second answer',
          ],
          missingFeedback:
            'What does a prompt hash do to a user who sends the same prompt again on purpose?',
        },
      ],
      hints: [
        'Both keys deduplicate. The question is what each one thinks "the same request" means.',
        'Users press "try again" on purpose, with the identical prompt.',
      ],
    },
    canonicalAnswer:
      'Use the caller-generated key, created once per user action and reused across retries. Hashing the prompt breaks the case where someone deliberately asks the same question again: an identical prompt is a legitimate repeat, and a prompt hash would serve them the cached first answer instead of regenerating.',
    solution: md(
      'The caller-generated key. It identifies the *intent*, and only the caller knows when a new intent started.',
      '',
      'A prompt hash treats "the user asked the same thing again" as a duplicate, which it is not. It also ignores everything else that makes a request different: temperature, the seed, the tool set, the model.'
    ),
    explanation:
      'Idempotency keys identify an operation, not a payload, and this is the case that makes the difference obvious. Pressing "regenerate" sends a byte-identical prompt and means the opposite of a retry. The rule is the same one that applies to a payments endpoint: the key is minted where the intent is formed, travels unchanged through every retry of that intent, and a new intent gets a new key. The server then stores the completed result under the key and replays it, which also caps the damage when a client retries a call that had already succeeded.',
  },

  {
    slug: 'ai-stream-error-after-200',
    title: 'Failing after you have already said 200',
    category: 'ai-engineering',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'Your endpoint proxies a streaming completion to the browser. Two hundred tokens in, the upstream provider drops the connection.',
      '',
      'The status line went out with the first chunk. Say what that rules out, and how the client is supposed to find out that the answer it is holding is not the whole answer.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'cannot change the status',
            'cannot send a 500',
            'already sent',
            'headers are gone',
            'too late',
            'status is committed',
            'no longer set',
            'already committed',
          ],
          missingFeedback:
            'The status line is the first thing on the wire. What can you no longer do with it?',
        },
        {
          synonyms: [
            'error event',
            'in the stream',
            'in-band',
            'in band',
            'a message in the body',
            'sentinel',
            'terminal event',
            'error message in the stream',
            'event in the body',
            'send an error chunk',
          ],
          missingFeedback: 'If the status cannot carry the failure, what part of the response can?',
        },
        {
          synonyms: [
            'incomplete',
            'partial',
            'truncated',
            'not final',
            'unfinished',
            'discard',
            'do not treat it as complete',
            'not the whole answer',
          ],
          missingFeedback:
            'The client has 200 tokens in hand. What does it need to know about them?',
        },
      ],
      hints: [
        'The response started successfully. That decision has already been transmitted.',
        'Every streaming protocol worth using has a way to say "this is the end" and a way to say "this went wrong".',
        'A client that cannot tell a finished answer from a severed one will show the severed one as final.',
      ],
    },
    canonicalAnswer:
      'It rules out changing the status: the 200 is already committed, so you cannot send a 500 and there are no headers left to set. The failure has to travel in-band, as an error event in the stream itself, and the client has to treat what it holds as partial and incomplete rather than as the finished answer.',
    solution: md(
      'The status is committed the moment the first chunk leaves, so:',
      '',
      '- **Ruled out**: a 500, an error body, any header. All of those went out already, saying 200.',
      '- **In-band instead**: an explicit error event in the stream, and a distinct completion event on the happy path so the two are distinguishable.',
      '- **On the client**: what arrived is partial. Mark it, do not present it as the final answer, and do not cache it.'
    ),
    explanation:
      'Streaming trades the ability to fail cleanly for the ability to start early, and every streaming protocol pays for it the same way: success and failure both become messages inside the body. This is why a stream needs an explicit terminal event rather than relying on the connection closing, because a closed connection is exactly what a network failure also looks like. A client that infers "done" from "the socket ended" cannot tell a complete answer from a truncated one, and it will show a half-sentence as if you meant it.',
  },

  {
    slug: 'ai-nearest-neighbour-always-returns',
    title: 'Five results for a question about nothing',
    category: 'ai-engineering',
    difficulty: 'medium',
    relevance: 'foundational',
    type: 'explain',
    prompt: md(
      'Your vector search returns the top 5 chunks for every query. Someone asks about a subject the corpus never mentions, gets 5 chunks anyway, and the model answers confidently from them.',
      '',
      'Say what a nearest-neighbour search actually promises, and name what you have to add to be able to answer "nothing found".'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'nearest',
            'closest',
            'ranking',
            'ranks',
            'relative',
            'sorted',
            'always returns',
            'no notion of relevance',
            'not relevance',
            'order not relevance',
          ],
          missingFeedback:
            'What does "top 5" mean to the index: that they are relevant, or something weaker?',
        },
        {
          synonyms: [
            'threshold',
            'cutoff',
            'cut-off',
            'minimum score',
            'minimum similarity',
            'distance limit',
            'score filter',
            'rerank',
            're-rank',
            'filter by score',
          ],
          missingFeedback: 'What turns "the closest five" into "nothing close enough"?',
        },
      ],
      hints: [
        'k-nearest-neighbour is a sort, and a sort of anything is never empty.',
        'The index has no opinion about whether the closest thing is close.',
        'You need a number the score has to beat, and that number has to be measured against real queries rather than guessed.',
      ],
    },
    canonicalAnswer:
      'It promises the nearest k vectors and nothing more: it ranks, it does not judge relevance, so it always returns 5 as long as the corpus has 5 chunks. To answer "nothing found" you have to add a score threshold, a distance cutoff below which a result is discarded, usually with a reranking step over the survivors.',
    solution: md(
      'A k-NN query is a **sort**, not a filter. It returns the closest k vectors in the corpus, and "closest" carries no promise of "close".',
      '',
      'To get an empty result you add a **score threshold**: a minimum similarity a chunk must clear to be passed on, often with a reranker over what survives. The number is corpus-specific and model-specific, so it is measured against real queries rather than picked.'
    ),
    explanation:
      'This is the failure that makes a retrieval system look like a hallucination problem. The model was handed five chunks about something else and did what it was asked with them. Nothing in the index was broken; it answered the question it was asked, which was "what are the five nearest vectors", not "what is relevant here". The threshold is the part that has to be built and measured, and it is why an eval set comes before tuning: without one, you are choosing a cutoff by feel and finding out in production.',
  },

  {
    slug: 'ai-chunk-overlap-boundary',
    title: 'The answer nobody retrieved',
    category: 'ai-engineering',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'Documents are split into 500-token chunks with no overlap. The sentence that answers a question spans the end of chunk 7 and the start of chunk 8, and retrieval returns neither: both halves are about half a topic.',
      '',
      'Name the two changes to the chunking that make this rarer, and say what each one costs.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'overlap',
            'sliding window',
            'stride',
            'repeat the end',
            'repeat the tail',
            'shared tokens',
            'overlapping chunks',
          ],
          missingFeedback: 'What would let chunk 8 contain the end of chunk 7?',
        },
        {
          synonyms: [
            'structure',
            'sentence',
            'paragraph',
            'heading',
            'section',
            'semantic',
            'natural boundaries',
            'do not split mid-sentence',
            'split on boundaries',
          ],
          missingFeedback:
            'A fixed token count cuts wherever it lands. What should decide where a chunk ends instead?',
        },
        {
          synonyms: [
            'index size',
            'index bigger',
            'bigger index',
            'bigger',
            'more chunks',
            'storage',
            'duplicat',
            'cost',
            'uneven',
            'uniform',
            'variable size',
            'more expensive',
          ],
          missingFeedback: 'Both changes make the index bigger or messier. Say how.',
        },
      ],
      hints: [
        'A fixed size is a guess about where meaning ends.',
        'One fix makes the cut survivable; the other makes it land in a better place.',
        'Neither is free: say what you pay in index size or in chunk uniformity.',
      ],
    },
    canonicalAnswer:
      'Add overlap, so each chunk repeats the tail of the one before and a sentence cut in half survives in the neighbour; that duplicates tokens and makes the index bigger. And split on structure, at sentence, paragraph or heading boundaries rather than at a fixed token count, so a cut is less likely to land mid-sentence; that costs you uniform chunk size, which makes chunks variable and harder to budget for.',
    solution: md(
      '- **Overlap**: each chunk repeats the last n tokens of the previous one, so a sentence cut in half still appears whole in the neighbour. Cost: duplicated tokens, a bigger index, and near-duplicate hits to deduplicate.',
      '- **Split on structure**: sentence, paragraph or heading boundaries instead of a fixed count. Cost: chunk sizes stop being uniform, so the prompt budget has to cope with variable ones.',
      '',
      'Neither eliminates the problem. They make the cut survivable and make it land somewhere sensible.'
    ),
    explanation:
      'Fixed-size chunking is a guess about where meaning ends, and at scale a fixed count will eventually cut through the one sentence that answers the question. This is worth knowing because the retrieval step is usually where a RAG system is wrong: the model can only be as right as the chunks it was handed, so a confident wrong answer is far more often a chunking or ranking bug than a model failure. Debug retrieval first, by reading what was actually retrieved.',
  },

  {
    slug: 'ai-tool-schema-is-the-contract',
    title: 'A tool that returns everything',
    category: 'ai-engineering',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'An MCP server exposes a `search_orders` tool. Its description reads "search orders", it takes a single `query` string, and it returns every matching row in one response. A test against real data returned 4,000 orders and the call failed.',
      '',
      'Name the two things this tool is missing, both of which you would have caught reviewing an HTTP endpoint.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'pagination',
            'paginate',
            'limit',
            'page size',
            'bounded',
            'cap the results',
            'cursor',
            'top n',
            'max results',
          ],
          missingFeedback:
            '4,000 rows in one response is a problem you have already solved on an HTTP endpoint. What did you add there?',
        },
        {
          synonyms: [
            'description',
            'documented',
            'schema',
            'parameters',
            'arguments',
            'input schema',
            'json schema',
            'types',
            'what it does',
            'contract',
          ],
          missingFeedback:
            'The caller cannot read your source or ask you a question. What is the entire contract it has to work from?',
        },
      ],
      hints: [
        'Read the tool as an endpoint. What would a reviewer say about a route that returns every row?',
        'The second problem is not the response at all: it is what the caller had to work from before calling.',
      ],
    },
    canonicalAnswer:
      'It is missing a bound on the result: pagination, or at least a limit and a cursor, so one call cannot return 4,000 rows. And it is missing a real contract: the description says nothing about what it searches or what it returns, and a single untyped `query` string is not an input schema a caller can use correctly.',
    solution: md(
      '- **A bounded result**: a `limit`, a cursor or a page, and a documented maximum. An unbounded list is an outage waiting for a big customer.',
      '- **A usable contract**: a description that says what is searched and what comes back, and a typed input schema with named parameters instead of one free-text `query`.',
      '',
      'The description and the schema are the whole of the documentation. There is no other page to read.'
    ),
    explanation:
      'A tool definition is an API whose client cannot read your source, your changelog or your mind, and whose only documentation is the description and the JSON Schema you shipped with it. Everything you already know applies: bound the response, name the parameters, return structured errors rather than prose. The one genuinely new part is the audience, because a caller that finds the description vague will not file a ticket. It will guess, and it will guess plausibly.',
  },

  {
    slug: 'ai-tool-authorization-boundary',
    title: 'The tool that trusted its caller',
    category: 'ai-engineering',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'A `delete_invoice` tool takes `invoice_id` and `user_id`. Its description says to pass the id of the current user, and the handler deletes any invoice whose id matches.',
      '',
      'Say where the permission check belongs, and why the description is not one.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'server',
            'handler',
            'inside the tool',
            'the boundary',
            'session',
            'from the connection',
            'server side',
            'not the argument',
            'authenticated context',
          ],
          missingFeedback: 'Which side of the boundary can be trusted to have actually checked?',
        },
        {
          synonyms: [
            'not enforcement',
            'instruction',
            'just text',
            'advisory',
            'can pass anything',
            'untrusted input',
            'attacker',
            'injection',
            'ignore it',
            'no guarantee',
            'suggestion',
          ],
          missingFeedback:
            'What can a caller do with a parameter you politely asked it to fill in honestly?',
        },
      ],
      hints: [
        'A tool call is input that arrived over the network, like any other.',
        'Ask who gets to decide the value of `user_id`.',
      ],
    },
    canonicalAnswer:
      'The check belongs on the server, in the tool handler, against the identity the session already carries: the invoice is deleted only if it belongs to the authenticated user. The description is not enforcement, it is an instruction, and a caller can pass anything it likes in `user_id`. Treating it as untrusted input is the only safe reading.',
    solution: md(
      'In the handler, against the identity the server already holds.',
      '',
      '- Drop `user_id` from the schema. Identity comes from the authenticated session, never from an argument.',
      '- Load the invoice, check ownership, then delete. Same check you would write behind an HTTP route.',
      '',
      'A description is a request. It is read by something that can decline.'
    ),
    explanation:
      'A tool call is untrusted input that arrived over the network, exactly like a query parameter, and the same rule applies: anything the caller supplies is a claim, not a fact. A model can be talked into passing a different id, and a client that is not a model can simply do it. The instruction in the description is not a control, because controls are things the server enforces. If the answer to "what stops this being abused?" is a sentence of English, there is no answer.',
  },

  codeProblem({
    slug: 'ai-stream-partial-chunk',
    title: 'The last word goes missing',
    category: 'ai-engineering',
    difficulty: 'hard',
    relevance: 'daily',
    prompt: md(
      'A completion stream arrives as bytes, not as messages. Each event is a line of the form `data: <text>\\n`, but a chunk from the network can end anywhere, including halfway through a line.',
      '',
      'Write `readEvents(buffer, chunk)`, which takes whatever was left over from last time plus the new chunk, and returns the complete events it can now produce along with what is still incomplete:',
      '',
      code(
        'js',
        "readEvents('', 'data: hello\\ndata: wor')",
        "// { events: ['hello'], buffer: 'data: wor' }"
      ),
      '',
      'Return the text after `data: ` for every complete line, ignore lines that are blank or do not start with `data: `, and put the unterminated remainder in `buffer`.'
    ),
    starter: 'function readEvents(buffer, chunk) {\n  \n}',
    tests: [
      {
        name: 'holds back a line the chunk did not finish',
        expression: "readEvents('', 'data: hello\\ndata: wor')",
        expected: { events: ['hello'], buffer: 'data: wor' },
      },
      {
        name: 'completes a line split across two chunks',
        expression:
          "(() => { const first = readEvents('', 'data: hel'); return readEvents(first.buffer, 'lo\\n'); })()",
        expected: { events: ['hello'], buffer: '' },
      },
      {
        name: 'ignores blank lines between events',
        expression: "readEvents('', 'data: a\\n\\ndata: b\\n')",
        expected: { events: ['a', 'b'], buffer: '' },
      },
      {
        name: 'returns no events when nothing is terminated yet',
        expression: "readEvents('', 'da')",
        expected: { events: [], buffer: 'da' },
      },
      {
        name: 'keeps an empty payload rather than dropping it',
        expression: "readEvents('', 'data: \\n')",
        expected: { events: [''], buffer: '' },
      },
    ],
    reference: md(
      'function readEvents(buffer, chunk) {',
      "  const lines = (buffer + chunk).split('\\n');",
      "  const rest = lines.pop() ?? '';",
      '  const events = [];',
      '  for (const line of lines) {',
      "    if (line.startsWith('data: ')) events.push(line.slice(6));",
      '  }',
      '  return { events, buffer: rest };',
      '}'
    ),
    hints: [
      'Work on `buffer + chunk`, not on `chunk` alone.',
      'Split on the newline. The last piece is the only one that might be unfinished.',
      '`split` on a string ending in a newline leaves an empty final piece, which is exactly the empty buffer you want.',
    ],
    explanation:
      'A network chunk is a chunk of bytes, and it has no relationship to your message boundaries: it ends where the socket said so. Any parser that reads a chunk in isolation loses whatever was straddling the edge, which shows up as the last word of a response going missing, or a JSON payload that fails to parse once in a hundred requests. The fix is the same for any framed stream: keep a buffer, take only the complete frames out of it, and carry the remainder into the next read. `TextDecoder` has the same problem one level down, which is what its `{ stream: true }` option is for.',
  }),

  codeProblem({
    slug: 'ai-eval-assert-invariants',
    title: 'Asserting on an answer you cannot predict',
    category: 'ai-engineering',
    difficulty: 'medium',
    relevance: 'daily',
    prompt: md(
      'A model is asked to answer from a set of documents and reply as JSON: an `answer` string, and a `sources` array of document ids it used. The wording changes every run, so an exact-match assertion is useless.',
      '',
      'Write `gradeCitation(raw, allowedIds)`, which grades one output on the properties that do not vary. It returns `{ pass: true, reason: null }` when the output is usable, or `{ pass: false, reason }` with the first failure, using exactly these reasons:',
      '',
      '- `not-json` — `raw` does not parse as JSON',
      '- `no-answer` — `answer` is missing, not a string, or blank',
      '- `no-sources` — `sources` is missing, not an array, or empty',
      '- `unknown-source` — a source is not in `allowedIds`',
      '',
      'Check them in that order.'
    ),
    starter: 'function gradeCitation(raw, allowedIds) {\n  \n}',
    tests: [
      {
        name: 'passes a well-formed answer',
        expression:
          'gradeCitation(\'{"answer":"Ship it on Friday.","sources":["doc-2"]}\', [\'doc-1\', \'doc-2\'])',
        expected: { pass: true, reason: null },
      },
      {
        name: 'passes different wording with the same shape',
        expression:
          'gradeCitation(\'{"answer":"Friday, per the release note.","sources":["doc-1","doc-2"]}\', [\'doc-1\', \'doc-2\'])',
        expected: { pass: true, reason: null },
      },
      {
        name: 'fails prose that is not JSON',
        expression: "gradeCitation('Sure! Here is the answer:', ['doc-1'])",
        expected: { pass: false, reason: 'not-json' },
      },
      {
        name: 'fails a blank answer',
        expression: 'gradeCitation(\'{"answer":"  ","sources":["doc-1"]}\', [\'doc-1\'])',
        expected: { pass: false, reason: 'no-answer' },
      },
      {
        name: 'fails an empty source list',
        expression: 'gradeCitation(\'{"answer":"Friday.","sources":[]}\', [\'doc-1\'])',
        expected: { pass: false, reason: 'no-sources' },
      },
      {
        name: 'fails a source nobody supplied',
        expression:
          'gradeCitation(\'{"answer":"Friday.","sources":["doc-9"]}\', [\'doc-1\', \'doc-2\'])',
        expected: { pass: false, reason: 'unknown-source' },
      },
    ],
    reference: md(
      'function gradeCitation(raw, allowedIds) {',
      '  let parsed;',
      '  try {',
      '    parsed = JSON.parse(raw);',
      '  } catch {',
      "    return { pass: false, reason: 'not-json' };",
      '  }',
      '',
      "  if (typeof parsed?.answer !== 'string' || parsed.answer.trim() === '') {",
      "    return { pass: false, reason: 'no-answer' };",
      '  }',
      '  if (!Array.isArray(parsed.sources) || parsed.sources.length === 0) {',
      "    return { pass: false, reason: 'no-sources' };",
      '  }',
      '  if (!parsed.sources.every((id) => allowedIds.includes(id))) {',
      "    return { pass: false, reason: 'unknown-source' };",
      '  }',
      '',
      '  return { pass: true, reason: null };',
      '}'
    ),
    hints: [
      '`JSON.parse` throws on prose, so the first check is a try/catch.',
      'Every other check is about shape: a non-blank string, a non-empty array, and membership.',
      'Nothing here looks at the wording of the answer, which is the point.',
    ],
    explanation:
      'You cannot assert on text a model generates, but almost everything you actually need from it is structural: it parsed, it filled the fields, it cited something, and everything it cited exists. Those hold on every run, so they make a test rather than a vibe. This is what turns "the output looked fine" into a suite you can run on every prompt change, and the invariant that catches the most real bugs is the last one: a citation to a document that was never in the context is the cleanest signal you have that the answer was invented.',
  }),

  {
    slug: 'ai-eval-exact-match-reword',
    title: 'The suite went red and the answers are right',
    category: 'ai-engineering',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'An eval for a support bot asserts that the answer equals "You can return an item within 30 days of delivery." Somebody reworded the system prompt this morning, and every case in the suite is now red while every answer is still correct.',
      '',
      'Say what the assertion should check instead, and what it has to stop checking.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'contains',
            'includes',
            '30 days',
            'the number',
            'the fact',
            'substring',
            'invariant',
            'structure',
            'shape',
            'key fact',
          ],
          missingFeedback: 'Name the part of that sentence a correct answer has to keep.',
        },
        {
          synonyms: [
            'exact',
            'exact string',
            'exact match',
            'wording',
            'phrasing',
            'word for word',
            'verbatim',
            'equality',
            'equals',
            'whole sentence',
            'full sentence',
          ],
          missingFeedback: 'Something in the current assertion cannot survive a reword. Name it.',
        },
      ],
      hints: [
        'The answers that came back this morning are right, so the test is asserting something other than correctness.',
        'Ask what a correct answer has to contain, and how much of the rest you actually care about.',
      ],
    },
    canonicalAnswer:
      'Assert that the answer contains the fact that matters, the 30 days, and let the rest of the sentence vary. It has to stop asserting the exact string, because wording changes on every prompt edit and every model upgrade without the answer being wrong.',
    solution: md(
      'Assert on what a correct answer has to carry, which here is `30 days`, and let the wording move.',
      '',
      '- **Stop asserting** the exact string. It fails on a comma, on a prompt edit and on a model upgrade.',
      '- **Start asserting** the fact, plus whatever structure you rely on: it parsed, the fields are there, the number is in it.',
      '',
      'A test that fails while the system is right teaches the team to stop reading the test.'
    ),
    explanation:
      'An exact-match assertion on prose tests the wording of an answer, which is the one property that is allowed to change: a reworded prompt, a model upgrade or an added comma all break it while the system is behaving exactly as intended. What survives is the fact the answer has to carry, which is why the cheap rungs of an eval suite are a containment check and a structural one rather than equality. The cost of getting this wrong is not a red build. It is a suite nobody reads, and a suite nobody reads is not a safety net.',
  },

  codeProblem({
    slug: 'ai-json-came-wrapped',
    title: 'The JSON came wrapped',
    category: 'ai-engineering',
    difficulty: 'easy',
    relevance: 'daily',
    prompt: md(
      'A model was asked to reply with a JSON object and nothing else. Most of the time it does. Sometimes it puts the object inside a fenced code block, and sometimes it writes a sentence of introduction first.',
      '',
      'Write `readJson(reply)`, which returns the parsed object, or `null` when the reply holds nothing that parses. It never throws.'
    ),
    starter: 'function readJson(reply) {\n  \n}',
    tests: [
      {
        name: 'parses a reply that is only the object',
        expression: 'readJson(\'{"total":42}\')',
        expected: { total: 42 },
      },
      {
        name: 'finds the object under a sentence and a code fence',
        expression:
          'readJson(\'Here you go:\\n```json\\n{"total":42}\\n```\\nLet me know if you need more.\')',
        expected: { total: 42 },
      },
      {
        name: 'returns null for a reply with no object in it',
        expression: "readJson('I could not find that order.')",
        expected: null,
      },
      {
        name: 'returns null when the object was cut off',
        expression: 'readJson(\'{"total":4\')',
        expected: null,
      },
    ],
    reference: md(
      'function readJson(reply) {',
      "  const start = reply.indexOf('{');",
      "  const end = reply.lastIndexOf('}');",
      '  if (start === -1 || end < start) return null;',
      '',
      '  try {',
      '    return JSON.parse(reply.slice(start, end + 1));',
      '  } catch {',
      '    return null;',
      '  }',
      '}'
    ),
    hints: [
      'The caller wants a value it can branch on, so `JSON.parse` cannot be the outermost thing here.',
      'Everything outside the object is prose. Find where the object starts and where it ends.',
    ],
    explanation:
      'The reply is text until you turn it into data, and the code that turns it into data is the only place that knows the shape you asked for. A parse that throws there takes the request down over a formatting habit, so it returns a value the caller can branch on instead. Digging the object out of the prose is a heuristic and stays one: it is what you have when the provider cannot constrain the output, and it is the reason to turn constrained decoding on wherever it exists.',
  }),

  {
    slug: 'ai-structured-output-stopped-early',
    title: 'Valid schema, invalid JSON',
    category: 'ai-engineering',
    difficulty: 'easy',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      "Your extraction endpoint uses the provider's structured-output mode and the provider accepted the schema. Almost every response parses. About one in fifty arrives as JSON that ends in the middle of a string, and `JSON.parse` throws on it. The call returned 200 and set no error.",
      '',
      'Which field of the response says why the model stopped?'
    ),
    graderConfig: {
      accept: ['stop_reason', 'stop reason', 'the stop reason', 'finish_reason', 'finish reason'],
      acceptPatterns: ['(stop|finish)[ _-]?reason'],
      nearMisses: {
        refusal: 'That is one of the values it can carry. Name the field you read to find it.',
        usage: 'That tells you what the call cost, not why it ended.',
        error: 'There is no error. It returned 200 and stopped early anyway.',
      },
      hints: [
        'The call succeeded. Something else decided the response was over.',
        'Every provider names the stop condition in a field of its own, next to the content.',
      ],
    },
    canonicalAnswer: 'stop_reason',
    solution: md(
      '`stop_reason` on Claude, `finish_reason` on OpenAI.',
      '',
      'Two stop conditions end a response early and both come back as a 200: the output token cap, and a refusal. Neither is obliged to leave you a document that matches the schema.'
    ),
    explanation:
      "Constrained decoding restricts what the model may emit next, so the document is well formed while it is being written. It cannot make the writing finish. Hitting the output cap truncates it mid-token, and a refusal is not obliged to follow your schema at all, so a schema the provider accepted is still not a promise that today's response parses. Read the stop condition before you read the content, and treat an early stop as a failed call rather than as data.",
  },

  {
    slug: 'ai-tool-call-has-not-run',
    title: 'The refund that has not happened',
    category: 'ai-engineering',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'A support assistant is given a `refund_order` tool. The response comes back with a stop reason of `tool_use` and one block naming `refund_order` with `{ "order_id": "A-1187" }`.',
      '',
      "Say what has happened to the customer's money at this point, and what has to happen for the refund to exist."
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'nothing',
            'not been refunded',
            'no refund',
            'has not run',
            'hasnt run',
            'not run',
            'not executed',
            'has not been called',
            'not called',
            'no money has moved',
            'nothing has happened',
          ],
          missingFeedback: 'Say what the model is able to execute on its own.',
        },
        {
          synonyms: [
            'your code',
            'you run',
            'your handler',
            'your application',
            'your app',
            'your server',
            'run the tool',
            'execute it',
            'call it yourself',
            'you have to call',
          ],
          missingFeedback: 'Somebody still has to move the money. Who?',
        },
      ],
      hints: [
        'A tool call is something the model wrote, not something it did.',
        'Ask which process in this system is able to reach the payment provider.',
      ],
    },
    canonicalAnswer:
      'Nothing has happened to the money. The model emitted a request to call `refund_order` and cannot execute anything itself. Your code has to run the refund and send the outcome back as a tool result before the model can say a word about it.',
    solution: md(
      'Nothing. The turn stopped with a request, and requests do not move money.',
      '',
      '- Your code reads the block, checks it, and runs the refund.',
      '- The outcome goes back as a tool result carrying the same id, and the model takes another turn.',
      '',
      'Until that happens the customer has been promised nothing and charged nothing.'
    ),
    explanation:
      'The model produces a request to call something, and the only thing that has happened when it arrives is that a request exists. Running it is your loop: your code executes the call, sends the outcome back as a tool result, and lets the model take the next turn. Reading the block as a completed action is how an assistant ends up telling a customer their refund is on the way when nothing was refunded, and it is the same mistake as trusting any other input that arrived over the network.',
  },

  codeProblem({
    slug: 'ai-tool-results-one-message',
    title: 'Two calls, one turn',
    category: 'ai-engineering',
    difficulty: 'medium',
    relevance: 'daily',
    prompt: md(
      'One turn came back asking for two tool calls at once, as blocks of `{ id, name, input }`. You have `run(name, input)`, which returns a string or throws.',
      '',
      'Write `toolResults(blocks, run)`, which runs each call and returns the one message to send back: `{ role: "user", content }`, with an entry per block in the order they arrived.',
      '',
      'Each entry is `{ type: "tool_result", tool_use_id, content }`, and an entry whose call threw carries `is_error: true` with the thrown message as its `content`.'
    ),
    starter: 'function toolResults(blocks, run) {\n  \n}',
    tests: [
      {
        name: 'returns one message holding a result per call',
        expression:
          "toolResults([{ id: 't1', name: 'get_total', input: {} }, { id: 't2', name: 'get_status', input: {} }], (name) => 'ran:' + name)",
        expected: {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 't1', content: 'ran:get_total' },
            { type: 'tool_result', tool_use_id: 't2', content: 'ran:get_status' },
          ],
        },
      },
      {
        name: 'marks a call that threw instead of dropping it',
        expression:
          "toolResults([{ id: 't1', name: 'ok', input: {} }, { id: 't2', name: 'boom', input: {} }], (name) => { if (name === 'boom') throw new Error('upstream timed out'); return 'fine'; })",
        expected: {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 't1', content: 'fine' },
            {
              type: 'tool_result',
              tool_use_id: 't2',
              content: 'upstream timed out',
              is_error: true,
            },
          ],
        },
      },
      {
        name: 'hands each call its own input',
        expression:
          "toolResults([{ id: 't1', name: 'get_total', input: { orderId: 'A-1' } }], (name, input) => input.orderId)",
        expected: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 't1', content: 'A-1' }],
        },
      },
      {
        name: 'keeps both results in the same message',
        expression:
          "toolResults([{ id: 't1', name: 'a', input: {} }, { id: 't2', name: 'b', input: {} }], () => 'x').content.length",
        expected: 2,
      },
    ],
    reference: md(
      'function toolResults(blocks, run) {',
      '  const content = blocks.map((block) => {',
      '    try {',
      '      return {',
      "        type: 'tool_result',",
      '        tool_use_id: block.id,',
      '        content: run(block.name, block.input),',
      '      };',
      '    } catch (err) {',
      '      return {',
      "        type: 'tool_result',",
      '        tool_use_id: block.id,',
      '        content: err.message,',
      '        is_error: true,',
      '      };',
      '    }',
      '  });',
      '',
      "  return { role: 'user', content };",
      '}'
    ),
    hints: [
      'Nothing has run when the blocks arrive. `run` is the only thing here that executes anything.',
      'A call that threw is still an answer the model is waiting for.',
      '`tool_use_id` is the only thing tying a result back to the call that asked for it.',
    ],
    explanation:
      'Every call the turn asked for is answered together in the next message, and that is a rule rather than a preference: a `tool_use` block left without a result is a malformed conversation, and the API says so. A call that failed is still a result, so it goes back marked as an error with a message worth reading, where the model can adapt to it. Letting it throw instead ends the conversation rather than the call, and a call you decided not to run needs a result too, saying that.',
  }),

  {
    slug: 'ai-cache-prefix-invalidated',
    title: 'Three edits, one cache',
    category: 'ai-engineering',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'short-text',
    prompt: md(
      'An assistant sends the same request shape every turn: a `tools` array, then a system prompt, then the conversation. One `cache_control` breakpoint sits on the last system block, and cache reads were working.',
      '',
      'Three changes shipped this week:',
      '',
      '1. A new tool was appended to the end of the `tools` array.',
      '2. The system prompt gained a line reading `Today is 2026-08-07.`, rebuilt on every request.',
      '3. The questions users type got longer.',
      '',
      'Which one of the three leaves the cache still able to hit?'
    ),
    graderConfig: {
      accept: ['3', 'the third', 'the third one', 'change 3', 'the longer questions'],
      acceptPatterns: ['^\\s*(the\\s+)?(third|3)\\b', 'longer\\s+question'],
      nearMisses: {
        '1': 'Tools render before the system prompt, so appending one changes bytes ahead of the breakpoint and everything behind it goes cold.',
        '2': 'A line rebuilt per request sits inside the cached span, so every request writes a fresh entry and none reads one.',
        '1 and 2': 'Both of those do invalidate it. The question is which of the three does not.',
        '2 and 3': 'The date does invalidate it. The longer questions do not.',
        'all three':
          'One of them lands entirely behind the breakpoint. Which part of the request renders last?',
        none: 'Two of them change bytes before the breakpoint, and that is enough.',
      },
      closeSubstrings: {
        'new tool':
          'Appending a tool still changes `tools`, and `tools` renders before both of the other two.',
        date: 'A date rebuilt per request is inside the cached span, so it costs you the whole prefix.',
      },
      hints: [
        'Everything before the breakpoint is the cache key. Ask which of the three edits lands there.',
        '`tools` renders first, then `system`, then `messages`.',
      ],
    },
    canonicalAnswer: '3',
    solution: md(
      '3. The questions live in `messages`, which renders after the breakpoint, so they are free to vary.',
      '',
      '- **1** changes `tools`, which renders first. A tool edit invalidates the tools cache and everything built on top of it.',
      '- **2** changes the system prompt, which is inside the cached span. Rebuilt per request, it means every call writes a new entry and reads none.'
    ),
    explanation:
      'Render order is `tools`, then `system`, then `messages`, and a change at one level invalidates that level and every level after it. That is what makes the two expensive edits here look free: appending a tool reads as additive, a date line reads as a one-line copy change, and both sit ahead of the breakpoint. Anything that varies per request belongs behind the last breakpoint, which is why a per-turn value goes in the messages rather than in the preamble. The evidence is in `usage` either way: a working prefix reads on every turn but the first, and a broken one writes on every single one.',
  },

  {
    slug: 'ai-cache-breakpoint-placement',
    title: 'Where the marker goes',
    category: 'ai-engineering',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'An extraction endpoint sends the same 15,000-token instruction block and few-shot examples on every call, then the document to extract from, which is different every time. You have one `cache_control` breakpoint to place.',
      '',
      'Say which block it goes on, and what you get if you put it on the last block instead.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'shared',
            'static',
            'instruction',
            'few-shot',
            'few shot',
            'example',
            'before the document',
            'end of the shared',
            'fixed part',
            'unchanging',
            'identical on every',
            'same on every',
          ],
          missingFeedback: 'Name the part of the prompt that is byte-identical on every call.',
        },
        {
          synonyms: [
            'writes a new',
            'write a new',
            'new entry every',
            'its own entry',
            'own document',
            'never read',
            'never reads',
            'no read',
            'never hit',
            'nothing ever reads',
            'always writes',
            'writes every',
            'miss',
          ],
          missingFeedback:
            'The document is different every time. What does an entry keyed to it give you on the next call?',
        },
      ],
      hints: [
        'The key is everything from the start of the request up to and including the block you marked.',
        'Anything after the breakpoint can change without costing you the entry. Anything before it cannot.',
      ],
    },
    canonicalAnswer:
      'It goes on the last block of the shared instruction and few-shot section, just before the document, because the key is everything up to and including the marked block and everything after it is free to vary. Put it on the last block instead and every request writes a new entry keyed to its own document, so no request ever reads one and you pay the write premium on 15,000 tokens every call.',
    solution: md(
      'On the last block of the instructions and examples, immediately before the document.',
      '',
      '- **Why there**: the key is everything up to and including the marked block, so the marker goes at the end of the part that never changes. Everything after it is then free to vary.',
      '- **On the last block instead**: each request stores an entry keyed to its own document, nothing ever reads one, and you have bought the write premium on 15,000 tokens per call. The bill goes up, not down.'
    ),
    explanation:
      'A breakpoint is not a request to cache what follows it. It marks where the cached prefix ends, so the useful placement is always the boundary between what repeats and what does not. Getting it backwards is worse than not caching at all: an entry nobody can read still costs 1.25 times base input to write, so the endpoint pays a premium on every call for a feature it is not using. Check it the same way you check anything else here, by reading `cache_read_input_tokens` on the second request rather than by reasoning about where the marker feels right.',
  },

  {
    slug: 'ai-cache-never-reads',
    title: 'Writing the cache, never reading it',
    category: 'ai-engineering',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A support assistant sends a 12,000-token system prompt with a `cache_control` breakpoint on it, and the endpoint is called several times a second. Every response comes back with `cache_creation_input_tokens: 12043` and `cache_read_input_tokens: 0`.',
      '',
      'Say what those two numbers together tell you, and name what to go looking for in the code that builds the prompt.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'writing',
            'writes',
            'wrote',
            'never read',
            'never reads',
            'no read',
            'not reading',
            'never hit',
            'no hit',
            'miss',
            'new entry',
            'fresh entry',
            'rewrit',
            'paying the write',
            'write premium',
          ],
          missingFeedback:
            'One field is non-zero on every call and the other is never non-zero. Say what that means is happening to the entry.',
        },
        {
          synonyms: [
            'changes on every',
            'changes every',
            'differs',
            'not identical',
            'byte-identical',
            'byte identical',
            'varies',
            'varying',
            'interpolat',
            'timestamp',
            'date',
            'uuid',
            'session id',
            'request id',
            'user id',
            'per request',
            'per-request',
            'rebuilt',
            'not the same',
          ],
          missingFeedback:
            'A read needs the bytes before the breakpoint to match exactly. What would have to be true of this prompt for every call to write a new entry?',
        },
      ],
      hints: [
        'One of the two numbers being zero on every call is the finding. Say which entry is being made and which is being used.',
        'It is called several times a second, so the five-minute lifetime has not expired between calls.',
        'A read needs the bytes before the breakpoint to be identical. Go and find the ones that are not.',
      ],
    },
    canonicalAnswer:
      'Every call is writing a new cache entry and none of them ever reads one, so the cache misses every time and you pay the write premium instead of a tenth. It is called several times a second, so the lifetime is not the cause: something inside the cached span changes on every request, a timestamp or a session id or a prompt rebuilt in a different order each time.',
    solution: md(
      'The entry is written on every call and read on none of them, so those 12,000 tokens cost 1.25 times base input every time instead of a tenth.',
      '',
      '- **Not the lifetime.** Several calls a second is well inside the five-minute default, and the lifetime is refreshed for free on every use.',
      '- **So the prefix differs.** Something in the cached span is rebuilt per request: a timestamp, a session or user id, or a non-deterministic serialisation of the tool list or config.',
      '',
      'Diff the rendered prefix of two consecutive requests. It is usually one line nobody thought of as prompt content.'
    ),
    explanation:
      'These two fields are the whole diagnostic, and they answer different questions: creation is what you paid a premium to store, read is what you got back for a tenth. Both non-zero across a run is normal, since a growing conversation writes a little and reads a lot. Creation non-zero on every single call is the signal that no entry is ever being matched, and at this call rate expiry cannot explain it. What is left is that the bytes differ, and a prefix match has no tolerance: one interpolated value near the front costs the whole span behind it.',
  },
];
