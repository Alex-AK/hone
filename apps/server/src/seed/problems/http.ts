import { code, md, type ProblemDraft } from './types';

export const httpProblems: ProblemDraft[] = [
  {
    slug: 'http-fetch-not-ok',
    title: 'fetch does not throw on 500',
    category: 'http',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'This "works" even when the server returns `500`, and the catch block never runs:',
      '',
      code(
        'js',
        'try {',
        '  const data = await fetch(url).then((r) => r.json());',
        '} catch (err) {',
        '  showError(err);',
        '}'
      ),
      '',
      'Explain why, and what check is missing.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'network',
            'only reject',
            'does not reject',
            "doesn't reject",
            'still resolve',
            'resolves',
            'not an error',
          ],
          missingFeedback: 'When does a fetch promise actually reject?',
        },
        {
          synonyms: ['response.ok', 'res.ok', 'r.ok', '.ok', 'status'],
          missingFeedback: 'Which property do you have to check yourself?',
        },
      ],
      hints: [
        'fetch only rejects for network-level failures. DNS, connection refused, CORS, abort.',
        'An HTTP error status is a perfectly successful *round trip*, so the promise resolves.',
        'Check `response.ok` (or `response.status`) and throw yourself.',
      ],
    },
    canonicalAnswer:
      'fetch only rejects on network failures; an HTTP 500 is a successful round trip so the promise resolves normally. You have to check response.ok (or the status) yourself and throw.',
    solution: code(
      'js',
      'const response = await fetch(url);',
      'if (!response.ok) {',
      '  throw new Error(`Request failed: ${response.status}`);',
      '}',
      'const data = await response.json();'
    ),
    explanation:
      'The fetch promise rejects only when the request could not complete at all. DNS failure, connection refused, CORS rejection, or an abort. A `404` or `500` means the round trip **succeeded** and the server answered, so the promise resolves and your `catch` never fires; worse, `r.json()` then usually throws a confusing parse error on the HTML error page. Always branch on `response.ok` (true for 200-299) and throw a real error. This is the single most common fetch bug, and it is why `axios` feels different: it throws on non-2xx by default.',
  },

  {
    slug: 'http-body-once',
    title: 'Reading a response body twice',
    category: 'http',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'This throws `TypeError: body stream already read`:',
      '',
      code(
        'js',
        'const res = await fetch(url);',
        'const text = await res.text();',
        'const data = await res.json(); // 💥'
      ),
      '',
      'Explain why, and how to read it twice if you really need to.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['stream', 'once', 'consumed', 'used up', 'single', 'one time', 'drained'],
          missingFeedback:
            'What kind of thing is the response body, and how many times can it be read?',
        },
        {
          synonyms: ['clone', 'parse the text', 'json.parse'],
          missingFeedback: 'Name a way to get at it twice.',
        },
      ],
      hints: [
        'The body is a stream, not a buffer.',
        'Calling `.text()` or `.json()` consumes it; there is nothing left for the second call.',
        '`res.clone()` before reading, or read once as text and `JSON.parse` it yourself.',
      ],
    },
    canonicalAnswer:
      'The body is a one-shot stream. The first .text() consumes it, so the second read finds nothing. Use res.clone() before reading if you need it twice, or read it once as text and JSON.parse that string.',
    solution: code(
      'js',
      '// Option 1. Clone before reading',
      'const res = await fetch(url);',
      'const text = await res.clone().text();',
      'const data = await res.json();',
      '',
      '// Option 2. Read once, parse yourself (handy for logging bad payloads)',
      'const text2 = await res.text();',
      'const data2 = JSON.parse(text2);'
    ),
    explanation:
      'A `Response` body is a **ReadableStream**, so it can be consumed exactly once. That is what lets the browser start processing bytes before the whole payload has arrived, rather than buffering everything. `res.clone()` tees the stream so both copies can be read, at the cost of buffering. In error handling the second pattern is often nicer: read the text once, try to `JSON.parse` it, and if that fails you still have the raw body to put in the log instead of a useless parse error.',
  },

  {
    slug: 'http-post-json',
    title: 'POST a JSON body',
    category: 'http',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'The server rejects this with "unsupported media type" and an empty body:',
      '',
      code('js', 'await fetch(url, { method: "POST", body: { name: "Dana" } });'),
      '',
      'Name the two things wrong with the options object.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['stringify', 'json.stringify', 'string', 'serial'],
          missingFeedback: 'What has to happen to the object before it can be sent?',
        },
        {
          synonyms: ['content-type', 'content type', 'header', 'application/json'],
          missingFeedback: 'What must you tell the server about the body format?',
        },
      ],
      hints: [
        '`body` accepts a string, FormData, Blob or URLSearchParams. Not a plain object.',
        'A plain object gets stringified to `"[object Object]"`.',
        'You also need `headers: { "Content-Type": "application/json" }`.',
      ],
    },
    canonicalAnswer:
      'The body must be serialised with JSON.stringify, since a plain object becomes the string "[object Object]", and you must set the Content-Type header to application/json so the server parses it.',
    solution: code(
      'js',
      'await fetch(url, {',
      "  method: 'POST',",
      "  headers: { 'Content-Type': 'application/json' },",
      "  body: JSON.stringify({ name: 'Dana' }),",
      '});'
    ),
    explanation:
      '`body` accepts a string, `FormData`, `Blob`, `URLSearchParams` or a stream. A plain object is coerced with `String()`, producing the literal `"[object Object]"`, which is why the server sees garbage. `JSON.stringify` fixes the payload and `Content-Type: application/json` tells the server how to parse it; without the header most frameworks leave `req.body` empty. Note that `FormData` is the exception. You must **not** set `Content-Type` for it, because the browser has to generate the multipart boundary itself.',
  },

  {
    slug: 'http-put-vs-patch',
    title: 'PUT versus PATCH',
    category: 'http',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      "You are designing an endpoint to change just a user's email.",
      '',
      'Which method fits, and how does it differ from the other one in both semantics and idempotency?'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['patch'],
          missingFeedback: 'Which method represents a partial update?',
        },
        {
          synonyms: ['replace', 'whole', 'entire', 'full', 'complete'],
          missingFeedback: 'What does PUT do to the resource?',
        },
        {
          synonyms: ['idempot'],
          missingFeedback: 'Use the word that describes "same request twice, same end state".',
        },
      ],
      hints: [
        'One method replaces the whole resource, the other applies a partial change.',
        'PUT replaces the entire representation. Omitted fields are meant to be cleared.',
        'PUT is required to be idempotent; PATCH is not necessarily (think "increment by 1").',
      ],
    },
    canonicalAnswer:
      'PATCH, because it is a partial update of one field. PUT replaces the entire resource, so omitted fields should be cleared, and PUT is required to be idempotent while PATCH need not be. A patch like "increment by 1" changes the result each time.',
    solution: md(
      '`PATCH /users/:id` with `{ "email": "new@example.com" }`.',
      '',
      '- **PUT**: replace the whole representation. Sending it twice leaves the same state, so it is idempotent.',
      '- **PATCH**: apply a partial change. Idempotent only if the patch itself is (a set is; an increment is not).'
    ),
    explanation:
      'PUT means "make the resource look exactly like this", so a PUT missing the `name` field is semantically a request to clear it. Sending a partial body to PUT is a common source of accidental data loss. PATCH describes a change to apply. **Idempotent** means repeating the identical request leaves the same end state: `GET`, `PUT` and `DELETE` are required to be, `POST` is not, and `PATCH` depends on the patch. This matters in practice because clients and proxies may safely retry idempotent requests after a timeout.',
  },

  {
    slug: 'http-merge-patch-null',
    title: 'The field the patch could not clear',
    category: 'http',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'A profile form sends `PATCH /users/:id` carrying only the fields that changed. The handler drops null values before writing, so that a partial body can never blank a column by accident.',
      '',
      'Clearing the nickname sends `{ "nickname": null }`, and the nickname is back after a refresh.',
      '',
      'Say what an absent key and a null key each ask for, and what that means for the handler.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'absent',
            'omitted',
            'omit',
            'missing',
            'not in the body',
            'left out',
            'leave alone',
            'left alone',
            'leaves it',
            'leave it',
            'unchanged',
            'untouched',
          ],
          missingFeedback: 'A key that never arrives is a claim too. Say what it claims.',
        },
        {
          synonyms: ['remove', 'clear', 'delete', 'unset', 'blank', 'erase', 'drop the field'],
          missingFeedback: 'What is an explicit null in the body asking for?',
        },
        {
          synonyms: [
            'presence',
            'in the body',
            'in body',
            'hasownproperty',
            'object.keys',
            'which keys',
            'keys that arrived',
            'stop dropping',
            'keep the null',
            'do not drop',
            "don't drop",
            'three',
          ],
          missingFeedback: 'The handler is reading values. Say what it has to read instead.',
        },
      ],
      hints: [
        'The body has three things it can say about the nickname, not two.',
        'A key that is absent and a key set to null are different requests.',
        'Null means remove, so the handler has to branch on which keys arrived rather than on their values.',
      ],
    },
    canonicalAnswer:
      'They are two different requests. A partial JSON body is a merge patch: an absent key asks for that field to be left alone, and a key present with null asks for it to be removed. Dropping nulls collapses the two into one, so the clear has no way to be expressed. The handler has to decide from which keys are in the body rather than from their values, and treat a null as the instruction to clear.',
    solution: md(
      'Three signals, and the null filter deletes the middle one.',
      '',
      code(
        'text',
        '{ }                        leave the nickname alone',
        '{ "nickname": null }       remove it',
        '{ "nickname": "ali" }      set it'
      )
    ),
    explanation:
      'A partial JSON body sent to PATCH is a merge patch, defined by RFC 7386 and carried properly as `application/merge-patch+json`. Members of the patch are applied to the target, and null is given the special meaning of removing a member, so a handler that filters nullish input throws one of the three signals away. Two consequences follow from that same rule. A merge patch cannot ask for a stored JSON null, which the RFC says outright, so a field whose null is real data needs a different format. And arrays are replaced whole rather than merged, so there is no way to append one tag: you send the array you want. RFC 6902 JSON Patch is the format for when you need either, sending an explicit list of operations against JSON Pointer paths, and it is what `kubectl patch --type=json` selects instead of `--type=merge`.',
  },

  {
    slug: 'http-401-vs-403',
    title: '401 versus 403',
    category: 'http',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'short-text',
    prompt: md(
      'A logged-in user with a valid session requests an admin-only page.',
      '',
      'Which status code should the server return: `401` or `403`?'
    ),
    graderConfig: {
      accept: ['403', '403 forbidden', 'forbidden'],
      acceptPatterns: ['\\b403\\b'],
      nearMisses: {
        '401':
          '401 means "I do not know who you are", but this user is authenticated, they just lack permission.',
        '401 unauthorized':
          '401 means "I do not know who you are", but this user is authenticated, they just lack permission.',
        '404':
          'Some APIs do return 404 to hide existence, but the direct answer here is a different code.',
      },
      hints: [
        'One code is about *authentication*, the other about *authorization*.',
        '401 = "who are you?"; the user here has already answered that.',
      ],
    },
    canonicalAnswer: '403',
    solution: md(
      '`403 Forbidden`. The user is authenticated, but not permitted.',
      '',
      '- `401 Unauthorized`: no or invalid credentials. Must include a `WWW-Authenticate` header. (Misnamed: it really means *unauthenticated*.)',
      '- `403 Forbidden`: credentials understood, access still denied. Re-authenticating will not help.'
    ),
    explanation:
      '`401` is about **authentication**: the server does not know who you are, and the correct client reaction is to log in and retry. `403` is about **authorization**: it knows exactly who you are and is refusing anyway, so retrying with the same credentials is pointless. Getting this wrong causes real bugs: a client that redirects to the login page on `403` will bounce an already-logged-in user in a loop. Some APIs deliberately return `404` instead of `403` so that unauthorised users cannot even confirm a resource exists.',
  },

  {
    slug: 'http-cors-preflight',
    title: 'What triggers a CORS preflight',
    category: 'http',
    difficulty: 'hard',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'Adding a `Content-Type: application/json` header to a cross-origin POST suddenly produces an extra `OPTIONS` request that fails.',
      '',
      'Explain what that OPTIONS request is and why the header caused it.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['preflight', 'pre-flight'],
          missingFeedback: 'What is the name for that automatic OPTIONS request?',
        },
        {
          synonyms: [
            'simple',
            'not simple',
            'custom header',
            'content-type',
            'non-simple',
            'safelisted',
          ],
          missingFeedback:
            'Why did adding that header change anything? What category did the request leave?',
        },
        {
          synonyms: ['permission', 'allow', 'access-control', 'ask', 'check', 'server responds'],
          missingFeedback:
            'What is the browser trying to find out before sending the real request?',
        },
      ],
      hints: [
        'The browser sends it automatically. Your code did not.',
        'Requests that qualify as "simple" skip it; adding a non-safelisted header disqualifies you.',
        'The server must answer the OPTIONS with Access-Control-Allow-Origin / -Methods / -Headers before the real request is sent.',
      ],
    },
    canonicalAnswer:
      'It is a CORS preflight. Adding Content-Type: application/json makes the request non-simple, so the browser first sends an OPTIONS request asking whether the origin, method and headers are permitted. The server must answer it with the Access-Control-Allow-* headers before the browser will send the real POST.',
    solution: md(
      'The browser sends a **preflight** `OPTIONS` first. The server must answer it:',
      '',
      code(
        'http',
        'Access-Control-Allow-Origin: https://app.example.com',
        'Access-Control-Allow-Methods: POST',
        'Access-Control-Allow-Headers: Content-Type',
        'Access-Control-Max-Age: 86400'
      )
    ),
    explanation:
      'A cross-origin request is "simple" (and so skips preflight) only if it is `GET`/`HEAD`/`POST`, carries no non-safelisted headers, and uses a `Content-Type` of `text/plain`, `multipart/form-data` or `application/x-www-form-urlencoded`. `application/json` is not on that list, so the browser must first ask permission with an `OPTIONS` request. The server has to answer that OPTIONS with the matching `Access-Control-Allow-*` headers, and `Access-Control-Max-Age` lets the browser cache the answer so it is not repeated per request. Note the preflight is enforced by the **browser**, which is why the same call works fine from curl.',
  },

  {
    slug: 'http-status-created',
    title: 'Status codes for writes',
    category: 'http',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'short-text',
    prompt: md(
      'A POST successfully creates a new resource and returns it in the body.',
      '',
      'Which status code is the conventional choice?'
    ),
    graderConfig: {
      accept: ['201', '201 created', 'created'],
      acceptPatterns: ['\\b201\\b'],
      nearMisses: {
        '200':
          '200 OK is not wrong, but there is a more specific code for "a new resource now exists".',
        '204':
          '204 means "success, and there is no body", but here you are returning the resource.',
        '202': '202 Accepted means the work has been queued but not done yet.',
      },
      hints: [
        'The 2xx family has a code specifically for creation.',
        'It usually comes with a `Location` header pointing at the new resource.',
      ],
    },
    canonicalAnswer: '201',
    solution: md(
      '`201 Created`, ideally with a `Location: /users/123` header.',
      '',
      '- `200 OK`: success with a body, no creation implied.',
      '- `201 Created`: a new resource exists; point at it with `Location`.',
      '- `202 Accepted`: queued, not finished (async jobs).',
      '- `204 No Content`: success, deliberately empty body (typical for DELETE and some PUTs).'
    ),
    explanation:
      'Status codes are the part of your API every client already understands, so spending them precisely is free documentation. `201` tells the caller a resource now exists and the `Location` header says where, which lets generic clients follow up without parsing the body. `204` is its counterpart for "it worked, there is deliberately nothing to send", and note that a `204` **must not** have a body, so returning JSON with it will confuse well-behaved clients.',
  },

  {
    slug: 'http-cache-control',
    title: 'no-cache versus no-store',
    category: 'http',
    difficulty: 'hard',
    relevance: 'foundational',
    type: 'explain',
    prompt: md(
      'A page containing personal data is set to `Cache-Control: no-cache` and it is still being written to disk.',
      '',
      'Explain the difference between `no-cache` and `no-store`, and which one is needed here.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'revalidat',
            'check',
            'ask',
            'still store',
            'may store',
            'stores',
            'can cache',
          ],
          missingFeedback: 'What does `no-cache` actually permit? Is the response stored at all?',
        },
        {
          synonyms: ['no-store', 'nostore'],
          missingFeedback: 'Name the directive that forbids writing the response down at all.',
        },
      ],
      hints: [
        '`no-cache` is badly named. It does not mean "do not cache".',
        'It means "you may store it, but revalidate with the server before reusing it".',
        '`no-store` is the one that forbids writing the response to any cache.',
      ],
    },
    canonicalAnswer:
      'no-cache still allows the response to be stored. It only requires revalidation with the server before reuse. no-store forbids storing it at all, which is what a page with personal data needs.',
    solution: md(
      code('http', 'Cache-Control: no-store'),
      '',
      '- `no-cache`: may be stored, but must be revalidated (usually via `ETag`) before reuse.',
      '- `no-store`: must not be written to any cache, disk or memory.',
      '- `max-age=0`: stale immediately, but still storable and revalidatable.'
    ),
    explanation:
      '`no-cache` is one of the worst-named directives in HTTP: it permits storage and only requires **revalidation** before the copy is served. Normally a conditional request with `If-None-Match`, answered with a cheap `304`. That is exactly what you want for HTML that changes often. `no-store` is the one that forbids writing the response down anywhere, which is what sensitive pages need. The pairing that covers most apps: `no-store` for private pages, and `max-age=31536000, immutable` for content-hashed static assets.',
  },

  {
    slug: 'http-429-backoff',
    title: 'Handling a rate limit',
    category: 'http',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'Your client starts getting `429 Too Many Requests`, and the naive retry loop makes it worse.',
      '',
      'What does 429 mean, which response header should you obey, and what retry strategy is appropriate?'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['retry-after', 'retry after'],
          missingFeedback: 'Which header does the server use to tell you how long to wait?',
        },
        {
          synonyms: ['backoff', 'back-off', 'exponential', 'back off'],
          missingFeedback: 'Name the retry strategy. Waits that grow between attempts.',
        },
        {
          synonyms: ['jitter', 'random', 'stagger'],
          missingFeedback: 'What do you add to the delay so many clients do not retry in lockstep?',
        },
      ],
      hints: [
        '429 means you exceeded a rate limit. The request was refused, not broken.',
        'The response usually carries a `Retry-After` header, in seconds or as a date.',
        'Retry with exponentially growing delays plus random jitter, so clients do not synchronise into a thundering herd.',
      ],
    },
    canonicalAnswer:
      '429 means you have exceeded the rate limit. Obey the Retry-After header if present, and otherwise retry with exponential backoff plus random jitter so that many clients do not all retry at the same moment.',
    solution: code(
      'js',
      'async function withRetry(fn, attempt = 0) {',
      '  const res = await fn();',
      '  if (res.status !== 429 || attempt >= 5) return res;',
      '',
      "  const header = Number(res.headers.get('Retry-After'));",
      '  const backoff = 2 ** attempt * 500;',
      '  const jitter = backoff * Math.random() * 0.3;',
      '  const waitMs = Number.isFinite(header) && header > 0 ? header * 1000 : backoff + jitter;',
      '',
      '  await new Promise((r) => setTimeout(r, waitMs));',
      '  return withRetry(fn, attempt + 1);',
      '}'
    ),
    explanation:
      "`429` says the request was refused for rate reasons, so it is worth retrying. Unlike a `400`, which will fail identically forever. Always prefer the server's own `Retry-After` (seconds or an HTTP date) over your own guess. When it is absent, **exponential backoff** stops a struggling server from being hammered, and **jitter** is the part people forget: without randomness every client retries at the same instant and recreates the spike that caused the limit. Cap the attempts, and only retry idempotent requests unless you have an idempotency key.",
  },

  {
    slug: 'http-idempotency-key',
    title: 'Double-charging on a retry',
    category: 'http',
    difficulty: 'hard',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A payment `POST` times out. The client retries and the customer is charged twice. The first request had actually succeeded.',
      '',
      'Explain the mechanism used to make this safe.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'idempotency key',
            'idempotency-key',
            'idempotence key',
            'unique key',
            'client-generated',
            'request id',
          ],
          missingFeedback:
            'Name the header/token the client sends to identify the logical request.',
        },
        {
          synonyms: [
            'same',
            'duplicate',
            'already',
            'stored',
            'cached',
            'returns the',
            'replay',
            'first result',
          ],
          missingFeedback: 'What does the server do when it sees that key a second time?',
        },
      ],
      hints: [
        'POST is not idempotent, so a retry genuinely creates a second charge.',
        'The client generates a unique key per logical operation and sends it with every attempt.',
        'The server records the key with the result; a repeat key returns the stored result instead of charging again.',
      ],
    },
    canonicalAnswer:
      'An idempotency key: the client generates a unique key for the logical operation and sends it on every attempt, usually as an Idempotency-Key header. The server stores the key with the result of the first request, and when it sees the same key again it returns the stored result instead of performing the operation a second time.',
    solution: code(
      'js',
      'const key = crypto.randomUUID(); // generated once per logical payment',
      '',
      "await fetch('/payments', {",
      "  method: 'POST',",
      "  headers: { 'Idempotency-Key': key, 'Content-Type': 'application/json' },",
      '  body: JSON.stringify(payment),',
      '});',
      '// Retrying with the SAME key is safe. The server replays the first result.'
    ),
    explanation:
      'A timeout tells you nothing about whether the server acted, so the client cannot know if retrying is safe, and `POST` carries no idempotency guarantee. The fix is to move the guarantee into the payload: the client generates a key **once per logical operation** (not per attempt) and the server records it alongside the outcome, returning the stored response for any repeat. Keys are held for a bounded window, typically 24 hours. This is exactly how Stripe and most payment APIs work, and it is the standard answer to "how do I make this safe to retry?".',
  },

  {
    slug: 'http-pagination-cursor',
    title: 'Offset pagination on a moving list',
    category: 'http',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'A feed sorted newest-first is paginated with `?page=2&limit=20`. Users report seeing the same post twice and occasionally missing one.',
      '',
      'Explain the cause and name the alternative.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['insert', 'new row', 'new item', 'added', 'shift', 'moved', 'changes between'],
          missingFeedback: 'What happens to the offsets between the two requests?',
        },
        {
          synonyms: ['cursor', 'keyset', 'seek', 'after', 'since', 'last id'],
          missingFeedback: 'Name the alternative.',
        },
        {
          synonyms: [
            'stable',
            'position',
            'anchor',
            'where',
            'from the row',
            'not affected',
            'relative to',
            'index',
          ],
          missingFeedback: 'Why does that alternative avoid the problem?',
        },
      ],
      hints: [
        'The two requests are separated in time, and the list is not static.',
        'A new post at the top pushes everything down one place.',
        'Paginate from a position in the data rather than a count from the start.',
      ],
    },
    canonicalAnswer:
      'Offsets are positions in a list that keeps changing. A post inserted at the top between the two requests shifts everything down one, so the first item of page 2 is one the user already saw, and a deletion has the mirror effect of skipping one. Use cursor or keyset pagination instead, passing the sort key of the last row seen and asking for rows after it, which stays anchored to the data rather than to a count.',
    solution: code(
      'text',
      'GET /posts?limit=20',
      '  -> { items: [...], nextCursor: "2026-03-14T09:12:00Z_8f31" }',
      '',
      'GET /posts?limit=20&after=2026-03-14T09:12:00Z_8f31',
      '',
      '-- SQL: WHERE (created_at, id) < ($1, $2) ORDER BY created_at DESC, id DESC LIMIT 20'
    ),
    explanation:
      'Cursor pagination is stable under inserts and deletes because the cursor names a row, not a count, and it is far faster at depth: `OFFSET 100000` makes the database walk and discard a hundred thousand rows, while a keyset comparison uses the index. The cost is that you lose random access to "page 47", which is usually fine for a feed and not for a data table with numbered pages. Include a tiebreaker like the id in both the cursor and the ORDER BY, or rows sharing a timestamp will be skipped or repeated.',
  },

  {
    slug: 'http-range-next-chunk',
    title: 'Asking for the rest of it',
    category: 'http',
    difficulty: 'easy',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      'A download of a 40,000-byte file dropped. You have the first 1024 bytes on disk and want the next 512 in one request.',
      '',
      'Write the `Range` header.'
    ),
    graderConfig: {
      accept: [
        'range: bytes=1024-1535',
        'bytes=1024-1535',
        'range bytes=1024-1535',
        'bytes 1024-1535',
      ],
      acceptPatterns: ['bytes\\s*=?\\s*1024\\s*-\\s*1535'],
      nearMisses: {
        'bytes=1024-1536':
          'Both ends of a range are inclusive, so `1024-1536` is 513 bytes. The last byte you want is 1535.',
        'range: bytes=1024-1536':
          'Both ends of a range are inclusive, so `1024-1536` is 513 bytes. The last byte you want is 1535.',
        'bytes=1025-1536':
          'Offsets are zero-based, so byte 1024 is the first one you are missing rather than the last one you have.',
        'bytes=-512':
          'That is the suffix form, and it asks for the last 512 bytes of the file. You want 512 bytes at an offset.',
        'bytes=1024-':
          'That asks for everything from 1024 to the end, which is 38,976 bytes rather than 512.',
        'bytes=1024,512': 'A range is a first and a last offset, not an offset and a length.',
      },
      hints: [
        'Offsets are zero-based, so the first byte you do not have is 1024.',
        'The form is `bytes=first-last`, and both ends are inclusive.',
        '512 bytes starting at 1024 ends at 1024 + 512 - 1.',
      ],
    },
    canonicalAnswer: 'Range: bytes=1024-1535',
    solution: md(
      code('text', 'Range: bytes=1024-1535'),
      '',
      'A satisfied request answers `206` with `Content-Range: bytes 1024-1535/40000` and a `Content-Length` of 512. Branch on the status: a `200` means the server ignored the range and you should discard what you had.'
    ),
    explanation:
      'Both ends of `bytes=first-last` are inclusive and offsets are zero-based, so N bytes from offset X end at X + N - 1 and an off-by-one duplicates or drops a byte at the seam. That is the damage worth noticing: it scales with how many times the connection dropped rather than showing up on the first attempt, so a resumed download can be quietly corrupt while every response in the trace was a `206`. The other two forms are not this one. `bytes=1024-` is everything from that offset to the end, and `bytes=-512` is a suffix, meaning the last 512 bytes rather than everything except them. Resuming safely also wants an `If-Range` carrying a strong validator, so the server sends the whole file instead of a range if the representation changed while you were gone.',
  },

  {
    slug: 'http-etag-conditional',
    title: 'Not sending a body you already have',
    category: 'http',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      'A client polls a large JSON resource that rarely changes, and downloads the whole thing every time.',
      '',
      'Name the response header that lets the server answer 304 Not Modified on the next request.'
    ),
    graderConfig: {
      accept: ['etag', 'e-tag', 'last-modified'],
      acceptPatterns: ['e-?tag', 'last-?modified'],
      nearMisses: {
        'cache-control':
          'Cache-Control controls freshness. This is about revalidating what you have.',
      },
      hints: [
        'The server sends a version identifier with the body.',
        'The client sends it back on the next request to ask "has this changed?".',
        '`ETag`, echoed back as `If-None-Match`.',
      ],
    },
    canonicalAnswer: 'ETag',
    solution: code(
      'text',
      'GET /report          ->  200  ETag: "a1b2c3"   [ 400 KB body ]',
      'GET /report',
      '  If-None-Match: "a1b2c3"',
      '                     ->  304  (no body)'
    ),
    explanation:
      'The server hashes or versions the representation, the client echoes it in `If-None-Match`, and an unchanged resource costs a round trip with no body. `Last-Modified` with `If-Modified-Since` is the older, second-resolution equivalent and is weaker for anything that can change twice in a second. The same mechanism has a second job: sending `If-Match` on a PUT gives you optimistic concurrency, so a write fails with 412 if someone else changed the resource since you read it, which is the HTTP-level fix for lost updates.',
  },

  {
    slug: 'http-timeout-fetch',
    title: 'The request that never comes back',
    category: 'http',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'short-text',
    prompt: md(
      'A hanging server leaves this promise pending forever, and the spinner never stops:',
      '',
      code('js', 'const res = await fetch(url);'),
      '',
      'Name the built-in that gives it a deadline.'
    ),
    graderConfig: {
      accept: [
        'abortsignal.timeout',
        'abortsignal.timeout()',
        'abortcontroller',
        'abort controller',
        'abortsignal',
      ],
      acceptPatterns: ['AbortSignal\\.timeout', 'AbortController', 'AbortSignal'],
      nearMisses: {
        'promise.race': 'Racing a timer settles the promise but leaves the request running.',
        settimeout: 'A timer alone does not cancel anything.',
      },
      hints: [
        'fetch has no timeout option of its own.',
        'It does take a signal that can cancel it.',
        '`AbortSignal.timeout(5000)`',
      ],
    },
    canonicalAnswer: 'AbortSignal.timeout',
    solution: code(
      'js',
      'try {',
      '  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });',
      '} catch (err) {',
      "  if (err.name === 'TimeoutError') showRetry();",
      '  else throw err;',
      '}'
    ),
    explanation:
      '`fetch` deliberately has no timeout option, so an unresponsive server hangs the promise until the browser gives up, which can be minutes. `AbortSignal.timeout` produces a signal that aborts itself, and it rejects with a `TimeoutError` you can distinguish from a user-initiated `AbortError`. `Promise.race` against a timer looks equivalent but is not: the request keeps running, keeps the connection open and still resolves into nothing. Use `AbortSignal.any` to combine a timeout with a cancel-on-unmount controller.',
  },

  {
    slug: 'http-retry-safe-methods',
    title: 'What is safe to retry',
    category: 'http',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A client library retries every failed request three times, including POSTs, and duplicate records appear.',
      '',
      'Explain which requests are safe to retry automatically and why.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['idempot', 'same effect', 'no additional', 'repeatable'],
          missingFeedback: 'What property makes a retry safe?',
        },
        {
          synonyms: ['get', 'head', 'put', 'delete', 'options'],
          missingFeedback: 'Name methods that have that property.',
        },
        {
          synonyms: ['post', 'creates', 'new resource', 'duplicate', 'not idempotent'],
          missingFeedback: 'Which method does not, and why?',
        },
        {
          synonyms: [
            'idempotency key',
            'unique',
            'token',
            'dedupe',
            'make it idempotent',
            'ask the user',
            'do not retry',
          ],
          missingFeedback: 'What lets you retry the unsafe one anyway?',
        },
      ],
      hints: [
        'The question is whether doing it twice differs from doing it once.',
        'GET, HEAD, PUT and DELETE are defined as idempotent; POST is not.',
        'A POST can be made retry-safe with an idempotency key.',
      ],
    },
    canonicalAnswer:
      'Only idempotent requests are safe to retry blindly: repeating them has the same effect as doing them once. GET and HEAD change nothing, and PUT and DELETE are defined to be idempotent, since setting the same state twice or deleting the same resource twice leaves the same result. POST is not, because it creates a new resource each time, so a retry after a response was lost in transit creates a duplicate. To retry a POST safely, send an idempotency key the server can use to recognise and dedupe the repeat.',
    solution: code(
      'text',
      'GET     retry freely',
      'HEAD    retry freely',
      'PUT     retry freely      (same state either way)',
      'DELETE  retry freely      (already gone is the goal state)',
      'POST    only with an Idempotency-Key the server honours',
      '',
      'and back off exponentially, with jitter'
    ),
    explanation:
      'Idempotent does not mean "no effect", it means "no *additional* effect", which is why DELETE qualifies even though the second call returns 404. The dangerous case is the lost response rather than the lost request: the server did the work, the acknowledgement never arrived, and the client cannot tell the difference. That is exactly what an idempotency key resolves, and it is why payment APIs require one. Pair any retry policy with exponential backoff and jitter, or a struggling service gets a synchronised stampede the moment it wobbles.',
  },

  {
    slug: 'http-content-type-charset',
    title: 'The header that decides how a body is read',
    category: 'http',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'short-text',
    prompt: md(
      'A POST body arrives at the server as a string that no JSON parser will touch:',
      '',
      code('js', 'fetch(url, { method: "POST", body: JSON.stringify(payload) });'),
      '',
      'Name the request header that is missing.'
    ),
    graderConfig: {
      accept: [
        'content-type',
        'content type',
        'content-type: application/json',
        'application/json',
      ],
      acceptPatterns: ['content-?type', 'application/json'],
      nearMisses: {
        accept: 'Accept says what you want back, not what you are sending.',
      },
      hints: [
        'The server has to be told how to interpret the bytes you sent.',
        'Without it, a body from fetch defaults to text/plain.',
        '`Content-Type: application/json`',
      ],
    },
    canonicalAnswer: 'Content-Type',
    solution: code(
      'js',
      'fetch(url, {',
      "  method: 'POST',",
      "  headers: { 'Content-Type': 'application/json' },",
      '  body: JSON.stringify(payload),',
      '});'
    ),
    explanation:
      'A string body with no explicit `Content-Type` is sent as `text/plain;charset=UTF-8`, and body-parsing middleware keyed on `application/json` skips it, leaving an empty `req.body` and a confusing "name is required" error. `Content-Type` describes what you are sending; `Accept` describes what you would like back. Note the deliberate exception from the file-upload case: with a `FormData` body you must **not** set it, because the browser needs to add the multipart boundary itself.',
  },

  {
    slug: 'http-streaming-response',
    title: 'Showing tokens as they arrive',
    category: 'http',
    difficulty: 'hard',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      'This waits for the entire response before rendering anything, which defeats a streaming endpoint:',
      '',
      code('js', 'const text = await res.text();'),
      '',
      'Name the property of the response that lets you consume it incrementally.'
    ),
    graderConfig: {
      accept: ['body', 'res.body', 'response.body', 'readablestream', 'getreader'],
      acceptPatterns: ['\\bres(ponse)?\\.body\\b', '\\bbody\\b', 'ReadableStream', 'getReader'],
      nearMisses: {
        json: 'json() also buffers the whole body first.',
        blob: 'blob() buffers as well.',
      },
      hints: [
        '`text()`, `json()` and `blob()` all buffer the whole body.',
        'The response exposes the underlying stream directly.',
        '`res.body`, a ReadableStream you can read chunk by chunk.',
      ],
    },
    canonicalAnswer: 'res.body',
    solution: code(
      'js',
      'const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();',
      '',
      'while (true) {',
      '  const { value, done } = await reader.read();',
      '  if (done) break;',
      '  append(value); // render as it arrives',
      '}'
    ),
    explanation:
      'Every convenience method on `Response` buffers to completion first, which is exactly wrong for a long-running or token-by-token endpoint. `res.body` is a `ReadableStream` of `Uint8Array` chunks, and `TextDecoderStream` handles the awkward part: a multi-byte character can be split across two chunks, so decoding each chunk independently corrupts it. Chunk boundaries mean nothing semantically either, so a JSON-lines protocol needs you to buffer up to each newline yourself. For server-sent events, `EventSource` does all of this, at the cost of being GET-only.',
  },

  {
    slug: 'http-status-choice-validation',
    title: 'Picking a status for a rejected write',
    category: 'http',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'short-text',
    prompt: md(
      'A POST is well formed JSON but the email address in it is already registered.',
      '',
      'Which status code fits better than 400, and is the conventional choice for a conflict with existing state?'
    ),
    graderConfig: {
      accept: ['409', '409 conflict', 'conflict'],
      acceptPatterns: ['\\b409\\b', '\\bconflict\\b'],
      nearMisses: {
        '422': '422 is for a semantically invalid body. This body is valid; the state conflicts.',
        '400': '400 is the one we are trying to improve on.',
        '500': 'The server is fine. This is a client-visible, expected outcome.',
      },
      hints: [
        'The request is syntactically fine and semantically meaningful.',
        'What it clashes with is the current state of the resource.',
        '409 Conflict',
      ],
    },
    canonicalAnswer: '409',
    solution: code(
      'text',
      '400 Bad Request           malformed: not parseable, wrong shape',
      '401 Unauthorized          not authenticated',
      '403 Forbidden             authenticated, not allowed',
      '404 Not Found             no such resource',
      '409 Conflict              clashes with current state (duplicate, stale version)',
      '422 Unprocessable Content valid syntax, invalid semantics',
      '429 Too Many Requests     rate limited'
    ),
    explanation:
      'The distinction is worth getting right because clients branch on it: 400 says "fix your request", 409 says "your request is fine, the world is not what you assumed". A duplicate signup, an edit against a stale version, and a state machine transition that is not allowed from here are all 409. 422 covers a body that parses but violates the rules, such as an end date before the start date, though plenty of APIs use 400 for that and consistency within your own API matters more than the debate. Whatever the code, include a machine-readable body saying which field and why.',
  },

  {
    slug: 'http-preflight-cache',
    title: 'Two requests for every call',
    category: 'http',
    difficulty: 'hard',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      'The network tab shows an OPTIONS request before every single API call, doubling the request count on a chatty page.',
      '',
      'Name the response header that lets the browser reuse the preflight result.'
    ),
    graderConfig: {
      accept: ['access-control-max-age', 'max-age', 'access control max age'],
      acceptPatterns: ['access-control-max-age', 'max-?age'],
      nearMisses: {
        'cache-control': 'Cache-Control caches the resource, not the preflight decision.',
      },
      hints: [
        'The preflight answer is cacheable, like any other answer.',
        'The header goes on the OPTIONS response.',
        '`Access-Control-Max-Age`',
      ],
    },
    canonicalAnswer: 'Access-Control-Max-Age',
    solution: code(
      'text',
      'OPTIONS /api/orders',
      '  -> 204',
      '     Access-Control-Allow-Origin: https://app.example.com',
      '     Access-Control-Allow-Methods: GET, POST',
      '     Access-Control-Allow-Headers: content-type, authorization',
      '     Access-Control-Max-Age: 600'
    ),
    explanation:
      'The browser caches the preflight decision per origin, method and header set for the lifetime you specify, so subsequent calls skip the OPTIONS round trip entirely. Browsers cap it well below what you ask for, and the caps differ, so treat the value as a hint. The other half of the fix is avoiding the preflight where you can: a request stays "simple" and skips it entirely if it uses GET, HEAD or POST with a body type of `text/plain`, `multipart/form-data` or `application/x-www-form-urlencoded` and no custom headers. In practice an `Authorization` header or JSON body means you will be preflighting.',
  },

  {
    slug: 'http-sse-content-type',
    title: 'The stream the browser buffers anyway',
    category: 'http',
    difficulty: 'easy',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      'An endpoint writes updates as they happen and flushes each one, but `EventSource` fires no `message` events and the browser shows nothing until the handler returns:',
      '',
      code(
        'js',
        "res.setHeader('Content-Type', 'application/json');",
        "res.write('data: 12\\n\\n');"
      ),
      '',
      'Name the media type the response has to declare.'
    ),
    graderConfig: {
      accept: ['text/event-stream', 'event-stream', 'text/event stream'],
      acceptPatterns: ['text\\s*/\\s*event-?stream'],
      nearMisses: {
        'text/plain': 'Plain text is still a document the browser waits to finish.',
        'application/x-ndjson': 'That is a streaming format, but not the one EventSource reads.',
        'text/stream': 'Close. The registered type names the events.',
      },
      hints: [
        'EventSource only parses one media type.',
        'It is a text type, and it names the thing it carries.',
        '`text/event-stream`.',
      ],
    },
    canonicalAnswer: 'text/event-stream',
    solution: code(
      'js',
      "res.setHeader('Content-Type', 'text/event-stream');",
      "res.setHeader('Cache-Control', 'no-store');",
      "res.write('data: 12\\n\\n');"
    ),
    explanation:
      'The HTML specification requires an event stream to be served as `text/event-stream`, encoded as UTF-8, and `EventSource` refuses anything else: the connection errors rather than delivering events. The framing matters as much as the type. A blank line dispatches the event, so `data: 12` on its own is a message nobody has finished writing yet, which is why the two newlines are not optional. Send `Cache-Control: no-store` alongside it, because a proxy that decides to cache or buffer a response it thinks is a document turns a live stream into one long silence.',
  },

  {
    slug: 'http-sse-resume',
    title: 'Picking the stream back up',
    category: 'http',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      'A dashboard on `EventSource` drops its connection for eight seconds. The browser reconnects on its own, but the events sent during the gap are gone for good.',
      '',
      'The server sends an `id:` with every event. Name the request header the browser sends on reconnect so the server knows where to resume.'
    ),
    graderConfig: {
      accept: ['last-event-id', 'last event id', 'lasteventid'],
      acceptPatterns: ['last-?\\s*event-?\\s*id'],
      nearMisses: {
        'if-none-match': 'That is conditional caching, not stream position.',
        range: 'Range asks for bytes of a resource, not events since a marker.',
        'if-modified-since': 'A timestamp, and not the one the stream is keyed by.',
      },
      hints: [
        'The browser remembers the last `id:` it saw.',
        'It sends that value back as a request header when it reconnects.',
        '`Last-Event-ID`.',
      ],
    },
    canonicalAnswer: 'Last-Event-ID',
    solution: code(
      'text',
      'id: 41',
      'data: {"cpu":38}',
      '',
      '   [ connection drops, browser waits, reconnects ]',
      '',
      'GET /events',
      '  Last-Event-ID: 41       <- server replays 42 onward'
    ),
    explanation:
      'Automatic reconnection is the part of server-sent events people quote, and it is only half the mechanism. The browser stores the last `id:` field it saw and sends it as `Last-Event-ID` on the next connection; a server that ignores that header reconnects the client to the present and silently loses the gap. The other half is yours to build: the server needs to be able to answer "everything after 41", which means events have to be retained somewhere long enough to replay. Without an `id:` there is nothing to resume from, so reconnection means "start again", which is fine for a live gauge and wrong for anything you are counting.',
  },

  {
    slug: 'http-websocket-upgrade',
    title: 'The handshake that stops being HTTP',
    category: 'http',
    difficulty: 'medium',
    relevance: 'foundational',
    type: 'short-text',
    prompt: md(
      'A WebSocket connection starts as an ordinary HTTP request:',
      '',
      code(
        'text',
        'GET /chat HTTP/1.1',
        'Upgrade: websocket',
        'Connection: Upgrade',
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
        'Sec-WebSocket-Version: 13'
      ),
      '',
      'Name the status code the server answers with when it agrees.'
    ),
    graderConfig: {
      accept: ['101', '101 switching protocols', 'switching protocols'],
      acceptPatterns: ['\\b101\\b', 'switching\\s+protocols'],
      nearMisses: {
        '200': '200 means "here is a response body", which ends the exchange.',
        '204': 'No content still completes the request as HTTP.',
        '426': '426 Upgrade Required is the server refusing and asking you to upgrade.',
        '100': '100 Continue is about request bodies.',
      },
      hints: [
        'It is a 1xx-style handoff, not a success code.',
        'The connection stays open and stops speaking HTTP.',
        '`101 Switching Protocols`.',
      ],
    },
    canonicalAnswer: '101 Switching Protocols',
    solution: code(
      'text',
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      'Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo='
    ),
    explanation:
      "The handshake is HTTP and everything after it is not. The server proves it understood the request by hashing the client's `Sec-WebSocket-Key` with a fixed GUID from RFC 6455 and returning it as `Sec-WebSocket-Accept`, which is what stops a cache or an unaware proxy from replying 101 by accident. Once the 101 lands, the same TCP connection carries WebSocket frames in both directions, and none of the HTTP machinery applies to them: no status codes, no caching, no per-message headers, and no method to look at. That is exactly why the things HTTP gave you for free (a load balancer that can route by path, a proxy that can retry) become your problem the moment you upgrade.",
  },

  {
    slug: 'http-sse-vs-websocket',
    title: 'Picking a direction',
    category: 'http',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'A dashboard shows figures that the server recalculates every few seconds. The browser never sends anything back; it only displays.',
      '',
      'A colleague proposes a WebSocket. Argue for server-sent events instead, and name the one limit of SSE that could change your mind.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'one direction',
            'one-way',
            'one way',
            'unidirectional',
            'server to client',
            'only the server',
            'never sends',
            'no client messages',
          ],
          missingFeedback: 'What does the traffic actually look like here?',
        },
        {
          synonyms: [
            'plain http',
            'ordinary http',
            'still http',
            'over http',
            'no upgrade',
            'reconnect',
            'reconnects automatically',
            'automatic reconnect',
            'last-event-id',
            'resume',
          ],
          missingFeedback: 'What do you get for free from SSE that you would write yourself?',
        },
        {
          synonyms: [
            'connection limit',
            'six connections',
            '6 connections',
            'per domain',
            'per origin',
            'http/1.1',
            'http 1.1',
            'binary',
            'text only',
            'utf-8',
          ],
          missingFeedback: 'Name a limit of SSE: what it cannot carry, or how many can be open.',
        },
      ],
      hints: [
        'Count the directions the messages actually travel.',
        'SSE is an ordinary HTTP response that stays open, so proxies, auth and load balancing work the way they already do, and the browser reconnects and resumes on its own.',
        'The limits: SSE carries UTF-8 text only, and over HTTP/1.1 a browser will hold about six connections per domain, so a stream costs one of them.',
      ],
    },
    canonicalAnswer:
      'The traffic is one-directional: the server pushes and the client never sends. SSE is an ordinary HTTP response that stays open, so proxies, auth and load balancers behave as they already do, and the browser reconnects on its own and resumes with Last-Event-ID. A WebSocket buys two-way traffic nobody needs and makes reconnection your job. The limits that would change my mind: SSE carries UTF-8 text only, so binary needs encoding, and over HTTP/1.1 a browser holds only about six connections per domain, so several open streams starve the page.',
    solution: md(
      'One direction, so use the one-directional transport.',
      '',
      '| | SSE | WebSocket |',
      '| --- | --- | --- |',
      '| Direction | server to client | both |',
      '| Wire | an HTTP response that stays open | a TCP connection after a 101 |',
      '| Reconnect | automatic, resumes via `Last-Event-ID` | yours to write |',
      '| Payload | UTF-8 text | text or binary |',
      '| Cost | one of ~6 HTTP/1.1 connections per domain | one connection, outside HTTP |',
      '',
      'Switch to a WebSocket when the client starts talking back, when the payload is binary, or when one page needs more streams than HTTP/1.1 will give it.'
    ),
    explanation:
      'The four questions that pick a transport answer themselves here: the server starts it, the messages go one way, nothing needs a reply, and the cost is one held-open connection. SSE is the option people skip past, and skipping it means reimplementing reconnection, resumption and backoff by hand, because the WebSocket API gives you none of them. The honest limits are worth knowing before you commit: an event stream is UTF-8 text by specification, so binary has to be encoded into it; `EventSource` cannot set request headers, so bearer-token auth needs a cookie or a query parameter; and over HTTP/1.1 the six-connections-per-domain cap is per browser rather than per tab, so a handful of open dashboards will hang the seventh. Over HTTP/2 the streams are multiplexed and that particular cap stops mattering.',
  },

  {
    slug: 'http-idempotency-key-scope',
    title: 'A new key on every attempt',
    category: 'http',
    difficulty: 'easy',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'This loop sends an `Idempotency-Key` on every attempt, and the customer is charged three times:',
      '',
      code(
        'js',
        'for (let attempt = 0; attempt < 3; attempt += 1) {',
        '  const key = crypto.randomUUID();',
        '',
        "  const res = await fetch('/payments', {",
        "    method: 'POST',",
        "    headers: { 'Idempotency-Key': key, 'Content-Type': 'application/json' },",
        '    body: JSON.stringify(payment),',
        '  });',
        '  if (res.ok) return res;',
        '}'
      ),
      '',
      'Name the line to move, and say what the server makes of each attempt until you move it.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'above the loop',
            'outside the loop',
            'out of the loop',
            'before the loop',
            'once per',
            'one key',
            'same key',
            'per operation',
            'per intent',
          ],
          missingFeedback: 'Where does the key have to be created for a retry to be recognisable?',
        },
        {
          synonyms: [
            'new key',
            'fresh key',
            'different key',
            'another key',
            'per attempt',
            'each attempt',
            'every attempt',
            'unrelated',
            'separate payment',
            'new payment',
            'never seen',
          ],
          missingFeedback: 'What does the server see arriving when the key changes each time?',
        },
      ],
      hints: [
        'Every attempt does carry a key. Look at where the key comes from.',
        'The key names the operation, not the attempt.',
        'Move `crypto.randomUUID()` above the loop so all three attempts send the same key.',
      ],
    },
    canonicalAnswer:
      'Move crypto.randomUUID() above the loop so one key covers the whole payment. While it stays inside, every attempt carries a new key, so the server has never seen it before and treats each retry as a separate payment.',
    solution: code(
      'js',
      'const key = crypto.randomUUID(); // once, when the user pressed the button',
      '',
      'for (let attempt = 0; attempt < 3; attempt += 1) {',
      "  const res = await fetch('/payments', {",
      "    method: 'POST',",
      "    headers: { 'Idempotency-Key': key, 'Content-Type': 'application/json' },",
      '    body: JSON.stringify(payment),',
      '  });',
      '  if (res.ok) return res;',
      '}'
    ),
    explanation:
      "A key generated per attempt is no key at all. The server's whole job is to recognise the second copy of a request it already handled, and a fresh UUID makes every attempt look like a new payment, so the mechanism is fitted, the header is present, and nothing is protected. The key belongs to the intent: mint it where the intent is formed, when the form is rendered or the button is pressed, and reuse it unchanged. That also means it has to outlive whatever created it, so a component that remounts and mints a new one has the same bug with a longer fuse. Stripe keeps the stored result for at least 24 hours, which is the window a retry has to land in.",
  },

  {
    slug: 'http-cursor-tiebreaker',
    title: 'The post that never appears on any page',
    category: 'http',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'short-text',
    prompt: md(
      'A feed pages twenty at a time, ordered by `created_at DESC`, with the cursor applied as `WHERE created_at < ?`.',
      '',
      'Three posts were published in the same second. One of them never appears on any page.',
      '',
      'Name the column to add to both the `ORDER BY` and the cursor.'
    ),
    graderConfig: {
      accept: ['id', 'the id', 'primary key', 'the primary key', 'post id', 'the id column'],
      acceptPatterns: ['(^|[^\\w])ids?\\b', 'primary key'],
      nearMisses: {
        created_at: 'That is the column that ties. You need a second one that cannot.',
        updated_at: 'Another timestamp has the same problem: two rows can share it.',
        timestamp: 'Any timestamp can tie. The tiebreaker has to be unique per row.',
        '<=': 'Switching to `<=` returns all three of them again instead of dropping them.',
      },
      hints: [
        'Two rows sharing a `created_at` look identical to the cursor.',
        'A cursor names a row only if the sort key is unique. Make it unique.',
        '`ORDER BY created_at DESC, id DESC`, with both values carried in the cursor.',
      ],
    },
    canonicalAnswer: 'id',
    solution: code(
      'sql',
      'SELECT id, title, created_at',
      'FROM posts',
      "WHERE (created_at, id) < ('2026-03-14 09:12:00', 8931)",
      'ORDER BY created_at DESC, id DESC',
      'LIMIT 20;'
    ),
    explanation:
      'A cursor identifies a row only if the sort key is unique. When rows tie, the page boundary lands in the middle of them: `<` drops every row sharing that second, including ones nobody has seen, and `<=` returns them all a second time. Both are wrong, in opposite directions, and the primary key fixes both. It has to go in three places at once: the `ORDER BY`, the cursor you hand back, and the index, or the database sorts rows the index could have handed over in order already. Keep the cursor opaque on the wire, because the moment a client parses it your sort key is part of the public contract and adding a tiebreaker becomes a breaking change.',
  },

  {
    slug: 'http-rate-limit-window-expiry',
    title: 'The client that is limited forever',
    category: 'http',
    difficulty: 'easy',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A fixed-window limiter counts in Redis. One client is stuck at `429` long after it went quiet, and its key never expires:',
      '',
      code(
        'js',
        'const used = await redis.incr(key);',
        'await redis.expire(key, 60);',
        '',
        "if (used > limit) return res.status(429).json({ error: 'Too many requests' });"
      ),
      '',
      'Explain what the second line does to a client that keeps calling, and name the condition it needs.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'every request',
            'each request',
            'every call',
            'refresh',
            'resets',
            'pushes',
            'moves the',
            'extends',
            'renews',
            'never expires',
            'outruns',
            'restarts',
          ],
          missingFeedback: 'What happens to the deadline when another request arrives inside it?',
        },
        {
          synonyms: [
            'used === 1',
            'used == 1',
            'is 1',
            'equals 1',
            'returns 1',
            'first request',
            'new key',
            'counter is created',
            'when it is created',
            'created',
            'no ttl',
            'does not exist',
          ],
          missingFeedback: 'When is the only moment the expiry should be set?',
        },
      ],
      hints: [
        '`INCR` on a missing key creates it with no deadline at all, which is why the expiry is there.',
        'Calling `EXPIRE` unconditionally pushes that deadline forward on every request.',
        'Guard it: `if (used === 1) await redis.expire(key, 60);`',
      ],
    },
    canonicalAnswer:
      'Every request pushes the deadline another 60 seconds out, so a client that keeps calling never lets the key expire and its counter never resets back to zero. Set the expiry only when the counter is created, which is when INCR returns 1.',
    solution: code(
      'js',
      'const used = await redis.incr(key);',
      '',
      '// INCR creates a missing key with no deadline, so the first request sets one.',
      '// Setting it again on every request means the counter never expires.',
      'if (used === 1) await redis.expire(key, 60);'
    ),
    explanation:
      'An `INCR` against a key that does not exist creates it at 1 with no TTL, so something has to set one, and the first request is the only safe moment. Set it again on every request and the deadline outruns the traffic: the counter never resets, the client stays over the limit, and the harder it retries the longer it stays there. Testing misses this because a quiet key does eventually expire, so it only appears under the load the limiter was written for. One honest weakness survives the fix, which is the boundary: a client that spends its allowance at the end of one window and again at the start of the next gets double the limit in a couple of seconds.',
  },

  {
    slug: 'http-cache-immutable-asset',
    title: 'Caching a fingerprinted bundle',
    category: 'http',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'short-text',
    prompt: md(
      'The build emits `/assets/app.4f2c9d.js`, and the next build emits a different filename. The bytes behind a given name can never change.',
      '',
      'Write the `Cache-Control` value for that response.'
    ),
    graderConfig: {
      accept: [
        'public, max-age=31536000, immutable',
        'max-age=31536000, immutable',
        'public,max-age=31536000,immutable',
      ],
      acceptPatterns: ['(?=[\\s\\S]*max-?age\\s*=\\s*\\d{4,})(?=[\\s\\S]*immutable)'],
      nearMisses: {
        'max-age=31536000':
          'The lifetime is right. One more token tells the browser not to revalidate it on a reload either.',
        'no-store':
          'These bytes are safe to keep. Nothing about this file has to stay off the disk.',
        'no-cache':
          'That stores it and revalidates before every reuse. Right for the HTML, wasteful here.',
        public: '`public` says shared caches may store it, and says nothing about for how long.',
      },
      hints: [
        'The filename carries a hash of the contents, so this URL can never go stale.',
        'Give it the longest lifetime you are willing to write, and stop the reload revalidation too.',
        '`public, max-age=31536000, immutable`. A year, which is the conventional ceiling.',
      ],
    },
    canonicalAnswer: 'public, max-age=31536000, immutable',
    solution: code(
      'http',
      '# The hashed asset. The name changes when the bytes change.',
      'Cache-Control: public, max-age=31536000, immutable',
      '',
      '# The HTML that names it. Cheap to check, and must never be a version behind.',
      'Cache-Control: no-cache'
    ),
    explanation:
      'The hash in the filename is what makes a year safe: changed bytes are a changed URL, so a stored copy can never be wrong. `immutable` is the second half of that promise, and it earns its place because a reload otherwise sends a conditional request for every asset on the page, and a screenful of `304`s is still a screenful of round trips. The pairing is the part worth memorising: the asset gets a year, the HTML that names it gets `no-cache`, and one cheap revalidation picks up every new filename at once. Put a long `max-age` on an unhashed URL instead and you have shipped something you cannot recall.',
  },

  {
    slug: 'http-stale-while-revalidate',
    title: 'The request that pays for everyone else',
    category: 'http',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'short-text',
    prompt: md(
      'A report takes two seconds to build and is served with `Cache-Control: max-age=60`. Once a minute, one unlucky request waits the full two seconds while every other request is instant.',
      '',
      'Name the `Cache-Control` directive that hands that request the stored copy and refreshes it behind the response.'
    ),
    graderConfig: {
      accept: ['stale-while-revalidate', 'stale while revalidate'],
      acceptPatterns: ['stale-?\\s*while-?\\s*revalidate'],
      nearMisses: {
        'stale-if-error':
          'Same RFC, different trigger: that one covers a 5xx from upstream, not plain staleness.',
        'must-revalidate':
          'That forbids serving a stale copy. You want the directive that permits it, briefly.',
        'no-cache':
          'That makes every reuse wait for the server, which is the waiting you are removing.',
        'max-age': 'max-age sets how long it stays fresh. This is about the moment after that.',
      },
      hints: [
        'The stored copy is seconds past its freshness. It is late rather than wrong.',
        'RFC 5861 adds a directive for exactly this: serve the stale copy now, fetch a new one behind it.',
        '`Cache-Control: max-age=60, stale-while-revalidate=600`',
      ],
    },
    canonicalAnswer: 'stale-while-revalidate',
    solution: code(
      'text',
      'Cache-Control: max-age=60, stale-while-revalidate=600',
      '',
      '0-60s      fresh:  served from cache, no request at all',
      '60-660s    stale:  served from cache immediately, revalidated in the background',
      '660s+      stale:  the next request waits for the origin'
    ),
    explanation:
      '`max-age` is a cliff, and the request that arrives one second after it lapses pays for everybody. That is why a cheap endpoint has an expensive tail, and why the tail gets worse the more traffic you have, because more clients queue behind the one rebuild. `stale-while-revalidate` turns the cliff into a ramp: for that many seconds past freshness a cache may answer with what it holds and refresh behind the response, so nobody waits. What you are buying it with is bounded staleness, so pick the window from how out of date the number is allowed to be. RFC 5861 has a companion, `stale-if-error`, that does the same for a 500, 502, 503 or 504 upstream: keep serving the old copy rather than passing the error on.',
  },

  {
    slug: 'http-age-header',
    title: 'Finding out who answered',
    category: 'http',
    difficulty: 'easy',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      'A price is wrong for everyone, including a browser that has never visited the site. `curl -sI` against the public URL shows:',
      '',
      code('http', 'HTTP/2 200', 'cache-control: public, max-age=60', 'etag: "8f21c"'),
      '',
      'Name the response header that would tell you a cache in the middle answered rather than your server.'
    ),
    graderConfig: {
      accept: ['age', 'the age header', 'age header'],
      acceptPatterns: ['(^|[^-\\w])age\\b'],
      nearMisses: {
        'max-age':
          'That is the lifetime the origin set. You want the one saying how much is spent.',
        etag: 'The ETag identifies the version, not who handed it to you.',
        date: 'Date is when the response was generated, and every response carries one.',
        'x-cache': 'Some CDNs do send that, and it is not standardised. There is one in the spec.',
        'cache-control': 'Cache-Control is instructions going out. You want what came back.',
      },
      hints: [
        'Your server never sends it with a meaningful value. Only something holding a copy does.',
        'RFC 9111 defines it as the time since the response was generated or validated at the origin.',
        '`Age`. Anything above zero means a cache answered.',
      ],
    },
    canonicalAnswer: 'Age',
    solution: code(
      'text',
      '$ curl -sI https://shop.example.com/api/prices',
      'cache-control: public, max-age=60',
      'age: 47      <- an edge answered, with 13 seconds of freshness left',
      '',
      '$ curl -sI https://origin.shop.example.com/api/prices',
      'age: 0       <- the origin. Still wrong here means the edge is innocent.'
    ),
    explanation:
      "`Age` is the sender's estimate of the time since the response was generated or validated at the origin, so anything above zero means a cache answered and your handler never ran. One number splits the search in half: subtract it from `max-age` to see how long the bad copy has left, then repeat the request against the origin hostname to find out which side of the network line it is coming from. It only sees HTTP caches, though. Below your own front door, the `Map` in module scope, the Redis entry, the ORM identity map and the database buffer pool each have their own lifetime, and none of them will ever show up in a header.",
  },

  {
    slug: 'http-offset-cost',
    title: 'What a deep OFFSET costs',
    category: 'http',
    difficulty: 'easy',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      "A list endpoint's query ends `ORDER BY created_at DESC LIMIT 20 OFFSET 100000`. Page 1 is instant, this page takes seconds, and the index is being used.",
      '',
      'How many rows does the database produce in sorted order before it can return those twenty?'
    ),
    graderConfig: {
      accept: ['100020', '100,020', '100 020'],
      acceptPatterns: ['\\b100[,. ]?020\\b'],
      nearMisses: {
        '20': 'Twenty come back. The question is how many had to exist for that to happen.',
        '100000': 'That is how many get discarded. You still asked for twenty on top.',
        '100,000': 'That is how many get discarded. You still asked for twenty on top.',
      },
      hints: [
        '`OFFSET` is not a place to start reading from.',
        'The server computes everything up to and including your window, then throws the skipped rows away.',
        '100,020: the hundred thousand it skips, plus the twenty you asked for.',
      ],
    },
    canonicalAnswer: '100020',
    solution: code(
      'sql',
      '-- 100,020 rows produced, 100,000 discarded, and worse on every page.',
      'SELECT id, created_at FROM orders ORDER BY created_at DESC LIMIT 20 OFFSET 100000;',
      '',
      '-- Keyset: 20 rows produced, and the same plan on page 5000 as on page 1.',
      'SELECT id, created_at FROM orders',
      ' WHERE (created_at, id) < ($1, $2)',
      ' ORDER BY created_at DESC, id DESC',
      ' LIMIT 20;'
    ),
    explanation:
      'The Postgres docs put it plainly: rows skipped by `OFFSET` still have to be computed inside the server. So a page costs what its depth costs rather than what its size costs, and nothing about that is visible while you are testing on page 1. It arrives a year late, when the table has grown, and it arrives first for whoever pages deepest, which is usually a script rather than a person. Keyset pagination replaces the count with a value the index can seek to, so twenty rows are produced for twenty returned. What you give up is real: no jumping to page 47, and a total count still costs a second query.',
  },

  {
    slug: 'http-cors-expose-headers',
    title: 'The header the browser hides',
    category: 'http',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'short-text',
    prompt: md(
      'A paginated list endpoint answers with `X-Total-Count: 482`. curl shows the header and so does the network tab, but in the page:',
      '',
      code(
        'js',
        "const res = await fetch('https://api.example.com/orders'); // cross-origin",
        "res.headers.get('X-Total-Count'); // null"
      ),
      '',
      'Name the response header the server has to add.'
    ),
    graderConfig: {
      accept: [
        'access-control-expose-headers',
        'expose-headers',
        'access control expose headers',
        'expose headers',
      ],
      acceptPatterns: ['expose-?\\s*headers'],
      nearMisses: {
        'access-control-allow-headers':
          'Allow-Headers covers request headers the browser may send. This is about reading the response.',
        'access-control-allow-origin':
          'That decides whether the response can be read at all, and it is already working.',
        vary: 'Vary keeps a shared cache honest. It says nothing about what script may read.',
      },
      hints: [
        'The response arrived intact. What script may read off it is a separate decision.',
        'A cross-origin response exposes seven headers by default, and yours is not one of them.',
        '`Access-Control-Expose-Headers: X-Total-Count`',
      ],
    },
    canonicalAnswer: 'Access-Control-Expose-Headers',
    solution: code(
      'js',
      "res.setHeader('X-Total-Count', String(total));",
      "res.setHeader('Access-Control-Expose-Headers', 'X-Total-Count');"
    ),
    explanation:
      'CORS gates two things separately. Whether script may read the response at all is `Access-Control-Allow-Origin`, and which of its headers script may see defaults to a safelist of seven: `Cache-Control`, `Content-Language`, `Content-Length`, `Content-Type`, `Expires`, `Last-Modified` and `Pragma`. Your own header is not on it, so `headers.get` returns `null` while every tool outside the browser shows the header plainly, which is what makes this look like the server dropping it. List what you want exposed, comma separated, and put it on the real response rather than on the preflight. Same-origin calls never meet any of this, so the bug appears the day the API moves to its own subdomain.',
  },

  {
    slug: 'http-transport-queue',
    title: 'The work that has to wait',
    category: 'http',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'short-text',
    prompt: md(
      'A user uploads a video. It then has to be transcoded, scanned and emailed about, and the transcoder is down for ten minutes.',
      '',
      'The upload itself is a request. Name what the work behind it belongs on, so that ten minutes down costs nothing.'
    ),
    graderConfig: {
      accept: [
        'queue',
        'a queue',
        'message queue',
        'a message queue',
        'job queue',
        'a job queue',
        'task queue',
      ],
      acceptPatterns: ['\\bqueue\\b'],
      nearMisses: {
        websocket: 'A socket delivers to whoever is connected now, and nobody is connected.',
        webhook: 'That is someone else pushing to you, and the retry policy would be theirs.',
        sse: 'An event stream loses what it sends while nobody is listening.',
        polling: 'Polling asks again. It does not hold the work while the worker is away.',
        retry: 'Retrying inside the handler keeps the user waiting for work that is not theirs.',
      },
      hints: [
        'Ask what happens to the message while nobody is listening: is it lost, or does it wait?',
        'Every transport on the page loses it. One thing holds it.',
        'A queue. The upload answers straight away and the work runs when the worker is back.',
      ],
    },
    canonicalAnswer: 'a queue',
    solution: code(
      'text',
      'Who starts it      the upload is the user; the work is started by whatever drains the queue',
      'Directions         one way, deferred',
      'Nobody listening   it waits. That is the whole difference from a transport',
      'Cost               infrastructure you now run'
    ),
    explanation:
      'Four questions pick a transport, and the third one decides whether you want a transport at all: what happens to a message sent while nobody is listening. Request/response, server-sent events and WebSockets all lose it. A queue holds it, which is why "this must happen eventually" is a different requirement from "this must happen now". The tell is in the sentence people use to describe the work: transcode it, scan it, email someone. None of that is the user\'s request, and none of it should sit inside their round trip. Answer as soon as the bytes are safe, enqueue the rest, and a ten-minute outage becomes a queue ten minutes deep instead of an error page.',
  },

  {
    slug: 'http-webhook-raw-body',
    title: 'The signature that never matches',
    category: 'http',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'A GitHub webhook handler computes the HMAC exactly as the docs describe, and the signature never matches. The payload logs perfectly:',
      '',
      code(
        'js',
        'app.use(express.json());',
        '',
        "app.post('/webhooks/github', (req, res) => {",
        '  const body = JSON.stringify(req.body);',
        "  const expected = 'sha256=' + createHmac('sha256', SECRET).update(body).digest('hex');",
        "  if (expected !== req.get('X-Hub-Signature-256')) return res.sendStatus(401);",
        '});'
      ),
      '',
      'Explain why it never matches, and name the fix.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'raw body',
            'raw request',
            'raw bytes',
            'exact bytes',
            'bytes they sent',
            'bytes that were sent',
            'original bytes',
            'byte for byte',
            'unparsed',
            'as sent',
            'express.raw',
          ],
          missingFeedback: 'What exactly did the sender sign, and what do you have to hash?',
        },
        {
          synonyms: [
            'json.stringify',
            'stringify',
            're-serial',
            'reserial',
            'serialis',
            'serializ',
            'express.json',
            'body parser',
            'json parser',
            'already parsed',
            'key order',
            'whitespace',
            'escap',
            'different bytes',
          ],
          missingFeedback: 'What has already happened to the body by the time your handler runs?',
        },
      ],
      hints: [
        'The signature covers bytes, and you are hashing a re-serialisation of an object.',
        'express.json() consumed the request; stringifying it back gives different key order, whitespace and escapes.',
        'Mount `express.raw({ type: "application/json" })` on this route and HMAC `req.body` directly.',
      ],
    },
    canonicalAnswer:
      'express.json() parsed the request before the handler ran, and JSON.stringify of that object produces different bytes: another key order, other whitespace, a different escape. The HMAC covers the exact bytes GitHub sent, so hash the raw body instead by mounting express.raw on this route and leaving the JSON parser everywhere else.',
    solution: code(
      'js',
      '// express.raw, not express.json: the signature covers the exact bytes they sent.',
      "app.post('/webhooks/github', express.raw({ type: 'application/json' }), (req, res) => {",
      "  const expected = 'sha256=' + createHmac('sha256', SECRET).update(req.body).digest('hex');",
      "  const sent = req.get('X-Hub-Signature-256') ?? '';",
      '',
      '  // timingSafeEqual throws on a length mismatch, so compare lengths first.',
      '  const signed =',
      '    sent.length === expected.length &&',
      '    timingSafeEqual(Buffer.from(sent), Buffer.from(expected));',
      '  if (!signed) return res.sendStatus(401);',
      '});'
    ),
    explanation:
      'A signature is over bytes, and there is no route back from a parsed object to the bytes it came from: key order, whitespace and Unicode escaping are all free choices the sender already made and your serialiser will make differently. The raw body is the only thing you can hash, which is why the webhook route gets `express.raw` while everything else keeps the JSON parser. Two things belong on the same line. Compare with `timingSafeEqual` rather than `===`, checking the lengths first because it throws on a mismatch, so a comparison cannot leak the correct signature a byte at a time. And a valid signature says nothing about when: anyone who captured one delivery can replay it for as long as the secret lives, which is why Stripe signs a timestamp alongside the body.',
  },

  {
    slug: 'http-websocket-auth-header',
    title: 'Authenticating a socket',
    category: 'http',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'The API is behind `Authorization: Bearer …`, and this is the whole of the browser API for opening a socket:',
      '',
      code('js', "const socket = new WebSocket('wss://api.example.com/room/42');"),
      '',
      'Explain the problem that leaves you with, and name a way round it.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'no headers',
            'cannot set headers',
            "can't set headers",
            'no way to set headers',
            'no request headers',
            'cannot send headers',
            'no authorization header',
            'no auth header',
            'takes a url',
            'only a url',
            'no options',
            'no second argument',
          ],
          missingFeedback: 'What can the constructor not do that `fetch` can?',
        },
        {
          synonyms: [
            'cookie',
            'ticket',
            'query string',
            'query param',
            'in the url',
            'subprotocol',
            'sub-protocol',
            'sec-websocket-protocol',
            'first message',
          ],
          missingFeedback: 'Name a way to get the credential to the server anyway.',
        },
      ],
      hints: [
        'Compare it with `fetch`. What is the second argument here?',
        'The handshake is an HTTP request the browser builds, and the API gives you no way into it.',
        'A cookie on the handshake, a short-lived ticket in the query string, or the token as a subprotocol.',
      ],
    },
    canonicalAnswer:
      'The constructor takes a url and an optional subprotocol list, so there is nowhere to set an Authorization header on the handshake. The ways round it are a cookie sent with the handshake, a short-lived single-use ticket in the query string, or passing the token as a subprotocol.',
    solution: code(
      'js',
      '// A short-lived, single-use ticket, fetched over the authenticated HTTP API.',
      "const { ticket } = await fetch('/ws-ticket', { headers: auth }).then((r) => r.json());",
      'const socket = new WebSocket(`wss://api.example.com/room/42?ticket=${ticket}`);',
      '',
      '// Or, same origin: a cookie the browser attaches to the handshake by itself.'
    ),
    explanation:
      'The handshake is an ordinary HTTP GET, so the server can authenticate it exactly as it authenticates anything else. The browser is the constraint: `new WebSocket(url, protocols)` takes a URL and an optional subprotocol list, and there is no place to put a header. A cookie is the least surprising answer when the socket shares an origin with the app, because the browser attaches it to the handshake without being asked. A ticket in the query string is the answer when it does not, and the two words that make it safe are short-lived and single-use, because URLs end up in access logs, referrers and error reports. Authenticating in the first message after `open` also works, and then the deadline is yours to enforce: a socket that is allowed to sit there unauthenticated is a socket anybody can open.',
  },

  {
    slug: 'http-retry-amplification',
    title: 'Retries that multiply',
    category: 'http',
    difficulty: 'easy',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A slow dependency turned into an outage. The HTTP client retries three times, the service wrapper around it retries three times, and the caller retries three times.',
      '',
      'Work out how many requests one user action sends, and name the fix.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            '27',
            'twenty-seven',
            'twenty seven',
            'multiply',
            'multiplies',
            'multiplied',
            'compound',
            'cubed',
            'product',
          ],
          missingFeedback: 'Three layers of three attempts each. How many requests is that?',
        },
        {
          synonyms: [
            'one layer',
            'a single layer',
            'single layer',
            'only one',
            'one place',
            'single place',
            'one level',
            'outermost',
            'top level',
          ],
          missingFeedback: 'Name the fix. Where should the retrying live?',
        },
      ],
      hints: [
        'The retries do not add up. Work out what three layers of three attempts come to.',
        'Twenty-seven requests for one user action, all aimed at something already struggling.',
        'Retry at one layer, cap the attempts, and put the deadline on the whole operation.',
      ],
    },
    canonicalAnswer:
      'Twenty-seven. The layers multiply rather than add, so three attempts at each of three levels is 27 requests for one user action, aimed at something that is already struggling. Retry in one layer only, cap the attempts, and put the deadline on the whole operation rather than on each attempt.',
    solution: code(
      'text',
      'caller          3 attempts',
      '  service     x 3 attempts',
      '    client    x 3 attempts',
      '              = 27 requests for one user action',
      '',
      'Retry in one place. Cap the attempts. One deadline for the whole operation.'
    ),
    explanation:
      "Retry counts multiply through a stack rather than adding, so every layer that quietly helps makes the incident worse, and the layers are easy to miss because two of them are usually somebody else's defaults. Time multiplies too: three attempts against a three-second timeout is nine seconds per layer, so the request is still open long after the user gave up. Pick one layer to retry at, usually the one that knows whether the call is safe to repeat at all, and give the whole operation a single deadline the attempts have to fit inside. `Retry-After` beats your formula whenever the server sends one, and full jitter, `random(0, min(cap, base * 2 ** attempt))`, is what stops every client that failed together from arriving back together.",
  },

  {
    slug: 'http-read-finish-middleware',
    title: 'The first middleware in the stack',
    category: 'http',
    difficulty: 'medium',
    relevance: 'occasional',
    tags: ['reading'],
    type: 'explain',
    prompt: md(
      'The first thing registered on an Express app, and nobody on the team wrote it:',
      '',
      code(
        'js',
        'app.use((req, res, next) => {',
        '  const start = process.hrtime.bigint();',
        '',
        "  res.on('finish', () => {",
        '    const ms = Number(process.hrtime.bigint() - start) / 1e6;',
        '    logger.info({ method: req.method, path: req.path, status: res.statusCode, ms });',
        '  });',
        '',
        '  next();',
        '});'
      ),
      '',
      'In one sentence: what does this produce, and at what moment?'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'after the response',
            'once the response',
            'when the response',
            'after the request',
            'finish',
            'has been sent',
            'is sent',
            'was sent',
            'completed',
            'completes',
          ],
          missingFeedback:
            'Name the moment the log line is written: before the handler, or after the response?',
        },
        {
          synonyms: [
            'status',
            'duration',
            'how long',
            'milliseconds',
            'time it took',
            'latency',
            'elapsed',
            'timing',
          ],
          missingFeedback:
            'Say what the line carries. Name something it can only know at that moment.',
        },
      ],
      hints: [
        '`next()` returns immediately. Nothing here waits for the handler to finish.',
        "The work is inside a listener for the response's `finish` event.",
        'That event fires once the response has been handed to the socket, which is why both the status and the duration are known by then.',
      ],
    },
    canonicalAnswer:
      'One log line per request, written after the response has been sent, carrying the method, path, final status and how long the request took.',
    solution: md(
      'One line per request, at the moment the response finishes:',
      '',
      code(
        'text',
        'middleware: calling next()',
        'handler: started',
        'handler: responding',
        'LOG GET /orders 200 63.5ms'
      )
    ),
    explanation:
      'Registering a listener is not doing the work: this middleware subscribes to `finish` and calls `next()` in the same tick, so the request goes straight on to the handler and the callback runs much later, once the response has been written to the socket. That is what makes the line worth having, because `res.statusCode` and the elapsed time are both only true at the end, whichever handler or error path produced them. It also covers responses the router never reached: a request that matched no route still finishes, so its 404 is logged by the same line. `finish` means the response was handed off, not that the client received it; for the case where the connection died first, listen for `close` as well and compare `res.writableFinished`.',
  },

  {
    slug: 'http-breaking-change-tightening',
    title: 'The validation that broke the contract',
    category: 'http',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'A `country` field used to accept any string. This release adds validation so it only accepts',
      'ISO codes, and it ships as a patch with no version bump. Nothing was removed and no endpoint',
      'changed.',
      '',
      'Explain why integrators start failing, and state the rule this violates.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['tighten', 'narrow', 'stricter', 'restrict', 'required', 'validation'],
          missingFeedback:
            'What did the change do to the range of inputs the endpoint used to accept?',
        },
        {
          synonyms: ['breaking', 'break', 'new version', 'major'],
          missingFeedback: 'Name what kind of change this is, in versioning terms.',
        },
        {
          synonyms: ['used to work', 'previously valid', 'existing client', 'already sending'],
          missingFeedback: 'Who fails, and what were they doing before the release that now fails?',
        },
      ],
      hints: [
        'Nothing was removed, so ask what was narrowed instead.',
        'A request that succeeded yesterday and fails today is a broken promise, whatever the diff looks like.',
        'The rule is that you may add, but you may not remove or tighten.',
      ],
    },
    canonicalAnswer:
      'Tightening validation is a breaking change: requests that were previously valid now fail, so a client already sending a free-text country breaks without changing anything. The rule is that you can add, but you cannot remove or tighten, and narrowing accepted values is tightening even though nothing was removed.',
    solution: md(
      'Breaking. The safe version of this change is to accept both, warn on the old shape, and',
      'measure who is still sending it before the range narrows.'
    ),
    explanation:
      'The published rules from the APIs that carry the most third-party integrations agree on the shape: adding a resource, an optional parameter or a response field is safe, and removing or renaming one is not. **Tightening is the half that gets missed**, because it does not look like an API change in the diff: narrowing an enum, promoting an optional field to required, changing a default, and adding validation to a field that used to wave junk through are all breaking. So is removing a response field a client reads, which is why "clients must tolerate fields they do not recognise" belongs in your documentation on day one rather than in the incident review.',
  },

  {
    slug: 'http-version-header-vary',
    title: 'The v2 client that got a v1 response',
    category: 'http',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      'The API version moved out of the path and into a request header, so one URL now has two',
      'response shapes. A shared cache in front of it starts serving the old shape to new clients,',
      'intermittently.',
      '',
      'Name the response header that fixes it.'
    ),
    graderConfig: {
      accept: ['vary', 'vary header', 'the vary header'],
      acceptPatterns: ['\\bvary\\b'],
      nearMisses: {
        'cache-control':
          'That controls whether and how long it caches, not what counts as a different request.',
        etag: 'A validator tells the cache whether its copy is stale, not that two requests are different.',
        'content-type': 'That describes the body. The cache still has one key for both versions.',
      },
      hints: [
        'The cache key is the URL, and the URL no longer identifies the response on its own.',
        'One header exists to tell a cache which request headers change the representation.',
      ],
    },
    canonicalAnswer: 'Vary',
    solution: code(
      'http',
      'HTTP/1.1 200 OK',
      'X-Api-Version: 2024-11-01',
      'Vary: X-Api-Version',
      '',
      '# Without it, one cache entry per URL serves whichever shape arrived first.'
    ),
    explanation:
      'Any request header that changes the representation has to appear in `Vary`, or a shared cache stores one entry per URL and hands it to everybody. This failure is intermittent by nature: it only appears once both versions are warm in the same cache, which is usually after the rollout looked fine. It is the standing cost of header-based versioning, and the thing you buy for it is that the URL keeps one identity, so a client can migrate one call at a time instead of reprinting every link it stored.',
  },

  {
    slug: 'http-retired-version-410',
    title: 'Answering a version you turned off',
    category: 'http',
    difficulty: 'easy',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      'A client calls an API version that was retired last month. Which status code says the',
      'resource existed and is intentionally finished, rather than that it was never here?'
    ),
    graderConfig: {
      accept: ['410', '410 gone', 'gone'],
      acceptPatterns: ['\\b410\\b'],
      nearMisses: {
        404: 'That says "no such thing", which sends the integrator looking for a typo rather than a migration guide.',
        400: 'The request is well formed. Nothing about it is malformed.',
        426: 'Upgrade Required is about switching protocol, not about a retired API version.',
        301: 'A redirect implies the old call still works somewhere else, and a breaking version does not.',
      },
      hints: [
        'The distinction is between "never existed" and "existed, and is gone on purpose".',
        'It is in the 4xx range, and it is the permanent sibling of 404.',
      ],
    },
    canonicalAnswer: '410',
    solution: code(
      'http',
      'HTTP/1.1 410 Gone',
      'Content-Type: application/json',
      '',
      '{ "error": "api_version_retired", "docs": "https://docs.example.com/migration" }'
    ),
    explanation:
      '`410 Gone` says the resource existed and is intentionally finished, which is a better ending than `404` because it tells an integrator the problem is a migration rather than a typo. GitHub answers a request for a retired version this way, and supports each version for at least 24 months after its successor ships. Put the migration URL in the body: the person reading the log is not the person who wrote the integration, and a status code alone gives them nowhere to go.',
  },

  {
    slug: 'http-deprecation-vs-sunset',
    title: 'Two dates on a dying endpoint',
    category: 'http',
    difficulty: 'easy',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      'A response carries both `Deprecation` and `Sunset`. One says the endpoint is discouraged, the',
      'other says when it is expected to stop responding.',
      '',
      'Which header carries the date it stops responding?'
    ),
    graderConfig: {
      accept: ['sunset', 'the sunset header', 'sunset header'],
      acceptPatterns: ['\\bsunset\\b'],
      nearMisses: {
        deprecation:
          'That one carries the date it was or will be deprecated, which is the announcement rather than the ending.',
        expires: 'That is about cache freshness for this response, not the life of the endpoint.',
        'retry-after':
          'That says when to try again, which is the opposite of what is happening here.',
      },
      hints: [
        'One is the announcement, the other is the ending.',
        'The one you want is named after the end of the day.',
      ],
    },
    canonicalAnswer: 'Sunset',
    solution: code(
      'http',
      'Deprecation: @1751328000',
      'Sunset: Wed, 01 Jul 2026 23:59:59 GMT',
      'Link: <https://docs.example.com/migration>; rel="deprecation"',
      '',
      '# Sunset must not be earlier than the deprecation date.'
    ),
    explanation:
      '`Deprecation` (RFC 9745) carries the date a resource was or will be deprecated, as a structured field date. `Sunset` (RFC 8594) carries the date it is expected to stop responding, as an HTTP date, and must not be earlier than the deprecation date. RFC 9745 also registers a `deprecation` link relation, so the response can point at the migration guide. Both are **hints**: neither turns anything off, and no client library reads them for you. The step that actually tells you whether you can retire the version is counting requests per version per client, so that "who breaks" is a list of names rather than a guess.',
  },

  {
    slug: 'http-version-in-path-or-header',
    title: 'Where the version goes',
    category: 'http',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'You are choosing between `/v2/reports` and a `X-Api-Version` request header for a public API',
      'with many third-party integrations.',
      '',
      'Explain what the header buys you and what it costs.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'one call',
            'incremental',
            'gradual',
            'endpoint at a time',
            'stable url',
            'same url',
          ],
          missingFeedback:
            'What can a client do under header versioning that path versioning makes hard?',
        },
        {
          synonyms: ['vary', 'cache'],
          missingFeedback:
            'What has to happen in front of the API once the URL stops identifying the response?',
        },
        {
          synonyms: ['invisible', 'not visible', 'browser', 'address bar', 'harder to see', 'curl'],
          missingFeedback:
            'What do you give up in day-to-day use by taking the version out of the URL?',
        },
      ],
      hints: [
        'Ask what each option versions: the surface, or the call.',
        'A stable URL means the resource keeps one identity, so clients can move gradually.',
        'The cost is that every cache in the path now has to `Vary` on it, and the version is invisible in a browser.',
      ],
    },
    canonicalAnswer:
      'The header keeps one stable URL, so a resource has a single identity and a client can migrate one call at a time instead of moving to new URLs all at once. It costs you caching correctness, because every cache in the path must Vary on the header or a v1 response reaches a v2 client, and it makes the version invisible in an address bar or a quick curl.',
    solution: md(
      'Header versioning for a broad public surface, path versioning when the API is small or',
      'internal and the visibility is worth more than the migration story.'
    ),
    explanation:
      'Path versioning versions the **surface**: one breaking change to one resource reprints every URL in your documentation and every link a client stored, and the same resource ends up with two identities, which matters for caching and for anything that stores links. A header versions the **call**, so the URL is stable and a client moves one endpoint at a time. That is why anyone carrying many external integrations ends up at the header, and why the migration story is the real argument rather than aesthetics. The media type (`Accept: application/vnd.example.v2+json`) is content negotiation used as designed, and it is rare because client tooling makes it awkward.',
  },

  {
    slug: 'http-upload-size-limit',
    title: 'The limit that only stops honest clients',
    category: 'http',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'An upload endpoint accepts at most 25 MB, and enforces it like this:',
      '',
      code(
        'js',
        "const declared = Number(req.headers['content-length']);",
        'if (declared > MAX_BYTES) return res.status(413).end();',
        '',
        'await pipeline(req, createWriteStream(destination));'
      ),
      '',
      'Say what that check misses, and where the limit has to live instead.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'claim',
            'claims',
            'lie',
            'lies',
            'lying',
            'cannot trust',
            'not trustworthy',
            'client controls',
            'sender',
            'chunked',
            'no content-length',
            'without a content-length',
            'missing',
            'absent',
            'spoof',
          ],
          missingFeedback:
            'The header arrived with the request and nothing has checked it. Say who wrote it, or what a request without one does here.',
        },
        {
          synonyms: [
            'count',
            'counting',
            'as they arrive',
            'as it arrives',
            'as it streams',
            'while reading',
            'bytes received',
            'destroy',
            'abort',
            'stop reading',
            'cut it off',
            'in the stream',
          ],
          missingFeedback:
            'Name the number that cannot be faked, and what you do to the request once it is exceeded.',
        },
      ],
      hints: [
        'Everything in a request except the bytes themselves is something the sender chose to say.',
        'A chunked request carries no `Content-Length` at all. Work out what this code does with one.',
        'The only honest measure is the one you take while the body is arriving.',
      ],
    },
    canonicalAnswer:
      'It trusts a number the sender wrote. A client can understate it, and a chunked request carries no Content-Length at all, in which case the comparison is against NaN and the check passes everything. Count the bytes as they arrive and destroy the request as soon as the running total passes the cap, so the limit is enforced against what actually reached you rather than against what was announced.',
    solution: md(
      'The header is a claim, and `Number(undefined)` is `NaN`, so a chunked upload sails straight through a `>` comparison.',
      '',
      code(
        'js',
        'let seen = 0;',
        'const cap = new Transform({',
        '  transform(chunk, _encoding, done) {',
        '    seen += chunk.length;',
        "    done(seen > MAX_BYTES ? new Error('too large') : null, chunk);",
        '  },',
        '});',
        '',
        'await pipeline(req, cap, createWriteStream(destination));'
      ),
      '',
      'Keep the header check if you like: it refuses the honest oversized upload before any of it is transferred. It is an optimisation, not the limit.'
    ),
    explanation:
      '`Content-Length` is arithmetic the sender did, so a header check binds only the clients that were not trying, and a chunked request has no length to check at all, which turns the comparison into one against `NaN` and lets everything through. The number that binds everybody is the one you count while the body arrives, which puts the enforcement in the stream: add up the chunk lengths and destroy the request the moment the total passes the cap. Doing it there also bounds what the rejection costs, since the alternative is learning the real size after buffering the thing you were refusing to buffer.',
  },
];
