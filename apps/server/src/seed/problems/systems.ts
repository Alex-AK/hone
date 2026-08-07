import { code, md, type ProblemDraft } from './types';

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
];
