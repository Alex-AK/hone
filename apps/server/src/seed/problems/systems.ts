import { code, codeProblem, md, type ProblemDraft } from './types';

export const systemsProblems: ProblemDraft[] = [
  {
    slug: 'sys-scalability-horizontal-vertical',
    title: 'The other way to scale',
    category: 'systems',
    difficulty: 'easy',
    relevance: 'foundational',
    type: 'explain',
    prompt: md(
      'Your database server is maxed out at 100% CPU during peak traffic. One fix is a bigger box: more CPU, more RAM, same single machine.',
      '',
      'Name the other approach, and the one problem it introduces that a single bigger box never has.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'horizontal scaling',
            'scale out',
            'add machines',
            'add nodes',
            'more servers',
            'more machines',
          ],
          missingFeedback: 'What is the other axis of scaling, besides a bigger machine?',
        },
        {
          synonyms: [
            'shared state',
            'session affinity',
            'in-memory',
            'distributed state',
            'consistency across nodes',
            'coordinate state',
            'stay in sync',
          ],
          missingFeedback: 'What has to change about anything that used to live in one process?',
        },
      ],
      hints: [
        'Vertical scaling is a bigger box: more CPU, more RAM, same machine, until you hit a limit.',
        'The other axis adds more machines instead of upgrading one.',
        'State that used to live safely in one process, like a session or an in-memory cache, now needs a plan for living on many.',
      ],
    },
    canonicalAnswer:
      'The other approach is horizontal scaling: add more machines behind a load balancer instead of upgrading the one you have. It avoids the ceiling a single box eventually hits, but it introduces a problem vertical scaling never has: state that lived safely in one process now has to be shared or replicated across machines, so sessions and in-memory caches need a plan to stay in sync across nodes.',
    solution: md(
      '- **Vertical scaling**: bigger machine. Simple, but hits a hardware ceiling and stays a single point of failure.',
      '- **Horizontal scaling**: more machines behind a load balancer. No hard ceiling, but state that lived in one process (sessions, in-memory caches) now has to be shared or replicated across nodes.'
    ),
    explanation:
      'Vertical scaling stays simple because nothing changes about how the app is built: one process, one memory space. It just runs out of headroom, and hardware at the top of the range gets disproportionately expensive. Horizontal scaling has no such ceiling, but the app can no longer assume a single memory space: two requests for the same user might land on two different machines, so anything that used to be a plain variable, a session or an in-process cache, has to move to something shared, like Redis or a database, or be replicated on purpose.',
  },

  {
    slug: 'sys-latency-vs-throughput',
    title: 'Faster requests, same limit',
    category: 'systems',
    difficulty: 'easy',
    relevance: 'foundational',
    type: 'explain',
    prompt: md(
      'You add caching and a single request now finishes in 20ms instead of 200ms, but the service still falls over at the same requests-per-second it always did.',
      '',
      "Name the two measurements this scenario is separating, and explain why improving one didn't move the other."
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['latency', 'response time', 'time per request', 'how long one request takes'],
          missingFeedback: 'Name the measurement that dropped from 200ms to 20ms.',
        },
        {
          synonyms: ['throughput', 'requests per second', 'rps', 'capacity'],
          missingFeedback: 'Name the measurement that stayed capped.',
        },
        {
          synonyms: [
            'concurrency',
            'number of workers',
            'in parallel',
            'connection pool',
            'bottleneck',
            'worker pool',
          ],
          missingFeedback:
            'What actually sets the ceiling on requests per second, if not per-request speed?',
        },
      ],
      hints: [
        'One measures a single request. The other measures the system as a whole.',
        'Latency is how long one request takes; throughput is how many the system serves per unit time.',
        "Throughput is set by how much can run in parallel: worker count, connection pool size, CPU cores. A faster single request doesn't raise that ceiling.",
      ],
    },
    canonicalAnswer:
      "Latency and throughput. Latency is how long one request takes, and it dropped because caching cut the work per request. Throughput is how many requests the service can handle per second, and that's set by concurrency, the number of workers or connections available to run requests in parallel, not by how fast any single one finishes. If the ceiling is 50 concurrent connections, making each one faster only means the same 50 finish sooner, not that a 51st gets served.",
    solution: md(
      '- **Latency**: time for one request to complete. Caching cut this from 200ms to 20ms.',
      '- **Throughput**: requests served per second, capped by concurrency (workers, connections, cores), not by per-request speed.'
    ),
    explanation:
      'Latency and throughput are related but not the same lever. A faster individual response can raise throughput, if the bottleneck was CPU time, but only when concurrency was never the limit. Here the ceiling comes from somewhere else, a fixed pool of database connections or worker threads, so the extra headroom from caching sits idle: each worker finishes faster and then waits. Fixing throughput means raising the concurrency limit itself, more workers, more connections, more instances behind a load balancer, which is a different fix from making one request faster.',
  },

  {
    slug: 'sys-request-lifecycle',
    title: 'Before the first byte',
    category: 'systems',
    difficulty: 'easy',
    relevance: 'foundational',
    type: 'explain',
    prompt: md(
      "You type a URL you've never visited and hit enter.",
      '',
      'Name the three things that have to happen, in order, before the first byte of the page shows up, starting with turning the domain name into an address.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['dns', 'domain name', 'resolve', 'resolution'],
          missingFeedback: 'What has to happen to the domain name before anything else can start?',
        },
        {
          synonyms: ['tcp', 'handshake', 'connection', 'tls', 'ssl'],
          missingFeedback: 'What has to be established with that address before any data moves?',
        },
        {
          synonyms: ['http request', 'sends the request', 'request', 'response'],
          missingFeedback:
            'What actually gets sent, and what comes back, once the connection is open?',
        },
      ],
      hints: [
        "The browser doesn't have an address yet, only a name.",
        'DNS resolution comes first, then a connection has to be established to that address.',
        'DNS to get the address, TCP (plus TLS for HTTPS) to connect, then the HTTP request and response.',
      ],
    },
    canonicalAnswer:
      "First DNS resolves the domain to an address. Then the browser opens a connection to it, a TCP handshake, followed by a TLS handshake if it's HTTPS. Then it sends the HTTP request over that connection and the server sends back a response, which the browser starts rendering as bytes arrive.",
    solution: md(
      '1. **DNS resolution**: the domain name resolves to an IP address, often through several nameservers.',
      '2. **Connection**: a TCP handshake to that address, followed by a TLS handshake for HTTPS.',
      '3. **HTTP exchange**: the browser sends the request over that connection; the server responds and the browser starts rendering.'
    ),
    explanation:
      "Every one of these steps is a place a slow page turns out to be slow: a cold DNS cache adds a round trip before anything else can start, TLS adds another round trip on top of TCP's own handshake, and only after all of that has anything been sent that the server can act on. This is also why connection reuse matters in practice: HTTP/1.1 keep-alive and HTTP/2 multiplexing exist specifically to avoid repeating the connection and TLS setup for every following request to the same host.",
  },

  {
    slug: 'sys-load-balancer-basics',
    title: 'Two servers, one bad',
    category: 'systems',
    difficulty: 'medium',
    relevance: 'foundational',
    type: 'explain',
    prompt: md(
      'You put a load balancer in front of two identical API servers. One of them starts throwing 500s on every request.',
      '',
      'What does the load balancer need to know to stop sending traffic there, and name one thing that breaks for your app once a request from the same user can land on either server.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'health check',
            'healthcheck',
            'probe',
            'stops routing',
            'takes it out',
            'marks it unhealthy',
            'out of rotation',
            'routes around',
          ],
          missingFeedback: 'How does the load balancer find out one of the servers is unhealthy?',
        },
        {
          synonyms: [
            'session',
            'sticky',
            'in-memory',
            'local state',
            'affinity',
            'server-side session',
          ],
          missingFeedback: 'What kind of data breaks once any request can land on any server?',
        },
      ],
      hints: [
        "The load balancer doesn't know a server is bad on its own; it has to ask.",
        'A periodic health check endpoint, or watching for a run of failed responses, lets it stop routing there.',
        "Anything stored in one server's memory, a session, an in-progress upload, stops being reliably reachable once any request can land on any server.",
      ],
    },
    canonicalAnswer:
      'It needs a health check: the load balancer pings each server on an interval, or watches recent failures, and stops routing to one that fails it, taking it out of rotation until it recovers. Once requests can land on either server, anything held in one process, like an in-memory session, breaks, because the next request from the same user might hit the other server and find nothing there.',
    solution: md(
      '- **Health checks**: the load balancer polls a health endpoint (or tracks failures) and takes a failing server out of rotation.',
      '- **What breaks**: in-memory session state. The next request from the same user can land on the other server, which never saw the session.'
    ),
    explanation:
      "A load balancer's only signal that a server is unhealthy is what it measures itself, a failed health check, a timeout, a run of 5xx responses, so the health check endpoint has to actually exercise something meaningful rather than just confirm the process is running. The state problem is the other half of putting a load balancer in front of anything: once you can no longer assume two requests from the same user hit the same process, session data, in-memory caches and file uploads all need to move to something every server can reach, a shared store like Redis or a database, or you pin a user to one server with sticky sessions and accept that it undoes part of the point of load balancing.",
  },

  {
    slug: 'sys-connection-level-balancing',
    title: 'Round robin, one hot pod',
    category: 'systems',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'Four pods sit behind a round-robin load balancer. All four pass their health checks, the balancer is configured the way you meant, and one pod is serving 90% of the requests. Scaling to five pods changed nothing.',
      '',
      'Explain why round robin is not spreading the load, and name one change that would.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'per connection',
            'per-connection',
            'connection level',
            'connection-level',
            'each connection',
            'new connection',
            'long-lived',
            'long lived',
            'persistent connection',
            'keep-alive',
            'keepalive',
            'http/2',
            'http2',
            'grpc',
            'multiplex',
            'pinned',
          ],
          missingFeedback:
            'Nothing here is misconfigured. What is round robin actually counting out in turn?',
        },
        {
          synonyms: [
            'l7',
            'layer 7',
            'layer-7',
            'service mesh',
            'sidecar',
            'envoy',
            'linkerd',
            'client-side load balancing',
            'client side load balancing',
            'balance in the client',
            'balancing in the client',
            'headless',
            'max requests',
            'connection lifetime',
            'connection age',
            'recycle',
            'rotate',
            'reconnect',
          ],
          missingFeedback:
            'What change would make the balancer choose again, instead of choosing once?',
        },
      ],
      hints: [
        'Nothing is misconfigured, and the fifth pod told you capacity was never the problem.',
        'The balancer picks a backend when a connection arrives, and the client is holding one connection open.',
        'Either route each request at layer 7, or make connections short enough that the client keeps getting balanced again.',
      ],
    },
    canonicalAnswer:
      'Round robin picks a backend per connection, not per request. The client is holding one long-lived connection, an HTTP/2 or gRPC channel or a keep-alive pool that never expires, so it was balanced once when it connected and every request since has been pinned to the pod that choice landed on. To spread it, balance at layer 7 with a proxy or a service mesh sidecar that routes each stream separately, or cap connection age so the client reconnects and gets balanced again.',
    solution: md(
      '- **Why**: round robin chooses per connection, not per request. One long-lived HTTP/2, gRPC or keep-alive connection is balanced once, at connect time, and every request on it lands on the pod that choice picked.',
      '- **A fix**: route each request at layer 7 (a proxy or mesh sidecar that spreads streams), balance in the client against every pod address, or cap connection age so connections turn over and get balanced again.'
    ),
    explanation:
      "Round robin is doing exactly what it says: it deals out connections, and a connection is the only thing an L4 balancer can see. HTTP/2 and gRPC are built to hold one connection open and multiplex every request over it, so the balancing happens once, at connect time, and then never again. William Morgan's write-up on the Kubernetes blog puts it as bluntly as it can be put: once the connection is established there is no more balancing to be done, and all requests get pinned to a single pod. HTTP/1.1 hid this rather than solving it, because it cannot multiplex, so clients open several connections and let them expire, and that churn is what made connection-level balancing look like request-level balancing. Adding pods does not help either: a horizontal autoscaler divides the metric by the pod count, so the idle pods drag the average below the target and the new one sits there with nothing connected to it.",
  },

  {
    slug: 'sys-xfp-redirect-loop',
    title: 'Every link comes out as http',
    category: 'systems',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'You move an app behind a load balancer that terminates TLS: the client speaks HTTPS to the balancer, and the balancer speaks plain HTTP to your instances.',
      '',
      'Every generated link now comes out as `http://`, and the middleware that redirects HTTP to HTTPS sends the browser round in a loop until it gives up. Your handler reads `req.protocol` and gets `http`.',
      '',
      'Explain why that answer is correct, and name what to read instead.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'terminated',
            'terminates',
            'termination',
            'plain http',
            'unencrypted',
            'its own leg',
            'that leg',
            'ends at the',
          ],
          missingFeedback:
            'Why is the request that reached your instance genuinely not HTTPS? Say where the TLS went.',
        },
        {
          synonyms: [
            'x-forwarded-proto',
            'x forwarded proto',
            'forwarded-proto',
            'forwarded proto',
            'forwarded header',
            'trust proxy',
          ],
          missingFeedback: 'Name the header that carries the scheme your handler cannot see.',
        },
      ],
      hints: [
        'The handler is not wrong about anything. Ask what it can actually see.',
        'HTTPS ended at the balancer, so the request that arrived at your instance really did arrive over plain HTTP.',
        "The client's scheme survives only in a header the balancer added: `X-Forwarded-Proto`.",
      ],
    },
    canonicalAnswer:
      "TLS terminated at the balancer, so the connection from the balancer to my instance really is plain HTTP, and `req.protocol` is describing its own leg accurately. The client's scheme survives only in a header the balancer added, so read `X-Forwarded-Proto`, or set the framework's trust proxy option so `req.protocol` reflects it, instead of asking the socket.",
    solution: md(
      '- **Why `http` is correct**: TLS ended at the balancer. The leg from the balancer to your instance is plain HTTP, and `req.protocol` reports that leg.',
      '- **What to read instead**: `X-Forwarded-Proto`, added by the balancer. Express folds it into `req.protocol` itself once `trust proxy` is set.'
    ),
    explanation:
      "A socket only knows about its own hop, which is why every proxy surprise has the same shape: the address, the scheme and the port your handler sees all describe the balancer rather than the client. `X-Forwarded-Proto` is the balancer reporting the hop it can see and you cannot. Treat it as a claim, not a fact: a client can send that header itself, so it is only worth reading when a proxy you operate overwrites it, which is exactly what a framework's trusted-proxy setting configures. Redirect-to-HTTPS middleware is where this surfaces first, because the handler concludes the request needs upgrading, the browser comes back over HTTPS, and the balancer hands you plain HTTP again.",
  },

  {
    slug: 'sys-cache-aside-vs-write-through',
    title: "Reads fill the cache, writes don't",
    category: 'systems',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      "Your app reads a user's profile from the cache on every request. On a miss, it reads the database and writes the value into the cache. On update, it writes to the database and leaves the cache alone until it expires.",
      '',
      'Name this caching pattern, and name the other common one where the write path keeps the cache in sync.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['cache-aside', 'cache aside', 'lazy loading', 'lazy-loading'],
          missingFeedback: 'Name the pattern being described: the cache is only touched on a miss.',
        },
        {
          synonyms: ['write-through', 'write through'],
          missingFeedback:
            'Name the pattern where a write updates the cache as well as the database.',
        },
      ],
      hints: [
        'The cache is only touched on a miss here; writes go straight to the database.',
        'That is cache-aside, sometimes called lazy loading.',
        'Write-through updates the cache and the database on every write, so there is no stale window.',
      ],
    },
    canonicalAnswer:
      "That's cache-aside (lazy loading): the app checks the cache first, and only on a miss does it read the database and populate the cache, so a write that doesn't touch the cache leaves it stale until expiry or the next miss. The pattern where the write path updates the cache too is write-through: every write goes to the cache and the database together, so a read after a write always finds the current value already there.",
    solution: md(
      '- **Cache-aside (lazy loading)**: app checks the cache, reads the database on a miss, fills the cache. Writes go straight to the database and the cache goes stale until expiry or the next miss.',
      '- **Write-through**: every write updates the cache and the database together, so reads never see a stale value, at the cost of paying the cache write on every write, not just popular keys.'
    ),
    explanation:
      "Cache-aside only warms the cache with data that's actually been read, so it never wastes space on unread keys, but it accepts a staleness window between a write and the next read, or an explicit invalidation, closing it. Write-through removes that window by writing to the cache on every write, whether or not the key is ever read again, trading cache efficiency for freshness. Most apps use cache-aside for read-heavy, rarely-written data and write-through or an explicit invalidate-on-write for anything where staleness would be visibly wrong.",
  },

  {
    slug: 'sys-cache-stampede',
    title: 'Everyone misses at once',
    category: 'systems',
    difficulty: 'hard',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A popular cache key expires at 3:00:00 exactly, and 3:00:00 also happens to be when traffic peaks. For a few seconds the database gets hit with thousands of identical queries at once, and it falls over.',
      '',
      'Name this failure, and one way to prevent it.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['stampede', 'thundering herd', 'dog-pile', 'dogpile', 'dog pile'],
          missingFeedback: 'Name this failure.',
        },
        {
          synonyms: [
            'expire at the same',
            'many requests',
            'simultaneous',
            'at once',
            'same moment',
            'concurrent misses',
            'all miss',
          ],
          missingFeedback: 'What do all the requests hitting the database at once have in common?',
        },
        {
          synonyms: [
            'lock',
            'mutex',
            'single request rebuilds',
            'one rebuild',
            'jitter',
            'stale-while-revalidate',
            'let one through',
          ],
          missingFeedback: 'Describe a fix: how do you let only one request pay the cost?',
        },
      ],
      hints: [
        'Nothing is wrong with any individual request. The problem is that all of them miss together.',
        'This is called a cache stampede, or dog-piling.',
        "Let only one request rebuild the value (a lock, or 'stale-while-revalidate'), and everyone else waits for it or gets the stale copy a little longer.",
      ],
    },
    canonicalAnswer:
      'This is a cache stampede, also called dog-piling: when a hot key expires, every request that arrives in that window misses at the same moment and all of them hit the database at once, instead of just one. A common fix is a lock: the first request to miss acquires it and rebuilds the value while everyone else waits for it or is served the stale value a moment longer, so only one query reaches the database instead of thousands.',
    solution: md(
      '- **Name**: cache stampede (dog-piling / thundering herd).',
      '- **Fix**: a lock around the rebuild, so only the first miss queries the database and the rest wait for or reuse its result; or serve the stale value while one request refreshes it in the background (stale-while-revalidate); or add jitter to TTLs so keys do not expire in a synchronized batch.'
    ),
    explanation:
      "A cache is supposed to absorb load, but a synchronized expiry turns it into a synchronized miss instead, and the database sees the full unfiltered traffic for however long the rebuild takes. The fix is always some version of 'only let one request do the expensive work': a per-key lock, a background refresh that serves the old value until the new one lands (stale-while-revalidate), or spreading TTLs with a small random offset so keys don't expire in lockstep in the first place. The same shape of bug hits a restarting service with a cold cache, which is why warming a cache before traffic is routed to it is a related fix.",
  },

  {
    slug: 'sys-cap-theorem',
    title: "The datacentres can't talk",
    category: 'systems',
    difficulty: 'hard',
    relevance: 'foundational',
    type: 'explain',
    prompt: md(
      'Your two datacentres stop being able to reach each other. Requests are still arriving at both.',
      '',
      'What do you have to give up, and what are the two ways that choice shows up to a user?'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'reject',
            'refuse',
            'error',
            'fail the request',
            'return an error',
            'times out',
          ],
          missingFeedback:
            'What does a datacentre that insists on being correct do with a request it cannot confirm?',
        },
        {
          synonyms: [
            'stale',
            'out of date',
            'inconsistent',
            'diverge',
            'old data',
            'possibly wrong',
          ],
          missingFeedback: 'What does a datacentre that insists on answering anyway risk serving?',
        },
        {
          synonyms: [
            'not both',
            'one or the other',
            'must pick',
            'have to choose',
            'pick between',
            'choose between',
            'trade off',
            'give up one',
          ],
          missingFeedback:
            'What is actually forced here: a menu of three, or a choice between two?',
        },
      ],
      hints: [
        'Partition tolerance is not something you opt out of; a real network will split eventually.',
        'The forced choice during the partition is between consistency and availability, not a pick-two-of-three menu.',
        'One side of the choice looks like an error or a timeout to the user; the other looks like a successful response with stale or conflicting data.',
      ],
    },
    canonicalAnswer:
      "You have to choose between consistency and availability, not both, once the network is partitioned; partition tolerance itself is not optional in a distributed system, so CAP really only gives you a choice between C and A. One way it shows up: the datacentre that can't confirm it has the latest write refuses the request or times out, choosing consistency over availability. The other way: it answers anyway with whatever it has, so the two datacentres return different, possibly stale, data for the same key, choosing availability over consistency.",
    solution: md(
      '- **Consistency**: refuse or delay the request until you can confirm you are not serving stale data. The user sees an error or a timeout.',
      '- **Availability**: answer anyway with what you have. The user gets a response, but the two datacentres can disagree on the current value.',
      '',
      'Partition tolerance is not a third option you opt out of, a real network will partition eventually, so CAP is really a choice between C and A **during a partition**. Outside a partition you can have both.'
    ),
    explanation:
      "CAP is usually misquoted as 'pick two of three', which makes it sound like a menu you choose from once, up front. It isn't: partition tolerance isn't optional for any system with more than one node on a real network, so the theorem only bites, and only forces a choice, during an actual partition. A system that's CP during the partition, refusing uncertain requests, is perfectly available the rest of the time, and a system that's AP, answering with whatever it has, is perfectly consistent the rest of the time too. The theorem also only talks about the strict ends; most real systems, Cassandra with tunable consistency, DynamoDB, let you dial a knob per request rather than commit to one side globally.",
  },

  {
    slug: 'sys-strong-vs-eventual-consistency',
    title: 'The picture that updates late',
    category: 'systems',
    difficulty: 'medium',
    relevance: 'foundational',
    type: 'explain',
    prompt: md(
      'You update your profile picture. Refreshing immediately still shows the old one for a few seconds, then it updates.',
      '',
      'Name the consistency model this system chose, and contrast it with the one where your own write would always be visible immediately.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['eventual consistency', 'eventually consistent'],
          missingFeedback: 'Name the model this system is using.',
        },
        {
          synonyms: [
            'strong consistency',
            'strongly consistent',
            'linearizable',
            'immediately consistent',
          ],
          missingFeedback: 'Name the model where a read is guaranteed to see the latest write.',
        },
      ],
      hints: [
        "Nothing was lost. It just hasn't arrived at the replica you read from yet.",
        'This model only promises the value will converge eventually, not on which read.',
        'Strong consistency is the one where a read is guaranteed to see the most recent write, every time.',
      ],
    },
    canonicalAnswer:
      "This is eventual consistency: the write is accepted and will propagate to every replica, but there's no guarantee any given read sees it right away, only that it eventually will if no new writes happen. Strong consistency is the alternative: every read, from any replica, reflects the most recent write immediately, which usually means the read has to wait for or be routed to a replica that has it.",
    solution: md(
      '- **Eventual consistency**: a write propagates to replicas over time. Reads may see an old value for a while, but converge once propagation catches up.',
      '- **Strong consistency**: every read reflects the latest write immediately, at the cost of the read potentially waiting on that replica or the leader.'
    ),
    explanation:
      "Eventual consistency is a real, useful guarantee, not laziness: it says nothing is lost, only that the moment it becomes visible to any particular reader isn't guaranteed. It buys availability and speed, because a read can be answered by the nearest replica without checking in with anyone else. Strong consistency removes that uncertainty by making every read wait for, or be routed to, a replica guaranteed to be current, usually meaning a round trip to the leader or a quorum, at the cost of latency and, per CAP, availability during a partition. Most products mix the two deliberately: a profile picture can be eventually consistent, but a bank balance usually can't.",
  },

  {
    slug: 'sys-leader-follower-replication',
    title: 'One writer, many readers',
    category: 'systems',
    difficulty: 'easy',
    relevance: 'foundational',
    type: 'explain',
    prompt: md(
      'A database has one server that accepts writes and several others that only accept reads, each continuously applying the same stream of changes the write server produced.',
      '',
      'Name this replication setup, and name which of the read servers can safely take over writes if the write server dies.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['leader', 'primary', 'master', 'leader-follower', 'primary-replica'],
          missingFeedback:
            'Name the role of the server that accepts writes, and this replication setup.',
        },
        {
          synonyms: [
            'promote',
            'promoted',
            'election',
            'failover',
            'most caught up',
            'furthest along',
          ],
          missingFeedback: 'Which follower is safe to promote?',
        },
      ],
      hints: [
        "One server is special: it's the only one allowed to accept writes.",
        'This is leader-follower (also called primary-replica) replication.',
        'Promote the follower that is furthest along in the change stream, not just any follower, or you lose unapplied writes.',
      ],
    },
    canonicalAnswer:
      "This is leader-follower (primary-replica) replication: the leader accepts writes and streams its change log to the followers, which apply it and serve reads. On failure, any follower can be promoted to leader, but safely means the one that is most caught up, promoting a lagging follower loses whatever writes it hadn't applied yet.",
    solution: md(
      '- **Setup**: leader-follower (primary-replica) replication. The leader accepts writes and streams a change log; followers apply it and serve reads.',
      '- **Failover**: promote the most caught-up follower. One that is lagging is missing writes the old leader already accepted.'
    ),
    explanation:
      "Routing all writes through one node is what makes ordering easy: the leader assigns a single sequence to every change, and followers just replay it. The cost shows up exactly at failover, because followers don't all finish applying that stream at the same instant, so 'promote a follower' really means 'promote whichever follower has replayed the most of it', and even that one can be missing the last few writes the old leader accepted moments before it failed. Some setups wait for at least one follower to confirm a write before acknowledging it, synchronous replication, specifically to bound how much a failover can lose, at the cost of write latency.",
  },

  {
    slug: 'sys-replica-lag',
    title: 'Your own comment is missing',
    category: 'systems',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      "A user submits a comment, the page redirects to the thread, and their own comment is missing. Refreshing a second later, it's there. Writes go to the leader; this page reads from a follower.",
      '',
      'Name the problem, and one way to fix this specific symptom, seeing your own write, without giving up replicas for scale.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['replica lag', 'replication lag', 'lag', 'behind the leader', 'not caught up'],
          missingFeedback: 'Name the problem: what is the follower relative to the leader?',
        },
        {
          synonyms: [
            'read your own writes',
            'read-your-writes',
            'read from the leader',
            'route to the leader',
            'read from the primary',
            'sticky read',
          ],
          missingFeedback:
            "Where should this user's reads go for a short window after their own write?",
        },
      ],
      hints: [
        'The write itself succeeded. The read afterward is the one going somewhere that does not have it yet.',
        'This gap is called replica lag.',
        "For a moment after their own write, route that user's reads to the leader instead of any follower.",
      ],
    },
    canonicalAnswer:
      "This is replica lag: the follower serving this read is behind the leader and has not yet applied the write. The fix for this specific symptom is read-your-writes consistency: route reads that follow a user's own write, for a short window, to the leader instead of an arbitrary follower, while everything else keeps reading from replicas.",
    solution: md(
      "- **Problem**: replica lag. The follower serving the read has not applied the leader's latest writes yet.",
      "- **Fix for this symptom**: read-your-writes consistency. Route a user's reads to the leader, or a replica confirmed caught up, for a short window after their own write; everyone else keeps reading from replicas."
    ),
    explanation:
      "Replica lag is the ordinary cost of asynchronous replication, not a bug: followers apply the change stream as fast as they can, and under load, or after a network hiccup, that is measurably behind the leader. Most of the time nobody notices, since most reads aren't racing a write from the same session. The specific failure that annoys users is seeing their own action vanish, so the targeted fix is read-your-writes: track that this session just wrote, and for a short window route its reads somewhere guaranteed current, rather than solving the general problem by sending every read to the leader and giving up the whole point of having replicas.",
  },

  {
    slug: 'sys-sharding-partitioning',
    title: 'Splitting the table in four',
    category: 'systems',
    difficulty: 'medium',
    relevance: 'foundational',
    type: 'explain',
    prompt: md(
      'Your single database hits its ceiling on writes, not just reads, so more read replicas will not help. You split the users table across four databases by user ID range.',
      '',
      'Name this technique, and the one query shape it makes expensive that used to be cheap on a single database.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['shard', 'sharding', 'partition', 'partitioning'],
          missingFeedback: 'Name this technique.',
        },
        {
          synonyms: [
            'cross-shard',
            'across shards',
            'join across',
            'scatter-gather',
            'fan out',
            'query every shard',
            'aggregate across',
          ],
          missingFeedback: 'What kind of query now has to hit every shard instead of one database?',
        },
      ],
      hints: [
        'Read replicas copy the whole dataset; this splits it instead.',
        'This is sharding, splitting the table by a key, here a range of user IDs, across separate databases.',
        'Anything that used to scan or join across all users now has to fan out to every shard and merge the results yourself.',
      ],
    },
    canonicalAnswer:
      "This is sharding, horizontal partitioning: each database holds a slice of the rows, split here by a range of user IDs, so writes for different users go to different machines and the write ceiling moves with them. What gets expensive is any query that used to be a single join or aggregate over the whole table, like 'top 10 users by activity', because now it has to fan out across shards and the partial results merged in the application, instead of the database doing it in one place.",
    solution: md(
      '- **Technique**: sharding (horizontal partitioning) by a key, here a range of user IDs, across separate databases.',
      '- **What gets expensive**: any cross-shard query. A join or aggregate over the whole dataset now has to fan out to every shard and merge results in the application, instead of one query on one database.'
    ),
    explanation:
      "Sharding is the only fix once writes, not just reads, outgrow one machine, because a read replica is a full copy and does nothing for write capacity. The price is that the database stops being able to answer anything that spans the split for you: a query that touches more than one shard becomes several queries plus application-level merge logic, and a join across shards effectively doesn't exist unless you build it yourself. This is exactly why the shard key matters so much: pick one that keeps the queries you actually run, usually 'everything for one user', inside a single shard, rather than picking a key and discovering later which queries just became expensive.",
  },

  {
    slug: 'sys-consistent-hashing',
    title: 'Adding a server wipes the cache',
    category: 'systems',
    difficulty: 'hard',
    relevance: 'foundational',
    type: 'explain',
    prompt: md(
      'You cache data across 4 servers, choosing the server for a key with:',
      '',
      code('text', 'server = hash(key) % 4'),
      '',
      'You add a 5th server to handle more load, and nearly every key now maps to a different server than before, wiping the cache.',
      '',
      'Name the hashing scheme that avoids this, and roughly how it limits what has to move.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['consistent hashing', 'consistent hash', 'hash ring'],
          missingFeedback: 'Name the scheme that avoids this.',
        },
        {
          synonyms: [
            'a fraction',
            'small fraction',
            'few keys move',
            'minimal remapping',
            'not everything',
          ],
          missingFeedback: 'Roughly what share of keys has to move when a server is added?',
        },
      ],
      hints: [
        'The problem is that `% N` changes for almost every key whenever N changes, even though only one server was added.',
        'Consistent hashing places servers and keys on the same ring instead of doing modular arithmetic.',
        "A key only moves if it fell between the new server's position and its neighbor; every other key's owner is unaffected.",
      ],
    },
    canonicalAnswer:
      'Consistent hashing. Servers and keys are both placed on a hash ring, and a key belongs to the next server clockwise from it, so adding or removing a server only remaps the keys between it and its predecessor on the ring, a small fraction of the total, instead of remapping almost everything the way mod N does the moment N changes.',
    solution: md(
      '- **Scheme**: consistent hashing. Both servers and keys are hashed onto positions on a ring; a key is owned by the next server clockwise.',
      "- **What moves**: only the keys between the new server's ring position and the previous owner, roughly 1/N of the total, not everything, because ownership elsewhere on the ring is untouched."
    ),
    explanation:
      "`hash(key) % N` ties every key's server to the exact value of N, so changing N by one reshuffles almost the entire mapping, exactly the cache-wiping stampede this scenario describes. Consistent hashing decouples the two: a key's ring position never changes, so adding a server only steals the keys in the arc it now owns from whichever server used to own that arc, and removing one only affects its immediate neighbor. Real implementations add virtual nodes, many ring positions per physical server, so the redistributed load spreads evenly across the remaining servers instead of dumping it all on one neighbor.",
  },

  {
    slug: 'sys-message-delivery-semantics',
    title: 'The order that got charged twice',
    category: 'systems',
    difficulty: 'hard',
    relevance: 'foundational',
    type: 'explain',
    prompt: md(
      'A message queue\'s docs advertise "exactly-once delivery." Your consumer still processed the same order twice after a network blip.',
      '',
      'What guarantee can a queue over a real network actually make on its own, and what has to be true of your consumer to get the effect the docs promised?'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'at-least-once',
            'at least once',
            'redelivered',
            'redelivery',
            'duplicate delivery',
          ],
          missingFeedback: 'What is the honest guarantee a queue can make on its own?',
        },
        {
          synonyms: ['idempotent', 'idempotency', 'dedupe', 'deduplicate'],
          missingFeedback:
            'What property does the consumer need for a duplicate delivery to be harmless?',
        },
      ],
      hints: [
        "The network can lose the message, or it can lose the acknowledgment. The queue can't tell which happened, so it has to assume the worst and redeliver.",
        'That is at-least-once delivery: duplicates are possible, drops are not.',
        '"Exactly-once" is really at-least-once plus a consumer that recognizes a message it already handled and does nothing the second time.',
      ],
    },
    canonicalAnswer:
      'A queue over a real network can only honestly guarantee at-least-once delivery: if it doesn\'t get an acknowledgment in time, it redelivers, since it can\'t tell whether the message was lost or just the ack was. "Exactly-once" is really at-least-once plus an idempotent consumer: the consumer has to detect and no-op a message it has already processed, usually by tracking a message ID it has seen before, so a duplicate delivery has no extra effect even though the queue delivered it twice.',
    solution: md(
      '- **What the queue can guarantee**: at-least-once delivery. An unacknowledged message gets redelivered, because the queue cannot distinguish a lost message from a lost acknowledgment.',
      '- **What makes it exactly-once in effect**: an idempotent consumer. Track processed message IDs and skip, or safely no-op, a repeat, so redelivery is harmless.'
    ),
    explanation:
      "Exactly-once delivery isn't something a network can provide, because the ack itself can be lost exactly like the message can, so the sender is always choosing between 'maybe redeliver a message that already arrived' (at-least-once) and 'maybe never redeliver one that didn't' (at-most-once). Every serious queue defaults to at-least-once because silently dropping a message is almost always worse than processing it twice. The 'exactly-once' marketing claim means the queue and an idempotent consumer working together produce that effect, typically via a dedupe table keyed on message ID, or a natural idempotency key already in the payload, an order ID, not a queue-generated one, checked before the side effect runs, not after.",
  },

  {
    slug: 'sys-ack-after-work',
    title: 'The queue emptied and nothing happened',
    category: 'systems',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'A queue consumer is written like this:',
      '',
      code(
        'js',
        'try {',
        '  await handle(message);',
        '} catch (error) {',
        '  logger.error(error);',
        '} finally {',
        '  await queue.ack(message);',
        '}'
      ),
      '',
      'A deploy makes `handle` throw on every message. Within minutes the queue is empty, nothing was processed, and the dead-letter queue is empty too.',
      '',
      'Name what the acknowledgement is telling the broker, and where in this code it belongs.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'handled',
            'done',
            'processed',
            'succeeded',
            'completed',
            'finished',
            'safe to delete',
            'delete the message',
            'delete it',
          ],
          missingFeedback: 'What is an acknowledgement claiming about the message?',
        },
        {
          synonyms: [
            'success path',
            'only on success',
            'when it succeeds',
            'after the work succeeds',
            'inside the try',
            'in the try',
            'out of the finally',
            'not in the finally',
            'after handle',
          ],
          missingFeedback: 'Where should the acknowledgement move to?',
        },
      ],
      hints: [
        'Every message got deleted. Look at which paths run the delete.',
        '`finally` runs after the `catch` too, so a thrown error is acknowledged exactly as reliably as a success.',
        'Acknowledge on the success path only. A message left unacknowledged is redelivered, and that is what eventually feeds the dead-letter queue.',
      ],
    },
    canonicalAnswer:
      'The acknowledgement tells the broker this message is handled and can be deleted, and a `finally` block says that about the failures exactly as reliably as the successes, so every message is thrown away whether or not the work happened. It belongs on the success path, inside the `try` after `handle` returns without throwing. Leaving a failed message unacknowledged is what makes redelivery and the dead-letter queue work at all.',
    solution: md(
      '- **What an acknowledgement claims**: this message is handled, delete it. Nothing makes that true except having done the work.',
      '- **Where it belongs**: the success path, after `handle` returns. In `finally` it acknowledges failures as reliably as successes, so a bug that throws on every message empties the queue with nothing done and nothing dead-lettered.'
    ),
    explanation:
      'Redelivery is the only safety net a queue has, and the acknowledgement is the single thing that switches it off, so acknowledging in a `finally` discards the retry, the dead-letter queue and the alarm on its depth all at once. The failure is quiet by construction: the consumer keeps running, the queue depth goes down, and every dashboard reads healthy while the work disappears. The `catch` deserves the same look, because swallowing the error and carrying on is the same decision written differently. Leave the message alone on the failure path and let the redelivery window expire, which is what puts it back in front of a consumer and, after enough attempts, in front of you.',
  },

  {
    slug: 'sys-queued-work-invisible',
    title: 'Eight milliseconds and nobody noticed',
    category: 'systems',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'You move PDF export off the request: the endpoint enqueues a job and returns in 8ms, and the UI says "Export started."',
      '',
      'The consumer has been throwing on every job for two days. The endpoint still returns in 8ms and the UI still says "Export started."',
      '',
      'Say what moving the work off the request actually changed about the failure, and name one thing this needs before it ships.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'moved',
            'move',
            'did not remove',
            "didn't remove",
            'does not remove',
            'still fails',
            'still failing',
            'out of the request',
            'nobody is looking',
            'nobody is watching',
            'invisible',
            'silent',
            'hidden',
          ],
          missingFeedback: 'Did the failure go away, or go somewhere?',
        },
        {
          synonyms: [
            'status',
            'state the user',
            'alarm',
            'alert',
            'monitor',
            'dead-letter',
            'dead letter',
            'dlq',
            'tell the user',
          ],
          missingFeedback: 'Name one thing that would have surfaced this within two days.',
        },
      ],
      hints: [
        'The request got faster. Ask whether anything got more reliable.',
        'The failure is still happening. It moved somewhere nobody is looking.',
        'Give the job a state the user can see, and put an alarm on the dead-letter queue.',
      ],
    },
    canonicalAnswer:
      'Nothing about the failure went away. It moved out of the request, where a user saw it immediately, into a consumer nobody is watching. So the job needs a status the user can actually see, set by the consumer on the failure path as well as the success path, and the dead-letter queue needs an alarm on its depth so work that keeps failing reaches a person instead of circling.',
    solution: md(
      '- **What changed**: only where the failure lives. It left the request, where a user saw it at once, for a consumer nobody watches.',
      '- **What it needs**: a job status the client can see, written on the failure path too, and an alarm on the dead-letter queue so repeated failures reach a person.'
    ),
    explanation:
      'A queue converts a loud failure into a quiet one, and that is the trade whether or not anyone says so out loud: the endpoint that used to fail in front of a user now returns immediately, and the problem surfaces two days later as a support ticket. The UI is the half that gets forgotten, because "Export started" was written on the day everything worked and it goes on saying that forever. Two things make the trade safe. The job carries a state the client can poll, set to failed by the consumer\'s error path, and the dead-letter queue gets an alarm on its depth the day it is created, because nothing watches it by default.',
  },

  {
    slug: 'sys-idempotency',
    title: 'Twenty credits instead of ten',
    category: 'systems',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'A cron job calls this on every run:',
      '',
      code('js', 'incrementUserCredits(userId, 10);'),
      '',
      'A retry after a deploy runs it twice for the same batch, and every user ends up with 20 credits instead of 10.',
      '',
      'Name the property the operation is missing, and describe the general shape of a fix: what should the function check before applying the change?'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['idempotent', 'idempotency', 'idempotence'],
          missingFeedback: 'Name the property this operation is missing.',
        },
        {
          synonyms: [
            'already applied',
            'already processed',
            'record the operation',
            'track which batch',
            'seen before',
            'unique id',
          ],
          missingFeedback: 'What should the function check before applying the change?',
        },
      ],
      hints: [
        'Running it once should be safe. Running it twice for the same input should not change the outcome any further.',
        'The missing property is idempotency.',
        "Record that this batch's credits were already applied, a processed-batch table, and check it before incrementing again.",
      ],
    },
    canonicalAnswer:
      "The operation isn't idempotent: running it twice doubles the effect instead of leaving the same result as running it once. The general fix is to make the function check, before applying the change, whether this specific batch was already applied, by tracking a processed-batch record, and no-op if so, rather than blindly incrementing every time it's called.",
    solution: md(
      '- **Missing property**: idempotency. Applying the operation twice for the same input should not produce a different result than applying it once.',
      '- **Fix shape**: before applying the change, check whether this specific batch has already been recorded as applied, and no-op if so.'
    ),
    explanation:
      "An increment is the textbook non-idempotent operation: unlike a set, which naturally lands on the same value no matter how many times it runs, `+= 10` gives a different answer every time it repeats. Retries, redeliveries and duplicate cron runs are common enough in any real system that anything triggered by them, not just payments, needs the same defense: record that this specific unit of work happened, and check that record before doing it again. The general move is to replace 'do the increment' with 'if this batch hasn't been recorded, record it and do the increment', which turns a re-run into a safe no-op instead of a repeated side effect.",
  },

  {
    slug: 'sys-service-discovery',
    title: 'Thirty instances that keep changing',
    category: 'systems',
    difficulty: 'medium',
    relevance: 'foundational',
    type: 'explain',
    prompt: md(
      'You run 30 instances of an API, and the number changes constantly as autoscaling adds and removes them. A new service needs to call this API, and hardcoding IP addresses is out.',
      '',
      'Name the mechanism that lets a caller find a current, healthy instance without a human updating a config file.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['service discovery', 'service registry', 'registry'],
          missingFeedback: 'Name the mechanism.',
        },
        {
          synonyms: ['register', 'registers itself', 'heartbeat', 'query the registry', 'lookup'],
          missingFeedback: 'How does an instance get added, and how does a caller find one?',
        },
      ],
      hints: [
        'The set of valid addresses is constantly changing, so a static config file cannot be the source of truth.',
        'This is service discovery, backed by a registry.',
        'Instances register on startup and are dropped on a failed heartbeat; callers query the registry, sometimes via DNS, instead of hardcoding an address.',
      ],
    },
    canonicalAnswer:
      'Service discovery. Instances register themselves, or a health check registers them, with a service registry as they start, and deregister or drop out on a heartbeat timeout as they stop, and a caller looks up a current, healthy instance from the registry instead of a fixed address.',
    solution: md(
      '- **Mechanism**: service discovery, backed by a service registry.',
      '- **How it works**: each instance registers itself on startup, directly, or via a health check that adds it once it passes, and is removed on a failed heartbeat or graceful shutdown; callers query the registry, often through DNS or a client library, to get a current, healthy address instead of a fixed one.'
    ),
    explanation:
      "A registry turns 'where is this service' from a deploy-time fact into a runtime query, which is what autoscaling and rolling deploys require: the true set of healthy instances is different from one minute to the next, and any static list is stale the moment it's written. There are two common shapes: client-side discovery, where the caller queries the registry directly and picks an instance (Consul, etcd), and server-side discovery, where the caller just hits a stable address and something else, a load balancer or a service mesh sidecar, does the lookup and routing. Kubernetes' internal DNS is the version most people meet without naming it: a Service's DNS name always resolves to currently healthy pods.",
  },

  {
    slug: 'sys-timeout-before-breaker',
    title: 'The breaker that never trips',
    category: 'systems',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'Your checkout handler calls a pricing service. The pricing service accepts the connection and then sends nothing back, ever. Requests to checkout stop returning at all, and the circuit breaker you wrapped around the call sits closed the whole time.',
      '',
      'Name the piece that is missing, and say why the breaker cannot do its job without it.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'timeout',
            'time out',
            'deadline',
            'time limit',
            'abortsignal',
            'abort signal',
          ],
          missingFeedback: 'Name the piece that is missing from the call itself.',
        },
        {
          synonyms: [
            'counts failures',
            'count failures',
            'never fails',
            "hasn't failed",
            'has not failed',
            'not a failure',
            'no failures to count',
            'still waiting',
            'never returns',
          ],
          missingFeedback:
            'A breaker trips on failures. What is a call that has not come back yet, as far as the counter is concerned?',
        },
      ],
      hints: [
        'A breaker trips on failures. Ask what this dependency is actually producing.',
        'A call that has not come back is not a failure yet, so there is nothing to count.',
        'The missing piece is a per-call timeout. Without a deadline the request hangs and the failure counter never moves.',
      ],
    },
    canonicalAnswer:
      "There is no timeout on the call. A breaker counts failures, and a request that hasn't returned hasn't failed, so the counter never reaches its threshold while the pending calls stack up and exhaust the pool. Put a per-call deadline on the dependency first: the timeout is what turns a hang into a failure the breaker can count.",
    solution: md(
      '- **Missing**: a per-call timeout on the outbound request.',
      '- **Why the breaker cannot help**: it counts failures, and a call that has not returned has not failed. With no deadline the counter never reaches its threshold, so the breaker stays closed while the waiting calls exhaust the pool.'
    ),
    explanation:
      'The order is the part people get backwards: the deadline comes first, and the breaker measures what the deadline produces. Until there is one, a hung dependency is not producing failures at all, it is producing waits, and each wait holds a connection and everything the pending call is keeping alive. Set the deadline from what the call normally costs rather than from what feels generous, because a 30-second timeout on a call that usually takes 40ms still lets a sick dependency hold your capacity for 30 seconds at a time. Once the deadline exists, the breaker has something to count, and it belongs outside the retry loop rather than inside it, or three attempts triple the load on something already struggling.',
  },

  {
    slug: 'sys-circuit-breaker',
    title: 'Slow requests pile up',
    category: 'systems',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      "One downstream service starts timing out. Every request to it now waits the full 30-second timeout before failing, and those slow requests pile up and take the whole calling service down with it, even though the caller's own code has no bug.",
      '',
      'Name the pattern that stops calls to a failing dependency instead of queuing up behind it, and the state that lets it start trying again.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['circuit breaker', 'circuit-breaker', 'trips open'],
          missingFeedback: 'Name the pattern.',
        },
        {
          synonyms: ['half-open', 'half open', 'trial request', 'test request', 'probe'],
          missingFeedback: 'Name the state that lets it start trying the dependency again.',
        },
      ],
      hints: [
        "The fix isn't a faster timeout; it's not calling the failing dependency at all for a while.",
        'This is a circuit breaker, borrowed from electrical wiring.',
        'After tripping, it periodically lets a trial request through, half-open, to check if the dependency has recovered, before fully closing again.',
      ],
    },
    canonicalAnswer:
      'A circuit breaker: after enough failures or timeouts it trips open and fails fast, returning an error immediately instead of waiting out the timeout on every call, which stops the pile-up. After a cooldown it moves to a half-open state, letting through a small number of trial requests, and closes again if they succeed, or trips back open if they do not.',
    solution: md(
      '- **Pattern**: circuit breaker. After enough failures, it trips open and fails calls immediately instead of waiting out the timeout on each one.',
      '- **Recovery state**: half-open. After a cooldown it lets a small number of trial requests through; success closes the breaker, failure trips it open again.'
    ),
    explanation:
      "The bug here isn't that the dependency is slow, it's that the caller keeps paying its full timeout on every attempt and those waits stack up, thread pool exhaustion, connection pool exhaustion, until the caller is down too, a failure that had nothing to do with the caller's own code. Tripping the breaker converts that into an immediate, cheap failure the caller can handle, a fallback, a cached value, a clear error, which protects both sides: the caller stops blocking, and the struggling dependency stops receiving traffic it can't serve anyway. Half-open is what keeps the breaker from staying tripped forever once the dependency actually recovers, without going straight back to full traffic and immediately re-tripping.",
  },

  {
    slug: 'sys-rate-limiting-algorithms',
    title: 'Two hundred requests in two seconds',
    category: 'systems',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'You cap an API at 100 requests per minute using a counter that resets at the top of every minute. A client sends 100 requests at 12:00:59 and another 100 at 12:01:00, and your "per minute" limit just let through 200 requests in two seconds.',
      '',
      'Name the algorithm you are using, and the one whose window does not have this edge.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['fixed window', 'fixed-window'],
          missingFeedback: 'Name the algorithm being used.',
        },
        {
          synonyms: ['sliding window', 'token bucket', 'leaky bucket'],
          missingFeedback: 'Name an algorithm whose window does not have this edge.',
        },
      ],
      hints: [
        'The bug is specifically at the boundary between two windows.',
        'You are using a fixed window counter, resetting fully at each interval.',
        'A sliding window, or a token bucket, which refills continuously instead of all at once, does not have an edge to burst across.',
      ],
    },
    canonicalAnswer:
      'This is a fixed window counter: it resets fully at each minute boundary, so a burst right at the edge counts against two separate windows and briefly doubles the effective rate. A sliding window, or a token bucket, avoids the edge by not resetting all at once, it looks at a rolling interval ending at the current request, or refills capacity continuously instead of in a lump, so a burst spanning a boundary is still measured against the true rate over that span.',
    solution: md(
      '- **Algorithm in use**: fixed window counter. It resets to zero at each interval boundary, so requests clustered around the boundary can double up.',
      '- **Fix**: a sliding window (counts requests in the trailing N seconds from now, no reset point) or a token bucket (capacity refills continuously, not in a lump), neither of which has an edge to exploit.'
    ),
    explanation:
      "A fixed window's flaw is entirely in where the count resets: it is not tracking 'the last 60 seconds', it is tracking 'since the clock last ticked over a minute', and those are only the same thing at the instant the window opens. A sliding window log or sliding window counter fixes it by measuring the trailing interval from the current request instead of from a fixed clock boundary. A token bucket takes a different angle on the same problem: capacity refills continuously, or in small steps, rather than resetting in one lump, and it additionally allows a bounded burst by design, which a sliding window strictly doesn't, so the right choice depends on whether occasional bursts are supposed to be allowed at all.",
  },

  {
    slug: 'sys-thundering-herd',
    title: 'Ten thousand clients, same second',
    category: 'systems',
    difficulty: 'easy',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A service goes down for 30 seconds. The instant it comes back, every one of its 10,000 clients, which had all been retrying every 5 seconds while it was down, hits it in the same second, and it falls right back over.',
      '',
      'Name this failure, and the two things, beyond backoff itself, that fix it.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['thundering herd', 'retry storm', 'retry stampede'],
          missingFeedback: 'Name this failure.',
        },
        {
          synonyms: ['jitter', 'randomize', 'randomized delay', 'random delay'],
          missingFeedback: 'What makes clients desynchronize instead of retrying in lockstep?',
        },
        {
          synonyms: ['exponential', 'backoff', 'back off', 'growing delay', 'increasing delay'],
          missingFeedback: 'What should happen to the delay between attempts as failures continue?',
        },
      ],
      hints: [
        'Every client is doing something reasonable on its own. The problem is that 10,000 of them are doing it at the exact same moment.',
        'This is a thundering herd, or a retry storm.',
        'Add randomness to the delay, jitter, so clients desynchronize, and grow the delay between attempts, exponential backoff, instead of retrying at a constant fixed interval.',
      ],
    },
    canonicalAnswer:
      "This is a thundering herd, a retry storm: every client synchronized its retries on the same fixed interval, so they all land on the service in the same instant it recovers. On top of backing off, the fix is jitter, randomizing each client's delay so they do not retry in lockstep, and exponential backoff, growing the delay between attempts so the retry traffic thins out over time instead of hammering at a constant rate the whole time the service is down.",
    solution: md(
      '- **Failure**: thundering herd (retry storm). Synchronized retry intervals mean every client hits the service in the same instant it recovers.',
      "- **Fixes beyond backoff**: jitter (randomize each client's delay so they desynchronize) and exponential backoff (grow the delay between attempts, so retry pressure fades instead of holding steady at a fixed rate)."
    ),
    explanation:
      "A fixed retry interval is the whole bug: every client that started retrying at roughly the same time, because they all noticed the outage at roughly the same time, stays in lockstep forever, so 'the service recovered' and 'the service gets hit by all 10,000 clients at once' become the same event. Jitter breaks the synchronization by adding randomness to each delay, and exponential backoff means clients that have been failing longest are also waiting longest, so the herd spreads out over time instead of arriving as one spike. The same shape of bug hits caches, a stampede, and connection pools, everyone reconnecting on the same interval; the fix is the same idea wherever a fixed interval lets independent actors accidentally synchronize.",
  },

  {
    slug: 'sys-back-of-envelope',
    title: 'Nobody expects the exact number',
    category: 'systems',
    difficulty: 'medium',
    relevance: 'foundational',
    type: 'explain',
    prompt: md(
      'In a design interview you are asked to estimate storage for a service logging one event per active user per minute, for 5 million daily active users, retained for 30 days, at roughly 200 bytes per event. Nobody expects an exact number.',
      '',
      'What are they actually checking, and roughly how do you get from those inputs to a ballpark?'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['order of magnitude', 'ballpark', 'reasoning', 'sanity-check', 'sanity check'],
          missingFeedback: 'What is actually being evaluated: the exact digit, or something else?',
        },
        {
          synonyms: ['multiply', 'chain', 'break it down', 'step by step', 'per user per day'],
          missingFeedback: 'Describe the method: how do the inputs combine into an estimate?',
        },
      ],
      hints: [
        "Nobody has memorized this number. What's being watched is how you get to one.",
        'Break the question into a chain of smaller estimates you can actually multiply.',
        'Events per user per day, times users, times bytes per event, times retention days, then round hard and sanity-check the order of magnitude.',
      ],
    },
    canonicalAnswer:
      "They're checking the reasoning: whether you can break a vague question into a chain of estimates, multiply them together, and sanity-check the order of magnitude, not whether you know the exact digit. Here: roughly 1,440 events per user per day, times 5 million users, times 200 bytes, times 30 days, comes out around 43 terabytes, and getting to that ballpark by showing each step matters far more than the last digit.",
    solution: md(
      '- **What is being checked**: the reasoning path, breaking a vague question into a chain of multiplied estimates, not memorized trivia.',
      '- **The chain**: (events per user per day) x (users) x (bytes per event) x (retention days), rounding aggressively at each step and sanity-checking the final order of magnitude.',
      '- **This example**: 1,440 x 5,000,000 x 200 x 30, about 43 terabytes.'
    ),
    explanation:
      "Back-of-envelope estimation is a communication exercise disguised as a math one: the interviewer already knows there's no single right answer, so what's being scored is whether you can decompose an ambiguous quantity into pieces you can actually multiply, state your assumptions out loud, and round in a way that keeps the arithmetic tractable without losing the order of magnitude. Getting the final digit wrong by 20% is fine; forgetting a factor entirely, retention days, or that a day has 1,440 minutes, not 1,000, is what actually loses points, because it means the reasoning itself was wrong, not just imprecise.",
  },

  {
    slug: 'sys-half-open-window',
    title: 'The row that belongs to two days',
    category: 'systems',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      "A nightly job totals the previous day's orders with:",
      '',
      code('sql', 'WHERE created_at BETWEEN :day_start AND :day_end'),
      '',
      '`:day_end` is midnight at the end of the day, and the next run uses that same midnight as its `:day_start`. The daily totals add up to more than the source table, and the rows responsible are the ones stamped exactly at midnight.',
      '',
      'Name what `BETWEEN` is doing at its upper bound, and name the operator that belongs there instead.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'inclusive',
            'includes both',
            'includes the upper',
            'includes the end',
            'both ends',
            'both endpoints',
          ],
          missingFeedback: 'What does `BETWEEN` do with the two values you give it?',
        },
        {
          synonyms: ['half-open', 'half open', 'exclusive', 'strictly less', 'less than', '<'],
          missingFeedback: 'Name the operator that belongs on the upper bound instead.',
        },
      ],
      hints: [
        'Two consecutive runs both matched the same row. Look at the boundary they share.',
        '`BETWEEN a AND b` means `>= a AND <= b`, so the endpoint belongs to this window and the next one.',
        'Make the upper bound exclusive: `>= :day_start AND < :next_day_start`.',
      ],
    },
    canonicalAnswer:
      '`BETWEEN` is inclusive at both ends, so a row stamped exactly at `:day_end` matches this window and the next one as well, and gets counted in both days. The upper bound wants `<` rather than `<=`: `created_at >= :day_start AND created_at < :next_day_start`, a half-open range where consecutive windows meet without overlapping and every row lands in exactly one.',
    solution: md(
      '- **What `BETWEEN` does**: includes both endpoints. `BETWEEN a AND b` is `>= a AND <= b`, so a row at exactly `:day_end` matches this window and the next one.',
      '- **What belongs there**: `<`. A half-open range, `>= :day_start AND < :next_day_start`, makes consecutive windows meet without overlapping.'
    ),
    explanation:
      "Half-open intervals are the answer anywhere a range is one of a sequence, which is every scheduled job that has a window. The tempting repair is to nudge the upper bound down by a second, and it trades double-counted rows for missing ones: anything landing inside that second now belongs to no window at all, and nothing will look at it again. The same inclusivity bites an ordinary date filter written as `BETWEEN '2024-01-01' AND '2024-01-31'`, which silently drops everything that happened during the 31st after midnight. The other property a windowed job needs is that rerunning it changes nothing, which means an upsert rather than an append, because the day it dies halfway through is not the day to find out.",
  },

  {
    slug: 'sys-id-scheme-tradeoff',
    title: 'Which endpoint scales better',
    category: 'systems',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A design review is split between two shapes for the same resource:',
      '',
      code(
        'text',
        'A   GET /users/123456789                              sequential integer, assigned by the database',
        'B   GET /users/0f9c2b4d-7a81-4e23-b5f2-9d7a6c3e8f11   random UUID (v4)'
      ),
      '',
      'The slide asks which one scales better. Say what the question leaves out, and where the two choices actually differ.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'does not say',
            "doesn't say",
            'not specified',
            'unspecified',
            'no numbers',
            'cannot answer',
            'cannot be answered',
            'underspecified',
            'depends what',
            'depends on what',
            'scales at what',
            'scale at what',
            'what load',
            'which load',
            'how many',
            'nothing about the system',
            'no information about',
          ],
          missingFeedback:
            '"Scales better" is not one question. Say what the slide would have to tell you before it had an answer.',
        },
        {
          synonyms: [
            'the url',
            'the route',
            'same endpoint',
            'endpoint is the same',
            'endpoints are the same',
            'not the endpoint',
            'nothing to do with the endpoint',
            'costs the same to serve',
            'same cost to serve',
            'primary key lookup',
            'by its primary key',
            'by primary key',
            'one row by its key',
          ],
          missingFeedback:
            'Both routes do the same work when a request arrives. Say what that means for the question as asked.',
        },
        {
          synonyms: [
            'insert',
            'b-tree',
            'btree',
            'page split',
            'scatter',
            'all over the index',
            'locality',
            'append',
            'the end of the index',
            'wider',
            'bigger index',
            'larger index',
            '16 bytes',
            'sixteen bytes',
            'write path',
          ],
          missingFeedback:
            'One of these keys arrives in order and the other does not. Say what that changes, and where.',
        },
      ],
      hints: [
        'Ask what a request for one user actually costs on each. Then ask what a thousand new users a minute costs.',
        'One key always lands next to the last one written. The other lands anywhere.',
        'The other half is the question itself: scales against what, at what volume, written by how many machines?',
      ],
    },
    canonicalAnswer:
      'The question cannot be answered as asked: it does not say whether it means reads or writes, at what volume, or how many machines are minting ids. Serving the request is identical either way, since both are a lookup of one row by its primary key, so the endpoint is not where the difference is. The difference is at the write. A sequential key appends to the end of the index, and a random UUID lands anywhere in it, so inserts scatter across pages that are no longer in cache and cause page splits. It is also wider, 16 bytes against 4 or 8, and every secondary index carries a copy of it.',
    solution: md(
      '- **What the slide leaves out**: what "scales" means here. Read volume, write volume, and how many machines are generating ids all point at different answers, and there are no numbers.',
      '- **What is the same**: serving either request. Both are one row looked up by its primary key, so the URL is not where any cost lives.',
      '- **Where they differ**: the write. Sequential ids append to the end of the index; random ones scatter across it, so inserts touch cold pages and split them. The random key is also wider, and every secondary index stores a copy.'
    ),
    explanation:
      'The framing is the trap: identifiers are a write-path and a coordination decision, and the URL they end up in is the one place they make no difference. What sequential ids cost is a coordinator, which is why they are awkward the moment ids come from more than one writer, and what random ones cost is insert locality in a B-tree. Both costs have a well-known escape: UUIDv7 and ULID put a timestamp in the high bits, so ids stay globally unique and still arrive roughly in order, which is why "integer or UUID" is a false pair. Postgres and MySQL both feel the scatter, MySQL harder, because InnoDB clusters the whole row on the primary key. There is a real argument for a client-minted id that has nothing to do with any of this: the client knows the id before the round trip, so a retry is idempotent and a graph of related rows can be written in one batch.',
  },

  {
    slug: 'sys-dual-write-two-orderings',
    title: 'The order that fulfilment never heard about',
    category: 'systems',
    difficulty: 'hard',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A handler writes the order, then publishes a message so the fulfilment service picks it up:',
      '',
      code(
        'js',
        'await db.insert(orders).values(input);',
        "await broker.publish('order.paid', input);"
      ),
      '',
      'Once or twice a week an order sits in the database that fulfilment never saw. A colleague suggests publishing first and writing the row second.',
      '',
      'Explain what swapping them changes, and what actually closes the gap.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'swap',
            'reverse',
            'other way',
            'both',
            'either',
            'moves',
            'trade',
            'opposite',
            'still fail',
            'does not exist',
            "doesn't exist",
            'never written',
            'no order',
          ],
          missingFeedback:
            'What goes wrong if the publish happens first and the process then dies?',
        },
        {
          synonyms: [
            'atomic',
            'atomically',
            'two systems',
            'no transaction',
            'not in the transaction',
            'separate systems',
            'one transaction',
            'cannot roll back',
            "can't roll back",
            'no shared',
            'span',
          ],
          missingFeedback: 'Say why no ordering of the two statements can be correct.',
        },
        {
          synonyms: [
            'outbox',
            'same transaction',
            'inbox',
            'relay',
            'change data capture',
            'cdc',
            'log tailing',
            'message in the database',
            'message to the database',
            'events table',
          ],
          missingFeedback:
            'What do you write instead, given the database transaction is the only atomic thing you have?',
        },
      ],
      hints: [
        'Work out the failure for the suggested order too, not just the current one.',
        'The database and the broker do not share a transaction, so there is always a window where one has happened and the other has not.',
        'Write the message into the database, in the same transaction as the order, and let a separate process publish it from there.',
      ],
    },
    canonicalAnswer:
      'Swapping them does not remove the gap, it changes which way you fail: publish first and a crash before the insert leaves fulfilment working on an order that does not exist, which is worse than one it never heard about. Neither ordering can be right, because no transaction spans the database and the broker, so there is always a window where one write has landed and the other has not. Close it by making the message part of the database write: insert it into an outbox table in the same transaction as the order, and have a separate relay publish from that table and mark the row sent. The relay can still publish twice, so the consumer stays idempotent.',
    solution: md(
      '- **Swapping**: trades a lost message for a phantom one. A crash between the publish and the insert has fulfilment acting on an order nobody has a record of.',
      '- **Why neither works**: the database and the broker do not share a transaction, so one of the two writes is always outside it.',
      '- **The fix**: write the message to an `outbox` table inside the same transaction as the order. A separate relay reads unpublished rows, publishes each with the outbox id as the message id, then marks it sent.',
      '- **What it does not fix**: the relay can publish and die before marking, so the consumer still has to be idempotent.'
    ),
    explanation:
      'This is the dual write, and the useful part is that it has no in-process solution: every arrangement of two statements has a window between them, and the process disappearing inside that window is the failure. Retrying does not help either, because the thing that would retry is the thing that died. So the fix has to change what is being written rather than when, which is what the outbox does: the message becomes a row, the row commits with the order, and the only atomicity anyone needs is the atomicity the database already had. What it buys is exact and worth stating, since the message is sent if and only if the transaction commits, and no more than that: the relay can publish and crash before recording it, so this converts a silent loss into a visible duplicate. That is the trade rather than a leftover flaw, because a duplicate arriving at an idempotent consumer is a solved problem and a record that quietly went missing is not.',
  },

  {
    slug: 'sys-log-vs-queue-replay',
    title: 'The report nobody asked for last year',
    category: 'systems',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'Orders have been published to a work queue for two years, and every consumer acknowledges and deletes as it goes.',
      '',
      'Analytics now wants to compute a metric over the last two years of orders, and a new fraud service wants to see the same order events the fulfilment service sees.',
      '',
      'Explain why the queue cannot serve either request, and what structure does.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'deleted',
            'consumed',
            'gone',
            'removed',
            'acknowledg',
            'acked',
            'not retained',
            'no history',
            'once',
          ],
          missingFeedback: 'What happened to each message after it was handled?',
        },
        {
          synonyms: [
            'log',
            'retention',
            'retained',
            'offset',
            'cursor',
            'position',
            'append-only',
            'kept',
            'kafka',
          ],
          missingFeedback: 'Name the structure that keeps a message after it has been read.',
        },
        {
          synonyms: [
            'own cursor',
            'own offset',
            'own position',
            'independent',
            'consumer group',
            'separately',
            'each consumer',
            'both read',
            'replay',
            'rewind',
            'read again',
          ],
          missingFeedback:
            'Say how that structure serves two consumers, and how it serves the historical question.',
        },
      ],
      hints: [
        'Ask what is physically still there from 2024.',
        'A queue deletes on acknowledgement, so being read is what destroys the message.',
        'A log retains by time or size instead, and each consumer holds its own offset into it.',
      ],
    },
    canonicalAnswer:
      'A queue deletes a message once it has been acknowledged, so being read is what destroys it and there is no history left to compute over: everything before today is gone, and a second consumer would take work away from the first rather than seeing the same messages. A log is the structure that answers both. It is append-only and retained by time or size rather than by being consumed, and each consumer keeps its own offset, so fraud reads the same events fulfilment reads without competing for them, and analytics rewinds its offset to the beginning and replays two years.',
    solution: md(
      '- **Why the queue cannot**: acknowledgement deletes. Reading is destructive, so no history exists and two consumers share the work rather than both seeing it.',
      '- **What does**: an append-only log, retained by time or size, where a consumer holds its own offset.',
      '- **Two consumers**: two consumer groups, two cursors over the same partitions, neither taking messages from the other.',
      '- **Two years**: reset the analytics cursor to the earliest offset and replay, if retention actually kept that long.'
    ),
    explanation:
      'The difference is entirely what a read does to the message: a queue is a work list, so consuming it is the point and deleting it is how "done" is recorded, while a log is history, so reading is just moving your own cursor and nothing is removed. Both requests here are really the same request, which is to read a message that somebody else has already read, and only one of the two structures allows it. What this does not give you for free is the two years, because retention is a deadline somebody configured rather than a promise of possession, and a log with a seven-day policy answers the fraud question and not the analytics one. Nor is replay free of side effects: rewinding a cursor re-runs the consumer, so anything that emails or charges on the way past does it again unless it was written to be idempotent.',
  },

  {
    slug: 'sys-stuck-consumer-holds-the-log',
    title: 'The disk filled and nobody was writing much',
    category: 'systems',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A service reads an event log. One of its four consumer groups has been crash-looping for a week and nobody noticed, because the other three are healthy and the dashboards show average lag.',
      '',
      'The alert that finally fired was disk space on the brokers.',
      '',
      'Explain the connection, and what should have been alerted on instead.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'until',
            'retain',
            'retention',
            'cannot delete',
            'not delete',
            'held',
            'holds',
            'pinned',
            'keeps',
            'behind',
          ],
          missingFeedback: 'What decides when the broker may discard a record?',
        },
        {
          synonyms: [
            'oldest',
            'slowest',
            'furthest behind',
            'worst',
            'minimum',
            'lagging',
            'stuck',
            'one consumer',
            'that group',
          ],
          missingFeedback: 'Which consumer decides it, out of the four?',
        },
        {
          synonyms: [
            'average',
            'hides',
            'masks',
            'max',
            'maximum',
            'per group',
            'per consumer',
            'each group',
            'worst-case',
            'oldest offset',
          ],
          missingFeedback: 'Say what is wrong with the dashboard and what the alert should watch.',
        },
      ],
      hints: [
        'The broker cannot throw away a record while somebody still needs it.',
        'The one consumer that has not moved is holding everything from its position forward.',
        'An average over four groups hides one stuck group. Alert on the maximum lag, per group.',
      ],
    },
    canonicalAnswer:
      'The broker retains a record until every consumer has moved past it, so the crash-looping group has pinned the log from its position a week ago all the way forward, and that retained backlog is the disk. The oldest cursor decides the storage cost, not the typical one. Averaging lag across the four groups is exactly the metric that hides this, because three healthy groups pull the average down while one group sits still. Alert on the maximum lag per consumer group, and on the age of the oldest committed offset, so a single stuck consumer is visible before it is a disk incident.',
    solution: md(
      '- **The connection**: a log is retained until every consumer has passed it, so the stuck group holds a week of records that would otherwise have aged out.',
      '- **What decides the cost**: the oldest cursor, never the average one.',
      '- **The alert**: maximum consumer-group lag and the age of the oldest committed offset, per group, not an average across groups.'
    ),
    explanation:
      'Averages hide exactly the failure that matters here, because the cost is set by the worst member of the set rather than the typical one, and this is the general shape of it rather than a fact about brokers: any metric where one participant pins a shared resource wants a maximum. The Postgres version of the same mechanism is a replication slot, which the documentation describes as ensuring the primary "does not remove WAL segments until they have been received by all standbys", and a slot created for a standby that never connects will fill a disk on its own. Measured on PostgreSQL 17.10, one unread slot held 159 MB of WAL generated by a single table build. The second lesson is that the failure lands somewhere other than where it started: the consumer that broke is fine, and the thing that pages is storage on a component nobody changed.',
  },

  codeProblem({
    slug: 'sys-event-fold',
    title: 'The balance is a fold',
    category: 'systems',
    difficulty: 'medium',
    relevance: 'occasional',
    prompt: md(
      'In an event-sourced account there is no balance column. Write `balanceOf(events, key)`, which folds an account’s events into its balance in cents.',
      '',
      'Events arrive newest-last and cover every account, so filter to `key` first. Handle `deposited` and `withdrawn`.',
      '',
      'An event type this code has never heard of must be ignored rather than throw, because the log outlives the code that reads it. An account with no events has a balance of 0.'
    ),
    starter: 'function balanceOf(events, key) {\n  \n}',
    setup: [
      'const LOG = [',
      "  { offset: 1, key: 'a', type: 'deposited', data: { cents: 500 } },",
      "  { offset: 2, key: 'b', type: 'deposited', data: { cents: 100 } },",
      "  { offset: 3, key: 'a', type: 'withdrawn', data: { cents: 200 } },",
      "  { offset: 4, key: 'a', type: 'frozen', data: {} },",
      "  { offset: 5, key: 'a', type: 'deposited', data: { cents: 50 } },",
      '];',
    ].join('\n'),
    tests: [
      { name: 'folds deposits and withdrawals', expression: "balanceOf(LOG, 'a')", expected: 350 },
      { name: 'ignores other accounts', expression: "balanceOf(LOG, 'b')", expected: 100 },
      {
        name: 'an account with no events has a balance of 0',
        expression: "balanceOf(LOG, 'nobody')",
        expected: 0,
      },
      {
        name: 'an unknown event type is skipped, not fatal',
        expression: "balanceOf([{ offset: 1, key: 'a', type: 'invented-later', data: {} }], 'a')",
        expected: 0,
      },
      {
        name: 'does not mutate the log',
        expression: "(() => { balanceOf(LOG, 'a'); return LOG.length; })()",
        expected: 5,
      },
    ],
    reference: [
      'function balanceOf(events, key) {',
      '  return events',
      '    .filter((e) => e.key === key)',
      '    .reduce((cents, e) => {',
      "      if (e.type === 'deposited') return cents + e.data.cents;",
      "      if (e.type === 'withdrawn') return cents - e.data.cents;",
      '      return cents; // unknown to this version of the code, and that is allowed',
      '    }, 0);',
      '}',
    ].join('\n'),
    hints: [
      'Filter to the account, then reduce. The seed value is the balance of an account with no events.',
      'Deposits add, withdrawals subtract, and anything else returns the accumulator untouched.',
      'The default branch is the point: returning the accumulator unchanged is what makes an old log readable by new code.',
    ],
    explanation:
      'The default branch is the part worth keeping. A fold that throws on an unrecognised type turns every future event anybody adds into a production incident for every service that reads the log, and since the log is append-only those events cannot be taken back out. Ignoring what you do not understand is what lets one log serve readers on different deploys, which is the same rule as ignoring unknown fields in a JSON payload. Two things follow from the shape. The balance is derived rather than stored, so there is no row to get out of step with the events and an audit trail is not a second thing to maintain. And this gets slower as the stream grows, which is what snapshots fix: cache the fold at an offset and replay only what came after, a change worth making per aggregate with a long stream rather than across the whole log.',
  }),

  {
    slug: 'sys-event-schema-change',
    title: 'The event shape that changed two years ago',
    category: 'systems',
    difficulty: 'hard',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'An event-sourced system stored `money.deposited` with a single `amount` in cents. Last year it gained multi-currency, and new events carry `{ cents, currency }`.',
      '',
      'Somebody proposes an `UPDATE` over the old events to add `"currency": "EUR"` so the reader only handles one shape.',
      '',
      'Explain what is wrong with that, and what to do instead.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'immutable',
            'append-only',
            'never',
            'rewrit',
            'rewriting',
            'history',
            'audit',
            'not true',
            'falsif',
            'destroy',
            'lose',
          ],
          missingFeedback: 'What does editing past events cost you, given why the log exists?',
        },
        {
          synonyms: [
            'assum',
            'guess',
            'nobody recorded',
            'never recorded',
            'not recorded',
            'nothing proves',
            'no evidence',
            'unknown',
            'may not be',
            'might not be',
            'not all',
            'invent',
          ],
          missingFeedback: 'Is EUR actually a fact about those old events?',
        },
        {
          synonyms: [
            'upcast',
            'upgrade',
            'on read',
            'at read',
            'version',
            'translate',
            'convert',
            'reader',
            'both shapes',
            'handle both',
          ],
          missingFeedback: 'What handles the two shapes instead?',
        },
      ],
      hints: [
        'The log is the record of what happened. Ask what an UPDATE to it makes it a record of.',
        'It also asserts something nobody stored: that every old deposit really was in euros.',
        'Leave the events alone and convert old shapes to the current one as they are read.',
      ],
    },
    canonicalAnswer:
      'Rewriting past events destroys the property the whole design is for: the log stops being a record of what happened and becomes a record of what the current code expects, and an audit trail you edit is not an audit trail. It also asserts a fact nobody recorded, since those events were written before currency existed and nothing proves they were all euros. Leave them alone. Version the event shape, and upgrade old shapes to the current one on read, so the fold only ever sees the newest shape and the reader carries the translation instead of the log carrying a lie.',
    solution: md(
      '- **What is wrong**: it rewrites history, which is the one thing an append-only log exists to prevent, and it invents a fact (`EUR`) that was never recorded.',
      '- **What to do**: keep a `version` on each event and upcast v1 to v2 at the edge of the reader.',
      '',
      code(
        'js',
        'const upcast = (e) =>',
        '  e.version === 1',
        "    ? { ...e, version: 2, data: { cents: e.data.amount, currency: 'EUR' } } // stated, and reviewable",
        '    : e;',
        '',
        'const balance = events.map(upcast).reduce(apply, 0);'
      )
    ),
    explanation:
      'The rule is that events are facts and facts do not get edited, so a schema change is a reader problem rather than a data problem. Upcasting keeps the whole history readable while `apply` only ever sees the current shape, which matters because the alternative accumulates a branch per historical mistake in the middle of your domain logic. Note where the assumption ends up in the fixed version, which is the real argument for it: the upcast is a line of code somebody can read, review and change when it turns out three of those deposits were in sterling, where the `UPDATE` would have made the same guess permanently and invisibly. Two practical consequences. The version belongs in a column rather than being sniffed from the payload, because guessing the shape from its contents fails the moment two versions overlap. And an upcast is never deleted, since v1 events are in the log for as long as the log is, which is a real long-term cost worth knowing about before choosing this design.',
  },

  {
    slug: 'sys-ack-durability-ladder',
    title: 'Success against which failure?',
    category: 'systems',
    difficulty: 'hard',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A team ships a Kafka producer with `acks=all` on a topic with two replicas, and calls the write durable.',
      '',
      'A broker goes down for maintenance, writes keep succeeding, and when the second broker later fails they find messages missing that had been acknowledged.',
      '',
      'Explain what `acks=all` actually waited for, and the setting that makes it mean what they thought.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'in-sync',
            'in sync',
            'isr',
            'currently',
            'caught up',
            'keeping up',
            'available replicas',
            'remaining',
            'shrink',
            'shrank',
            'one replica',
          ],
          missingFeedback: 'Which set of replicas does acks=all actually wait for?',
        },
        {
          synonyms: [
            'one',
            'single',
            'just the leader',
            'only the leader',
            'down to',
            'still succeed',
            'succeeded',
            'no redundancy',
            'alone',
          ],
          missingFeedback: 'How big was that set once a broker went down?',
        },
        {
          synonyms: [
            'min.insync',
            'min insync',
            'minimum in-sync',
            'insync',
            'minimum isr',
            'min isr',
          ],
          missingFeedback: 'Name the setting that refuses the write instead of accepting it.',
        },
      ],
      hints: [
        'acks=all is about the replicas that are currently keeping up, not the replicas that exist.',
        'With one broker down, that set has one member, and a write to one member is acknowledged happily.',
        'The setting that refuses a write when the set is too small is `min.insync.replicas`.',
      ],
    },
    canonicalAnswer:
      'acks=all waits for the current in-sync replica set rather than for every replica that exists, and that set shrinks as brokers fall behind or go down. With one of the two brokers in maintenance the ISR had one member, so a write acknowledged by the leader alone satisfied acks=all and was reported as durable while having no second copy anywhere. Set min.insync.replicas to 2, which makes the partition refuse writes when the in-sync set is smaller than that, so the producer gets an error instead of a false promise. That is a deliberate trade of availability for durability.',
    solution: md(
      '- **What it waited for**: the current in-sync replica set, which had shrunk to one.',
      '- **Why it succeeded**: a write acknowledged by the only in-sync replica satisfies `acks=all`.',
      '- **The fix**: `min.insync.replicas=2`, so the partition rejects writes rather than accepting unreplicated ones.',
      '- **The cost**: writes now fail during single-broker maintenance. That is the trade, and it is the correct one for payments.'
    ),
    explanation:
      'Kafka documents this plainly, that "if a topic is configured with only two replicas and one fails (i.e., only one in sync replica remains), then writes that specify acks=all will succeed. However, these writes could be lost if the remaining replica also fails." The general lesson is bigger than Kafka: an acknowledgement is a claim about how far the bytes got, and "durable" is meaningless without naming the failure it survives. The same ladder shows up in Postgres as `synchronous_commit`, where every non-off setting waits for a local flush and `remote_write`, `on` and `remote_apply` buy successively more, at successively larger commit delays. Two rungs get conflated constantly and should not be: a replica having received a record is not the same as having flushed it, and neither is the same as having applied it so a query there can see it.',
  },

  {
    slug: 'sys-metric-series-count',
    title: 'How many series is that',
    category: 'systems',
    difficulty: 'easy',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      'A request counter carries three labels:',
      '',
      code('js', 'httpRequests.inc({ route, method, status });'),
      '',
      'The app has 40 route templates, uses 4 HTTP methods, and returns 6 distinct status codes.',
      '',
      'At most, how many time series does this counter produce? Answer with a number.'
    ),
    graderConfig: {
      accept: ['960', '40 * 4 * 6', '40 x 4 x 6', '40*4*6'],
      acceptPatterns: ['\\b960\\b'],
      nearMisses: {
        '50': 'That is the three counts added together. Labels multiply: a series is one combination of all of them, so it is 40 x 4 x 6.',
        '240':
          'That is 40 x 6, which leaves the method label out. Every label multiplies the count, so it is 40 x 4 x 6.',
      },
      hints: [
        'A time series is one metric name plus one specific combination of label values.',
        'Count the combinations, not the labels.',
        'Multiply the three: 40 route templates x 4 methods x 6 statuses.',
      ],
    },
    canonicalAnswer: '960',
    solution: md('960, which is 40 x 4 x 6: one series per combination of label values.'),
    explanation:
      'Labels multiply, and that is the only arithmetic you need to review a change to an instrumented metric. Every distinct combination of label values is a separate time series with its own memory, storage and query cost, so the counter is not one number, it is 960 of them. The reason to do this sum in review is what happens to it when somebody adds a label whose values are unbounded: a user id over 200,000 users takes the same counter to 192 million series, and nothing warns you until the backend starts dropping data. The ceiling here is an upper bound rather than the real figure, since most routes never return most statuses, but it is the number to design against because it is the one an unusual day can reach.',
  },

  {
    slug: 'sys-rollback-kept-the-bug',
    title: 'Rolled back, still broken',
    category: 'systems',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'Release 118 goes out at 14:00 and breaks checkout. At 14:20 you redeploy the artefact release 117 was running, and checkout is still broken.',
      '',
      'Nothing else has been deployed in between, and the artefact really is the old one.',
      '',
      'Explain what a rollback moves and what it leaves alone, and name what to check before deciding the rollback failed.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'the build',
            'the artefact',
            'the artifact',
            'the image',
            'the code',
            'only the code',
            'code only',
          ],
          missingFeedback: 'Say which one of the two halves of a release actually went backwards.',
        },
        {
          synonyms: [
            'config',
            'environment variable',
            'env var',
            'feature flag',
            'the flag',
            'a flag',
            'secret',
            'migration',
            'schema',
          ],
          missingFeedback: 'Name the half that did not go backwards, and give an example of it.',
        },
        {
          synonyms: [
            'separately',
            'new release',
            'a fresh release',
            'forward',
            'what else changed',
            'what changed',
            'revert the flag',
            'revert the config',
            'roll that back',
          ],
          missingFeedback:
            'A rollback is not a return to an old release. Say what that means for the thing you have to do next.',
        },
      ],
      hints: [
        'A release is not just the thing you built.',
        'Ask what else went out at 14:00 that was not in the artefact.',
        'Redeploying an old build creates a new release carrying today’s config, so anything that changed alongside the code is still on its new value.',
      ],
    },
    canonicalAnswer:
      'A rollback moves the build back and nothing else. What is running is the artefact plus this deploy’s config, so redeploying yesterday’s image picks up today’s environment variables, today’s feature flags and whatever migration has already run. It is a new release pointing at an old build rather than a return to an old release. Before deciding the rollback failed, check what changed in that window that was not code: a flag flipped alongside the deploy, an environment variable that moved, a schema change that landed first, and roll that back separately.',
    solution: md(
      '- **What moves**: the build. The artefact you deployed is the old one, and that part worked.',
      '- **What does not**: the config half of the release. Environment variables, feature flags, secrets and anything already applied to the database are on their current values.',
      '- **What it actually is**: a new release naming an old build. There is no old release to return to, so nothing else comes back with it.',
      '- **What to check**: everything that shipped at 14:00 that was not in the artefact, and revert each of those on its own.'
    ),
    explanation:
      'Releases are append-only, which is the property that makes this surprising the first time. Nothing ever goes backwards: redeploying an old build creates a new release, and that release is combined with the config as it stands now, not as it stood when the build was current. So the mental model to carry into an incident is that a rollback undoes exactly one of the things that changed. This is also the argument for shipping a code change and a config change separately rather than together, because a release with both in it has no clean rollback: you can undo either half and neither undoes the other. The same reasoning is why a schema change goes out as its own release ahead of the code that needs it, since a rollback of the code leaves the migration applied.',
  },

  {
    slug: 'sys-deploy-chunk-404',
    title: 'The tab that was already open',
    category: 'systems',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'For a few minutes after each deploy, some users see the app break on navigation. The console says `Failed to fetch dynamically imported module` and the network tab shows a 404 for `/assets/Orders-c17e93.js`. A reload fixes it, and nobody can reproduce it on a fresh load.',
      '',
      'Explain why only some users hit it, and name two things that stop it.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'before the deploy',
            'already open',
            'old build',
            'previous build',
            'stale',
            'cached html',
            'old html',
            'old index',
            'outdated',
            'loaded earlier',
          ],
          missingFeedback:
            'What is different about the users who see it? Say when their page was loaded.',
        },
        {
          synonyms: [
            'no longer exists',
            'does not exist',
            'deleted',
            'removed',
            'replaced',
            'new hash',
            'different hash',
            'gone',
            'overwritten',
          ],
          missingFeedback: 'Say what happened to the file the browser is asking for.',
        },
        {
          synonyms: [
            'keep the previous',
            'keep the old',
            'keep old',
            'retain',
            'serve the old',
            'reload',
            'preloaderror',
            'preload error',
            'no-cache',
            'no cache',
          ],
          missingFeedback:
            'Name what you would change, on the server or in the client, to stop it.',
        },
      ],
      hints: [
        'Everybody who reloads is fine. Ask what the people who do not reload are holding on to.',
        'Their HTML came from the old build and names chunk filenames the new build does not have.',
        'Two fixes compose: stop deleting the previous build’s hashed assets immediately, and handle the failed import in the client by reloading.',
      ],
    },
    canonicalAnswer:
      'Only tabs that loaded the page before the deploy hit it. Their HTML names hashed chunk filenames from the old build, and the deploy replaced those files, so the lazily imported chunk no longer exists on the server and the request comes back 404. A fresh load never sees it because it gets the new index and the new filenames. Two things stop it: keep the previous build’s hashed assets served for a while instead of deleting them on deploy, and handle the failure in the client by reloading the page, which is what Vite’s vite:preloadError event is for. Sending Cache-Control: no-cache on the HTML keeps a cached index from starting the same problem again.',
    solution: md(
      '- **Who hits it**: anyone whose tab loaded before the deploy. Their HTML references the old build’s hashed filenames.',
      '- **Why it 404s**: the deploy replaced those files with new hashes, so the chunk being imported is not there any more.',
      '- **Fix one, on the server**: keep the previous build’s assets around for a while rather than deleting them, and send `Cache-Control: no-cache` on the HTML.',
      '- **Fix two, in the client**: catch the failed dynamic import and reload. Vite emits `vite:preloadError` for exactly this.'
    ),
    explanation:
      'Content-hashed filenames are what make assets cacheable forever, and the cost of that is that a deploy changes every filename the previous build referenced. So a long-lived tab is holding a manifest of files that are about to stop existing, and the failure only shows up on the first lazy route it tries to reach, which is why it looks intermittent and untraceable. The server-side half of the fix is cheap and worth doing whatever else you do: hashed assets never collide, so keeping two or three builds of them costs disk and nothing else. The client-side half matters because you cannot keep old assets forever, and a reload is safe here in a way it usually is not, since the user has not yet navigated anywhere. This is one visible symptom of a more general property of a rolling deploy, which is that two versions of your code are live at once and one of them is in a browser you do not control.',
  },

  {
    slug: 'sys-secret-in-the-environment',
    title: 'It is only in an environment variable',
    category: 'systems',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'Your API key is never in the repository. The deploy injects it as an environment variable and the server reads `process.env.VENDOR_API_KEY`. A security review flags it anyway.',
      '',
      'Give two reasons the environment is a weak place to keep a secret, and say what changes if the process reads it from a mounted file instead.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'child process',
            'children',
            'inherit',
            'every process',
            'spawn',
            'subprocess',
            'sub-process',
            'anything running as',
            'whole environment',
          ],
          missingFeedback: 'What does every process you start get handed?',
        },
        {
          synonyms: [
            'crash',
            'dump',
            'error report',
            'reporter',
            'logged',
            'in the logs',
            'serialise',
            'serialize',
            'inspect',
            'stack trace',
            'diagnostic',
          ],
          missingFeedback: 'Where does the environment get copied without anybody asking for it?',
        },
        {
          synonyms: [
            'restart',
            'rotate',
            'rotation',
            're-read',
            'reread',
            'read again',
            'read it again',
            'fixed for the life',
            'without restarting',
          ],
          missingFeedback:
            'A file can change under a running process. What can you do with a file that you cannot do with a variable?',
        },
      ],
      hints: [
        'Ask who else can see it, and ask what happens when you want to change it.',
        'Every process you spawn inherits the whole environment, and crash reporters serialise it by default.',
        'A process’s environment is fixed for the life of that process, so rotating a variable is a restart. A file is not.',
      ],
    },
    canonicalAnswer:
      'Two reasons. Every process you spawn inherits the whole environment, so a build step or a shell-out gets the key whether it needs it or not, and so does anything that can already run as you. And crash reporters, process inspectors and some logging setups serialise the environment by default, so the key ends up in a store with wider access than the app has. Reading it from a mounted file changes rotation: a process’s environment is fixed for the life of that process, so rotating a variable means restarting every instance, while a file can be rewritten and read again at the point the connection is opened.',
    solution: md(
      '- **Inheritance**: every child process gets the entire environment, needed or not.',
      '- **Leakage**: crash dumps, error reporters and process inspection tools serialise it by default, into places with different access rules from your app.',
      '- **What a file changes**: a running process’s environment cannot be updated, so rotating a variable is a rolling restart. A file can be rewritten and re-read at the point of use.'
    ),
    explanation:
      'Putting a secret in the environment is a real improvement over putting it in the repository, and that is the whole of what it buys. It is not an access control: it is a value handed to a process and to everything that process starts, readable by anything already running as that user. OWASP puts the default the other way round, that environment variables "are generally accessible to all processes and may be included in logs or system dumps" and are therefore not recommended unless nothing else is available. The rotation point is the one that decides architecture rather than hygiene, because it is what makes a leaked credential expensive to replace: if rotation is a fleet restart, it will be scheduled, and a rotation you have to schedule is one you will not do during the incident that called for it. Short-lived credentials fetched at runtime are the same fix taken further, where the window closes on its own.',
  },

  {
    slug: 'sys-liveness-vs-readiness',
    title: 'One endpoint, two probes',
    category: 'systems',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'Both probes point at the same endpoint, and that endpoint runs `select 1` before answering:',
      '',
      code(
        'yaml',
        'livenessProbe:  { httpGet: { path: /health } }',
        'readinessProbe: { httpGet: { path: /health } }'
      ),
      '',
      'The database has a 30-second blip. Every instance in the fleet restarts, and they keep restarting for several minutes after the database has recovered.',
      '',
      'Explain what each probe decides, and which one should have been touching the database.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'restart',
            'restarted',
            'kill',
            'killed',
            'replaces the container',
            'recreate',
          ],
          missingFeedback: 'What does the platform do when a liveness probe fails?',
        },
        {
          synonyms: [
            'traffic',
            'rotation',
            'endpoint',
            'routed',
            'sent requests',
            'sent a request',
            'load balancer',
            'out of the pool',
          ],
          missingFeedback: 'What does the platform do when a readiness probe fails?',
        },
        {
          synonyms: [
            'wedged',
            'deadlock',
            'event loop',
            'the process itself',
            'no dependencies',
            'no dependency',
            'cheap',
            'responds at all',
            'responding at all',
            'answers at all',
          ],
          missingFeedback:
            'Say what a liveness check should actually be measuring, given a restart cannot fix a database.',
        },
      ],
      hints: [
        'The two probes have different consequences when they fail, and that is the whole distinction.',
        'One decides whether the container is restarted. The other decides whether it is sent traffic.',
        'A restart cannot fix a shared database, so the dependency belongs in the probe whose failure means "not me" rather than "kill me".',
      ],
    },
    canonicalAnswer:
      'Liveness decides whether the container gets restarted. Readiness decides whether it is sent traffic, by taking it out of rotation when it fails. Pointing both at a check that queries the database means a database outage reads as every process being broken, so the whole fleet is killed and restarted, and a restart does nothing for a database, which is why it keeps happening. The dependency belongs in readiness only, where failing removes the instance from the pool and it rejoins on its own once the query works again. Liveness should measure whether this process itself is wedged, so responding at all is most of the answer: keep it cheap and give it no dependencies.',
    solution: md(
      '- **Liveness**: decides whether to restart the container. Failing it is a kill.',
      '- **Readiness**: decides whether to send it traffic. Failing it removes the instance from rotation and nothing is destroyed.',
      '- **Where the database belongs**: readiness. A restart cannot repair a shared dependency, and restarting throws away warm caches and pools at the worst moment.',
      '- **What liveness should check**: that this process is not wedged. Answering the request at all is most of the signal.'
    ),
    explanation:
      'The two probes look like the same question because both are called "health", and their failure modes have nothing in common. A liveness probe with a dependency in it converts an outage in that dependency into a fleet-wide restart loop, which is strictly worse than the outage: requests that did not need the database now fail too, warm state is thrown away, and every process reconnects at once the moment the database comes back, which is the load it least wants. The honest liveness check for a Node server is close to empty, because what it is really asking is whether the event loop is free enough to answer. A readiness check that fails everywhere at once has a subtler version of the same problem: the fleet leaves the rotation together and the balancer has nowhere to send anything, so where a dependency is shared it is often better to degrade inside the handler than to leave the pool at all.',
  },

  {
    slug: 'sys-readiness-too-early',
    title: 'Ready before it is ready',
    category: 'systems',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'Every new instance serves errors for its first two or three seconds and then settles. The readiness endpoint is registered alongside the other routes and returns 200 as soon as the server is listening. Boot also opens a connection pool and loads a 40MB pricing table into memory.',
      '',
      'Explain why the deploy hands it traffic anyway, and give two ways to stop it.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'listening',
            'as soon as',
            'says yes',
            'answers yes',
            'returns 200',
            'still loading',
            'still booting',
            'before the pool',
            'not finished',
            'has not finished',
          ],
          missingFeedback:
            'The check is answering something. Say what it is answering, and how that differs from the question being asked.',
        },
        {
          synonyms: [
            'rotation',
            'traffic',
            'endpoint',
            'the pool',
            'sent requests',
            'added',
            'joins',
            'joined',
          ],
          missingFeedback: 'Say what the deploy does as soon as the check passes.',
        },
        {
          synonyms: [
            'flag',
            'starts false',
            'false until',
            'after boot',
            'once boot',
            'set it after',
            'startup probe',
            'initialdelay',
            'initial delay',
          ],
          missingFeedback:
            'Name something concrete that would hold the instance back until it is ready.',
        },
      ],
      hints: [
        'The endpoint is not lying. Ask what question it is actually able to answer.',
        'It reports 200 as soon as the process is listening, which happens before the pool and the pricing table are ready.',
        'Either hold a flag that only becomes true once boot has finished, or give the platform a startup probe so readiness is not consulted yet.',
      ],
    },
    canonicalAnswer:
      'The check answers a different question from the one being asked. It reports 200 as soon as the process is listening, which happens before the pool is open and before the pricing table is loaded, so it says yes while it is still booting and the swap adds it to the rotation immediately. Two ways to stop it: hold a flag that starts false and becomes true only once boot has finished, so readiness returns 503 until then, or configure a startup probe, which makes the platform wait before it consults readiness at all.',
    solution: md(
      '- **Why it gets traffic**: readiness passes the moment the server is listening, which is earlier than the moment it can serve a request.',
      '- **Fix one**: a flag that starts `false` and is set after boot completes. Readiness returns 503 until then.',
      '- **Fix two**: a startup probe, which holds off liveness and readiness entirely until the process reports it has started.'
    ),
    explanation:
      'Readiness is a claim about being able to serve a request, and "the framework is listening" is a much weaker claim that happens to be available earlier. The gap is small on a laptop and large in production, because that is where the pool has to reach a real database and the warm-up has real data in it. The flag is the version worth reaching for first, because it puts the definition of ready in the code that knows what boot involves, rather than in a delay somebody guessed. Guessed delays are the failure mode of the alternative: an initial delay that is long enough today becomes too short the day the pricing table doubles, and nothing tells you except a spike of errors after each deploy. A startup probe is the platform-side version of the same idea and composes with the flag rather than replacing it.',
  },

  {
    slug: 'sys-request-id-join',
    title: 'One failure or five',
    category: 'systems',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'A customer reports that checkout failed at about 09:15. Five services logged errors in that minute, all structured, all with timestamps and stack traces. Nobody can tell whether that was one failure that cascaded or five unrelated ones.',
      '',
      'Name what is missing, say where it has to be created, and say what makes it useful to whoever is taking the support call.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'request id',
            'requestid',
            'correlation',
            'trace id',
            'traceid',
            'x-request-id',
            'shared identifier',
          ],
          missingFeedback: 'Name the field that lets you tell one request’s lines from another’s.',
        },
        {
          synonyms: [
            'edge',
            'first',
            'entry point',
            'gateway',
            'the proxy',
            'generate',
            'generated',
            'propagat',
            'forward',
            'passed on',
            'header',
          ],
          missingFeedback: 'Say where the value comes from and how the other four services get it.',
        },
        {
          synonyms: [
            'response',
            'returned',
            'return it',
            'error page',
            'support',
            'screenshot',
            'ticket',
            'the customer can',
          ],
          missingFeedback:
            'Say what makes the id reachable from a support conversation rather than only from a log search.',
        },
      ],
      hints: [
        'Timestamps are not enough, because five services logging in the same minute is normal.',
        'One value shared by every line that belongs to that one request, created once and passed on.',
        'Generate it at the edge, forward it on every outbound call, and return it in the response so the customer can quote it.',
      ],
    },
    canonicalAnswer:
      'A request id, sometimes called a correlation id: one value shared by everything that handled that request. Generate it at the edge, at the first thing that touches the request, accepting an inbound one only from a proxy you operate, and forward it as a header on every outbound call so all five services put the same value on their lines. Joining the logs is then a filter rather than a guess about timestamps. What makes it useful on a support call is returning it in the response and showing it on the error page, so the id in the customer’s screenshot is the id you search for.',
    solution: md(
      '- **What is missing**: a request id shared by every line belonging to one request.',
      '- **Where it starts**: the edge. Generate it at the first hop, and accept an inbound one only from a proxy you control.',
      '- **How it spreads**: forwarded as a header on every outbound call, and put on every log line by the logger rather than by each call site.',
      '- **What makes it useful**: returning it in the response, so a screenshot or a support ticket carries the search term.'
    ),
    explanation:
      'Structured logs make each line queryable and still leave you unable to answer the question that matters during an incident, which is which lines belong together. An id fixes that for the price of one middleware, and the reason to generate it at the edge rather than per service is that anything created further in cannot cover the hops before it. Two details decide whether it survives contact with production. Trust the inbound header only from a proxy you operate, for the same reason a forwarded address is a claim rather than a fact, since a client can send any value it likes and a shared id is a way to pollute somebody else’s search. And attach it in the logger’s context rather than passing it to each call site, because a field that has to be remembered is a field that will be missing on the line you needed. Returning it to the client is the cheapest part and the one most often skipped.',
  },

  {
    slug: 'sys-metric-cardinality',
    title: 'One more label',
    category: 'systems',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'A pull request adds one label to the request counter, so support can look up a specific customer:',
      '',
      code(
        'diff',
        '- httpRequests.inc({ route, method, status });',
        '+ httpRequests.inc({ route, method, status, userId });'
      ),
      '',
      'There are 40 route templates, 4 methods, 6 status codes and 200,000 users.',
      '',
      'Explain what this costs, and say where that field should go instead.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'time series',
            'series',
            'multipl',
            'product',
            'one per user',
            'cardinality',
            'explod',
            'combination',
          ],
          missingFeedback:
            'Say what a metric is actually storing, and what one more label does to it.',
        },
        {
          synonyms: [
            'unbounded',
            '192',
            'million',
            'grows with',
            'every new user',
            'no ceiling',
            '200,000',
            '200000',
            'keeps growing',
          ],
          missingFeedback: 'Put a number on it, or say what happens as the user table grows.',
        },
        {
          synonyms: ['log', 'span', 'trace', 'per event', 'attribute'],
          missingFeedback: 'Name the signal that can hold a customer id without this cost.',
        },
      ],
      hints: [
        'A metric is not a place you put things. Ask what it is actually storing.',
        'A time series is one combination of label values, so labels multiply rather than add.',
        '960 series becomes 192 million, and it grows with the user table. The customer id belongs on a log line or a span.',
      ],
    },
    canonicalAnswer:
      'It multiplies the number of time series. A series is one combination of metric name and label values, so the counter goes from 40 x 4 x 6, which is 960 series, to 192 million, and it keeps growing with every new user instead of settling. Each series costs memory and storage of its own in the metrics backend, and once the limit is hit the queries over the old labels stop returning what they used to. The customer id belongs on a log line or as a span attribute, where the cost is per event and the store is built for fields like it, because a metric is an aggregate and cannot answer a question about one customer anyway.',
    solution: md(
      '- **The cost**: labels multiply. 40 x 4 x 6 is 960 series; adding a user id over 200,000 users is 192 million, and it grows with the user table rather than settling.',
      '- **Why it bites**: each series carries its own memory, storage and query cost, and hitting a backend’s cardinality limit degrades the panels built on the other labels too.',
      '- **Where the field goes**: a log line or a span attribute, where the cost is per event.',
      '- **The rule**: if the set of values is unbounded, it is not a label.'
    ),
    explanation:
      'The reason this keeps happening is that a label looks like a field on a record, and it is not: it is a dimension, and dimensions multiply. What makes it worse than an ordinary capacity problem is the shape of the failure. The metric that broke is rarely the one that goes wrong first; the backend hits a limit and drops or collapses series, so panels built on the well-behaved labels start reading a different set of data, and the dashboards you would use to diagnose it are the ones that stopped working. OpenTelemetry is explicit that overflow replaces the entire attribute combination rather than just the high-cardinality part of it. The review question is one line: could this value ever be an id, an email address, a raw URL path, or an error message? Raw paths are the one people miss, since a `route` label holding `/orders/4821` is one series per order that has ever been fetched.',
  },

  codeProblem({
    slug: 'sys-config-read-at-boot',
    title: 'The environment is all strings',
    category: 'systems',
    difficulty: 'medium',
    relevance: 'daily',
    prompt: md(
      'Write `readConfig(env)`, which turns a plain object of environment strings into a typed config object and refuses anything it cannot make sense of.',
      '',
      '- `port` comes from `PORT` and must be an integer. Default 3000.',
      '- `databaseUrl` comes from `DATABASE_URL` and is required. An empty string counts as missing.',
      '- `verboseErrors` comes from `VERBOSE_ERRORS`, which must be exactly `"true"` or `"false"`. Default `false`.',
      '',
      'Anything invalid or missing throws an `Error` whose message names the variable. Return the three keys and nothing else.'
    ),
    starter: 'function readConfig(env) {\n  \n}',
    tests: [
      {
        name: 'applies the defaults when only the required variable is set',
        expression: "readConfig({ DATABASE_URL: 'postgres://localhost/app' })",
        expected: {
          port: 3000,
          databaseUrl: 'postgres://localhost/app',
          verboseErrors: false,
        },
      },
      {
        name: 'parses the values that are set',
        expression:
          "readConfig({ DATABASE_URL: 'postgres://x', PORT: '8080', VERBOSE_ERRORS: 'true' })",
        expected: { port: 8080, databaseUrl: 'postgres://x', verboseErrors: true },
      },
      {
        name: '"false" is false, not a truthy string',
        expression:
          "readConfig({ DATABASE_URL: 'postgres://x', VERBOSE_ERRORS: 'false' }).verboseErrors",
        expected: false,
      },
      {
        name: 'port comes back as a number',
        expression: "typeof readConfig({ DATABASE_URL: 'postgres://x', PORT: '8080' }).port",
        expected: 'number',
      },
      {
        name: 'a missing required variable throws, naming it',
        expression: 'readConfig({})',
        throws: 'DATABASE_URL',
      },
      {
        name: 'an empty required variable counts as missing',
        expression: "readConfig({ DATABASE_URL: '' })",
        throws: 'DATABASE_URL',
      },
      {
        name: 'a port that is not an integer throws, naming it',
        expression: "readConfig({ DATABASE_URL: 'postgres://x', PORT: '8080abc' })",
        throws: 'PORT',
      },
      {
        name: 'a boolean that is not true or false throws, naming it',
        expression: "readConfig({ DATABASE_URL: 'postgres://x', VERBOSE_ERRORS: '1' })",
        throws: 'VERBOSE_ERRORS',
      },
    ],
    hints: [
      'Every value arriving here is a string or `undefined`. There is no boolean and no number to read.',
      '`Boolean("false")` is `true`, so a flag has to compare against the two strings you accept.',
      '`Number("8080abc")` is `NaN`, and `Number.isInteger` is the check that catches both that and `"80.5"`.',
    ],
    reference: [
      'function readConfig(env) {',
      '  const required = (name) => {',
      '    const raw = env[name];',
      "    if (raw === undefined || raw === '') throw new Error(`${name} is not set`);",
      '    return raw;',
      '  };',
      '',
      '  const integer = (name, fallback) => {',
      '    const raw = env[name];',
      '    if (raw === undefined) return fallback;',
      '    const value = Number(raw);',
      '    if (!Number.isInteger(value)) throw new Error(`${name} is "${raw}", not an integer`);',
      '    return value;',
      '  };',
      '',
      '  const flag = (name, fallback) => {',
      '    const raw = env[name];',
      '    if (raw === undefined) return fallback;',
      "    if (raw !== 'true' && raw !== 'false') {",
      '      throw new Error(`${name} is "${raw}", not true or false`);',
      '    }',
      "    return raw === 'true';",
      '  };',
      '',
      '  return {',
      "    port: integer('PORT', 3000),",
      "    databaseUrl: required('DATABASE_URL'),",
      "    verboseErrors: flag('VERBOSE_ERRORS', false),",
      '  };',
      '}',
    ].join('\n'),
    explanation:
      'Everything in an environment is a string, so every type an app has is one you produced by parsing, and the only question is where. Doing it here means a bad value stops the process while somebody is watching the deploy, and the rest of the codebase reads `config.port` and gets a number. Doing it at the point of use means `Number(process.env.REQUEST_TIMEOUT_MS)` quietly becomes `NaN`, which Node accepts as a timeout of one millisecond behind a warning nobody reads. The boolean is the one that catches people out, because `Boolean("false")` is `true`: a non-empty string is truthy, and nothing in the chain knows the string was meant as a flag. Treating empty as missing is a judgement call worth making deliberately, since platforms differ on whether an unset variable arrives as absent or as an empty string, and a database URL of `""` is never what anybody meant.',
  }),

  {
    slug: 'sys-drain-before-close',
    title: 'Connection refused during the deploy',
    category: 'systems',
    difficulty: 'hard',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A rolling deploy drops a few hundred requests every time. The shutdown handler looks correct, and requests already inside the process do finish:',
      '',
      code('js', "process.on('SIGTERM', () => {", '  server.close(() => process.exit(0));', '});'),
      '',
      'The failures are connection refused, and they land in the two or three seconds after each instance begins shutting down.',
      '',
      'Explain where those requests are coming from, and give the order the handler should do things in.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'poll',
            'interval',
            'has not noticed',
            'still thinks',
            'still sending',
            'not found out',
            'takes a moment',
            'takes time',
            'propagat',
            'health check',
            'probe',
            'lag',
          ],
          missingFeedback:
            'Something is still sending requests to this instance. Say how it finds out that it should stop.',
        },
        {
          synonyms: [
            'refus',
            'stops accepting',
            'stopped accepting',
            'no longer accepting',
            'closes the listener',
            'closed the listener',
            'immediately',
            'straight away',
          ],
          missingFeedback:
            'Say what `server.close()` does to a connection that arrives one millisecond later.',
        },
        {
          synonyms: [
            'readiness',
            'unready',
            'fail the check',
            'out of rotation first',
            'wait',
            'delay',
            'sleep',
            'then close',
            'before closing',
          ],
          missingFeedback: 'Give the order. Say what has to happen before the listener closes.',
        },
      ],
      hints: [
        'The requests are not being dropped by your process. Ask what is still sending them.',
        'A balancer learns an instance is gone by asking, on an interval, so there is a window of seconds where it is still routing traffic here.',
        'Fail readiness first and keep serving, wait longer than that interval, and only then stop accepting connections.',
      ],
    },
    canonicalAnswer:
      'They come from whatever is in front of the instance, which has not found out yet. A balancer learns that an instance is gone by polling a check on an interval, so for a few seconds after the process decides to stop it is still being routed traffic. server.close() stops accepting new connections immediately, so everything that arrives in that window is refused rather than served. Do it in the other order: fail the readiness check first and keep serving, wait longer than the checker’s interval so the instance leaves the rotation, then call server.close() and let the requests already inside the process finish, with a deadline afterwards so one slow handler cannot hold the deploy open forever.',
    solution: md(
      '1. **Fail readiness**, and keep serving. This is the only way to tell the balancer to stop, and it is not instant.',
      '2. **Wait** longer than the checker’s interval. nginx’s passive default is one failed attempt inside a 10-second `fail_timeout`; an active probe has a period and a threshold.',
      '3. **`server.close()`**, which stops accepting new connections and lets in-flight requests finish.',
      '4. **A deadline**, after which you exit anyway, so one stuck handler cannot hold the deploy open.'
    ),
    explanation:
      'The mistake is treating the stop signal as the moment traffic stops, when it is only the moment you found out. Nothing upstream is watching your process: it discovers the change by asking, so the interval between asks is a window in which requests keep arriving, and closing the listener first turns every one of them into a connection refused. That is why the handler spends its first seconds doing nothing except failing a health check. The deadline at the end matters for the opposite reason: `server.close()` waits for in-flight requests, so a single long-running handler or a websocket can hold the process open past the platform’s grace period, at which point it is killed and you get the abrupt shutdown you were trying to avoid. Two numbers make this concrete and are worth knowing for your own stack: how often the thing in front of you checks, and how long the platform waits before it stops asking.',
  },

  {
    slug: 'sys-trace-stops-at-the-queue',
    title: 'The trace that ends at the enqueue',
    category: 'systems',
    difficulty: 'hard',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'Tracing works. An incoming request produces one trace covering the API and two downstream HTTP calls it makes. The same handler also enqueues a job, and the worker that runs it produces a separate trace of its own, with nothing linking the two.',
      '',
      'Explain why the HTTP hops joined up and the queued job did not, and what has to change.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'header',
            'traceparent',
            'inject',
            'instrumentation',
            'automatic',
            'automatically',
            'http client',
          ],
          missingFeedback: 'Say how the context reached the two downstream services.',
        },
        {
          synonyms: [
            'nothing',
            'no one',
            'does not propagate',
            'not propagated',
            'only what',
            'you put',
            'manually',
            'yourself',
            'nobody',
          ],
          missingFeedback: 'Say why the same thing did not happen on the way into the queue.',
        },
        {
          synonyms: [
            'extract',
            'child',
            'parent',
            'link',
            'continue',
            'resume',
            'in the message',
            'in the payload',
          ],
          missingFeedback: 'Say what the producer puts where, and what the worker does with it.',
        },
      ],
      hints: [
        'The HTTP calls did not join up by magic. Ask what physically travelled between the services.',
        'Over HTTP the context rides in a request header and the instrumentation adds it for you. A queue message has no such convention.',
        'Serialise the context into the message, extract it in the worker, and start the consumer’s span from it as a child or a link.',
      ],
    },
    canonicalAnswer:
      'The HTTP hops joined up because the trace context travels as a request header, traceparent, and the HTTP instrumentation injects it on the way out and extracts it on the way in without anybody asking. A queue message has no such convention: it carries only what you put in it, so nothing propagated the context and the worker started a fresh trace of its own. Serialise the context into the message, as a field of the payload or in the broker’s own message headers, extract it in the worker, and start the consumer’s span as a child of it or as a link to it.',
    solution: md(
      '- **Why HTTP worked**: the context rides in a request header (`traceparent`), and the client instrumentation injects it and the server instrumentation extracts it.',
      '- **Why the queue did not**: a message carries only the fields you put in it. Nothing adds a header you did not write.',
      '- **The change**: inject the serialised context into the message when producing, extract it when consuming, and start the worker’s span as a child of it, or as a link where the two are genuinely asynchronous.'
    ),
    explanation:
      'Context propagation is a convention rather than a property of tracing, so it holds exactly where somebody has implemented it and stops everywhere else. HTTP has the convention and mature instrumentation, which is what makes the first half of the trace appear for free and gives the misleading impression that the tracer follows the work. It does not: it follows a header. Every boundary that is not an instrumented HTTP call is a place the trace ends, and a queue is only the most obvious one. An outbox row, a cron job reading a table, a `setTimeout` firing after the response, and a batch file picked up an hour later are all the same gap. Child span or link is a real choice rather than a detail: a child implies the parent is waiting, which is exactly what is not true of a queued job, so a link is usually the more honest shape once the producer has already returned a response.',
  },

  codeProblem({
    slug: 'sys-module-boundary-imports',
    title: 'The boundary nothing was checking',
    category: 'systems',
    difficulty: 'medium',
    relevance: 'occasional',
    prompt: md(
      'A modular monolith keeps its boundaries by checking them. Write `illegalImports(edges, allowed)`, which reports the imports that cross a boundary they are not allowed to cross.',
      '',
      "- An edge is `{ from, to }`, and each side is a path whose first segment names the module: `'billing/invoice.ts'` is in `billing`.",
      '- `allowed` maps a module to the modules it may import. A module missing from it may import nothing outside itself.',
      '- An import inside one module is always fine.',
      '',
      "Return `'billing -> orders'` for each illegal pair, in the order the edges appear, with each pair reported once."
    ),
    starter: 'function illegalImports(edges, allowed) {\n  \n}',
    setup: [
      "const ALLOWED = { billing: ['shared'], orders: ['shared', 'billing'] };",
      '',
      'const EDGES = [',
      "  { from: 'orders/checkout.ts', to: 'shared/money.ts' },",
      "  { from: 'orders/checkout.ts', to: 'billing/invoice.ts' },",
      "  { from: 'billing/invoice.ts', to: 'billing/lines.ts' },",
      "  { from: 'billing/invoice.ts', to: 'orders/repo.ts' },",
      "  { from: 'billing/pdf.ts', to: 'orders/repo.ts' },",
      "  { from: 'reports/daily.ts', to: 'orders/repo.ts' },",
      '];',
    ].join('\n'),
    tests: [
      {
        name: 'reports each illegal pair once, in the order it first appears',
        expression: 'illegalImports(EDGES, ALLOWED)',
        expected: ['billing -> orders', 'reports -> orders'],
      },
      {
        name: 'an import inside one module is never a crossing',
        expression: "illegalImports([{ from: 'billing/a.ts', to: 'billing/b.ts' }], {})",
        expected: [],
      },
      {
        name: 'a module missing from the map may still import itself',
        expression: "illegalImports([{ from: 'reports/a.ts', to: 'reports/b.ts' }], ALLOWED)",
        expected: [],
      },
      {
        name: 'a module missing from the map may import nothing else',
        expression: "illegalImports([{ from: 'reports/a.ts', to: 'shared/money.ts' }], ALLOWED)",
        expected: ['reports -> shared'],
      },
      {
        name: 'an allowed crossing is not reported',
        expression: "illegalImports([{ from: 'orders/a.ts', to: 'billing/b.ts' }], ALLOWED)",
        expected: [],
      },
      {
        name: 'a nested path is still the same module',
        expression:
          "illegalImports([{ from: 'billing/pdf/render.ts', to: 'billing/lines.ts' }], ALLOWED)",
        expected: [],
      },
      {
        name: 'nothing to check',
        expression: 'illegalImports([], ALLOWED)',
        expected: [],
      },
    ],
    reference: [
      'function illegalImports(edges, allowed) {',
      '  const seen = new Set();',
      '  const crossings = [];',
      '',
      '  for (const { from, to } of edges) {',
      "    const source = from.split('/')[0];",
      "    const target = to.split('/')[0];",
      '    if (source === target) continue;',
      '    if ((allowed[source] ?? []).includes(target)) continue;',
      '',
      '    const pair = `${source} -> ${target}`;',
      '    if (seen.has(pair)) continue;',
      '    seen.add(pair);',
      '    crossings.push(pair);',
      '  }',
      '',
      '  return crossings;',
      '}',
    ].join('\n'),
    hints: [
      'The module is the first path segment, so both sides need splitting before they can be compared.',
      'Two things let an edge through: the modules are the same, or the target is on the source module’s list.',
      '`allowed[source] ?? []` covers the module nobody listed, and a `Set` of pairs already reported covers the duplicates.',
    ],
    explanation:
      'A module boundary is whatever fails when you cross it, and in a single deployable that is a check like this one rather than a network. The interesting decision is the `?? []`: a module with no entry can import nothing, so adding a module to the codebase without adding it to the map denies by default rather than opening a hole nobody notices. Reporting a pair once rather than a line once is what makes the output a burndown, because the number you care about is how many boundaries are being crossed rather than how many files do it. This is also the cheap half of the same argument a service boundary makes expensively: the enforcement is what stops accidental coupling, and only the enforcement mechanism differs.',
  }),

  {
    slug: 'sys-split-shared-database',
    title: 'Two services, one table',
    category: 'systems',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'Orders and invoices were split into two services six months ago. Each has its own repository, its own pipeline and its own deploy, and they call each other over HTTP.',
      '',
      'Both still connect to the same Postgres, and both read and write the `orders` table.',
      '',
      'Last week a column rename needed both teams in a room and a release in a fixed order. Last month an invoices bug turned out to be an orders migration.',
      '',
      'Say what the split actually bought, and name the change that would make the two independent.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'schema',
            'same table',
            'shared database',
            'share the database',
            'still coupled',
            'coupled',
            'not independent',
            'nothing',
            'together',
            'lockstep',
            'coordinate',
          ],
          missingFeedback:
            'Say what the two services still share, and what that means for a change to it.',
        },
        {
          synonyms: [
            'network',
            'over http',
            'http call',
            'latency',
            'two pipelines',
            'two repos',
            'operate',
            'operational',
            'overhead',
            'the cost',
            'can fail',
            'partial failure',
            'distributed',
          ],
          missingFeedback: 'Say what the split did add, given that it did not add independence.',
        },
        {
          synonyms: [
            'private',
            'owns',
            'own database',
            'its own schema',
            'only writer',
            'one owner',
            'through an api',
            'via its api',
            'via an api',
            'behind an api',
            'an api',
            'an endpoint',
            'an event',
            'database per service',
            'stop sharing',
            'separate database',
            'own tables',
          ],
          missingFeedback:
            'Name the change. Say who may touch that table afterwards, and how the other side gets what it needs.',
        },
      ],
      hints: [
        'Two services with separate pipelines still have to ship in a fixed order. Ask what forces that.',
        'A schema shared by two services is a contract neither of them owns, so every change to it is a negotiation and a release order.',
        'The rule is that a service owns its data and everyone else asks for it: one writer, one owner of the schema, and an API or an event for the other side.',
      ],
    },
    canonicalAnswer:
      'Very little. The schema is the coupling and it did not move: both services read and write the same table, so a column rename is still a coordinated release in a fixed order and an orders migration can still break invoices. What did arrive is the cost, which is a network hop where there used to be a function call, two pipelines, and two of everything to operate. Make the orders service the only writer and reader of those tables, keep the data private to it, and give invoices an API to call or an event to consume for what it needs, so each side can change its own schema without asking.',
    solution: md(
      '- **What it bought**: the costs. A network hop where a function call used to be, two pipelines, two deploys, two of everything to operate.',
      '- **What it did not buy**: independence. The schema is shared, so a rename is still a coordinated release in a fixed order and one side’s migration can still break the other.',
      '- **The change**: the data becomes private to one service. One owner of those tables, one writer, and an API or an event for anybody else who needs what is in them.'
    ),
    explanation:
      'Splitting the code is the visible half and splitting the data is the half that decides whether anything changed. Two services against one schema deploy in lockstep, because the schema is a contract that neither of them owns and both of them can break, so you have kept every coupling you had and added a network to it. The standard statement of the fix is to keep each service’s persistent data private and reachable only through its API, and the price is the part people skip: a join across the boundary becomes two calls and some assembly, and a write that spanned both tables becomes two writes with no transaction over them. That price is the reason this is a decision rather than a rule. Until it is paid, the honest description of the system is a monolith with a network in the middle.',
  },

  {
    slug: 'sys-migration-stalled',
    title: 'Ninety percent done for a year',
    category: 'systems',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A migration from an old HTTP client to a new one started nine months ago. There were 380 call sites then. There are 374 now.',
      '',
      'Every team has been told twice, the new client is documented on the wiki, and there is a `#migration` channel.',
      '',
      'Say why the number is not moving, and name the two mechanisms that would move it.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'new call site',
            'new code',
            'still being added',
            'still added',
            'keeps being',
            'keep adding',
            'keeps adding',
            'nothing stops',
            'nothing prevents',
            'nothing stopping',
            'no rule',
            'not prevented',
            'as fast as',
            'net',
            'still reaching for the old',
            'still using the old',
          ],
          missingFeedback:
            'Six in nine months is the difference between two rates. Say what the other rate is.',
        },
        {
          synonyms: [
            'ratchet',
            'baseline',
            'lint',
            'the build',
            'block',
            'refuse',
            'cannot add',
            'max-warnings',
            'commit the count',
            'threshold',
            'automated check',
          ],
          missingFeedback:
            'Name the mechanism that stops the number going up, and say where it runs.',
        },
        {
          synonyms: [
            'ticket',
            'owner',
            'assign',
            'priorit',
            'leadership',
            'burndown',
            'do it yourself',
            'themselves',
            'the migrating team',
            'finish it',
            'the team leading',
            'track',
          ],
          missingFeedback:
            'Stopping the growth is only half. Say what actually removes the 374 that are left.',
        },
      ],
      hints: [
        'The number is the net of two rates, and you have only been managing one of them.',
        'Nothing in the build stops a branch adding a 375th call site, so removals and additions cancel out.',
        'Commit the current count as a baseline and fail the build on any increase, then cut a ticket per remaining site with a named owner and finish the stubborn ones yourself.',
      ],
    },
    canonicalAnswer:
      'Because nothing prevents a new call site. The old client is still being added while you remove it, so six in nine months is the net of two rates, and telling people changes neither one. Two mechanisms move it. A ratchet: count the 374 that exist, commit that number as a baseline, and fail the build when a branch makes it 375, so the number can only go down. And somebody finishing it: a tracking ticket per remaining call site with a named owner, status pushed to the teams that own them, and the last stubborn ones done by the team leading the migration rather than left with whoever happens to own the file.',
    solution: md(
      '- **Why it is stuck**: nothing prevents a new call site, so the old client keeps being added while you remove it and the visible number is the net of two rates.',
      '- **Stop the growth**: a ratchet. Commit the current count as a baseline and fail the build on any increase, so nobody is blocked by the 374 that exist and nobody can make it 375.',
      '- **Remove what is left**: a ticket per call site with a named owner, status pushed to the teams that own them, and the last few done by the team leading the migration.'
    ),
    explanation:
      'A migration is two rates, and an announcement moves neither. Documentation and a channel tell people what to do when they are already thinking about it, which is the small fraction of the time somebody is adding a call site. The ratchet is what makes the good intention structural: it allows exactly what exists today, so no branch is blocked by somebody else’s file, and it refuses the next one, so the direction of travel is a property of CI. That leaves the finish, which is the part that reliably goes unfunded, because every remaining call site sits in a team whose own roadmap does not include your migration. The general rule is worth carrying: a migration with no number is not a migration, and one with a number and no ratchet is a treadmill.',
  },

  codeProblem({
    slug: 'sys-ratchet-baseline',
    title: 'Allow what exists, refuse what is new',
    category: 'systems',
    difficulty: 'medium',
    relevance: 'occasional',
    prompt: md(
      'A ratchet lets a rule land on a codebase that cannot satisfy it yet. It allows what is already there, refuses anything new, and never lets the number go back up.',
      '',
      'Write `ratchet(baseline, current)`. Both are objects mapping a rule name to a violation count.',
      '',
      '- A rule is fine when its current count is at or below its baseline.',
      '- A rule with no baseline entry has never been allowed, so any count above zero fails it.',
      '- Return `{ ok, worse, next }`. `worse` names the failing rules in the order they appear in `current`. `next` is the baseline to commit: one entry per rule in `current`, at the lower of the two counts, so a rule that regressed keeps the baseline it had.'
    ),
    starter: 'function ratchet(baseline, current) {\n  \n}',
    tests: [
      {
        name: 'a run under baseline passes and lowers it',
        expression:
          "ratchet({ 'no-legacy-client': 382, 'no-any': 40 }, { 'no-legacy-client': 374, 'no-any': 40 })",
        expected: {
          ok: true,
          worse: [],
          next: { 'no-legacy-client': 374, 'no-any': 40 },
        },
      },
      {
        name: 'a rule that went up fails and is named',
        expression: "ratchet({ 'no-any': 40 }, { 'no-any': 41 })",
        expected: { ok: false, worse: ['no-any'], next: { 'no-any': 40 } },
      },
      {
        name: 'the committed baseline never goes up',
        expression: "ratchet({ 'no-any': 40 }, { 'no-any': 41 }).next['no-any']",
        expected: 40,
      },
      {
        name: 'a rule nobody baselined fails at any count',
        expression: "ratchet({}, { 'no-console': 3 })",
        expected: { ok: false, worse: ['no-console'], next: { 'no-console': 0 } },
      },
      {
        name: 'a rule nobody baselined passes at zero',
        expression: "ratchet({}, { 'no-console': 0 })",
        expected: { ok: true, worse: [], next: { 'no-console': 0 } },
      },
      {
        name: 'names every failing rule, in the order current lists them',
        expression:
          "ratchet({ 'no-any': 1, 'no-console': 1 }, { 'no-console': 2, 'no-any': 2 }).worse",
        expected: ['no-console', 'no-any'],
      },
    ],
    reference: [
      'function ratchet(baseline, current) {',
      '  const worse = [];',
      '  const next = {};',
      '',
      '  for (const [rule, count] of Object.entries(current)) {',
      '    const allowed = baseline[rule] ?? 0;',
      '    if (count > allowed) worse.push(rule);',
      '    next[rule] = Math.min(allowed, count);',
      '  }',
      '',
      '  return { ok: worse.length === 0, worse, next };',
      '}',
    ].join('\n'),
    hints: [
      'Walk `current`, because a rule that was not measured this time has nothing to say about this run.',
      '`baseline[rule] ?? 0` is what makes a rule nobody baselined strict rather than free.',
      '`Math.min` is the whole of "never goes up": the number you commit is the lower of the two, including for a rule that just failed.',
    ],
    explanation:
      'The baseline file is the burndown, and keeping it in the repository is what makes the direction of travel a property of the build rather than of everyone remembering. Two decisions in five lines are worth naming. An unbaselined rule is strict, so adding a rule to the config without measuring it fails loudly instead of silently allowing whatever is there. And `next` is computed on a failing run too, which keeps the function total and answers the question people ask about it: nothing commits that number, because CI already went red, so a regression cannot quietly widen the allowance it just broke. The reason a threshold beats a rule at all is social rather than technical, which is that a rule the codebase cannot satisfy blocks people whose branch has nothing to do with it, and it is turned off the same afternoon.',
  }),

  codeProblem({
    slug: 'sys-port-translates-sentinels',
    title: 'Minus two is not a number of seconds',
    category: 'systems',
    difficulty: 'medium',
    relevance: 'occasional',
    prompt: md(
      'A cache sits behind a port you own. The Redis client underneath answers `TTL` with the seconds a key has left, `-1` when the key exists with no deadline, and `-2` when there is no key at all.',
      '',
      "Write `nextAction(ttlReply, refreshWithinSeconds)`, the port's translation of that reply into one of three words:",
      '',
      "- `'populate'` — there is nothing cached.",
      "- `'refresh'` — serve what is there, and rebuild it in the background.",
      "- `'serve'` — serve it and do nothing else.",
      '',
      'A key at or inside the refresh window is refreshed. A key with no deadline never expires, so it is served and never refreshed.'
    ),
    starter: 'function nextAction(ttlReply, refreshWithinSeconds) {\n  \n}',
    tests: [
      { name: 'plenty of time left', expression: 'nextAction(300, 30)', expected: 'serve' },
      { name: 'inside the refresh window', expression: 'nextAction(20, 30)', expected: 'refresh' },
      { name: 'exactly at the threshold', expression: 'nextAction(30, 30)', expected: 'refresh' },
      {
        name: 'about to go, but still there',
        expression: 'nextAction(0, 30)',
        expected: 'refresh',
      },
      {
        name: 'a key with no deadline is served, never refreshed',
        expression: 'nextAction(-1, 30)',
        expected: 'serve',
      },
      { name: 'no key at all', expression: 'nextAction(-2, 30)', expected: 'populate' },
      {
        name: 'a wide window does not turn a missing key into a refresh',
        expression: 'nextAction(-2, 3600)',
        expected: 'populate',
      },
      {
        name: 'a wide window does not turn a deadline-free key into a refresh',
        expression: 'nextAction(-1, 3600)',
        expected: 'serve',
      },
    ],
    reference: [
      'function nextAction(ttlReply, refreshWithinSeconds) {',
      "  if (ttlReply === -2) return 'populate';",
      "  if (ttlReply === -1) return 'serve';",
      '',
      "  return ttlReply <= refreshWithinSeconds ? 'refresh' : 'serve';",
      '}',
    ].join('\n'),
    hints: [
      'Two of the possible replies are not durations at all. Deal with them before you compare anything.',
      '-2 is "no key", which is a miss, and a miss wants a different action from a hit that is about to expire.',
      '-1 is "no deadline", so there is nothing to refresh ahead of: serve it and stop.',
    ],
    explanation:
      'The order of the branches is the lesson. Written the natural way round, `ttlReply <= refreshWithinSeconds` is true for both sentinels, so a key that does not exist and a key that never expires both get scheduled for a background refresh, and the two actually want opposite things. Sentinels sort like numbers and are not quantities, which is why they reach code that treats them as data. What a port is for is that this translation happens once: every caller above it gets `populate`, `refresh` or `serve`, and no caller has to remember which of the two negatives it is looking at. A wrapper that passed the raw reply through would have renamed the client and moved nothing, since the same mistake stays available at every call site.',
  }),
];
