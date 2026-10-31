---
title: One thread, many connections
question: How does one Node process serve a thousand clients when it only has one thread?
order: 1
practise:
  - js-microtask-order
  - js-await-in-loop
  - node-await-does-not-yield
  - node-worker-vs-child-process
  - code-promise-pool
  - slow-list-endpoint-kysely
sources:
  - author: Apache HTTP Server
    title: Multi-Processing Modules (MPMs)
    url: https://httpd.apache.org/docs/2.4/mpm.html
  - author: Apache HTTP Server
    title: 'mpm_prefork: implements a non-threaded, pre-forking web server'
    url: https://httpd.apache.org/docs/2.4/mod/prefork.html
  - author: Apache HTTP Server
    title: 'mpm_worker: hybrid multi-processing multi-threaded web server'
    url: https://httpd.apache.org/docs/2.4/mod/worker.html
  - author: Apache HTTP Server
    title: 'mpm_event: a variant of mpm_worker'
    url: https://httpd.apache.org/docs/2.4/mod/event.html
  - author: nginx
    title: Beginner's Guide
    url: https://nginx.org/en/docs/beginners_guide.html
  - author: nginx
    title: 'Module ngx_core_module: worker_processes, worker_connections'
    url: https://nginx.org/en/docs/ngx_core_module.html
  - author: nginx
    title: 'Module ngx_http_core_module: aio'
    url: https://nginx.org/en/docs/http/ngx_http_core_module.html#aio
  - author: Node.js
    title: 'Command-line API: UV_THREADPOOL_SIZE'
    url: https://nodejs.org/api/cli.html#uv_threadpool_sizesize
  - author: libuv
    title: Thread pool work scheduling
    url: https://docs.libuv.org/en/v1.x/threadpool.html
  - author: Node.js
    title: Cluster
    url: https://nodejs.org/api/cluster.html
  - author: Node.js
    title: Worker threads
    url: https://nodejs.org/api/worker_threads.html
verified: 2026-08-01
---

A server has to keep many conversations going at once, and older designs give each one its own
process or thread. Node gives all of them a single thread that never sits waiting: a connection that
is waiting for data costs almost nothing, but there is only that one thread to compute on. One slow
calculation in one request stalls every other request in the process.

## The model

A server has to hold many conversations at once, and there are only three ways to buy that: a
process per connection, a thread per connection, or one thread that never sits still.

Apache ships all three, one per multi-processing module. `prefork` is "a non-threaded, pre-forking
web server": a parent keeps a pool of child processes, and a child serves one connection at a time.
The ceiling is memory, and the docs put the shape of it plainly, noting that sites needing to serve
more than 256 simultaneous requests may need to raise `MaxRequestWorkers`. `worker` is "a hybrid
multi-process multi-threaded server": each child spawns `ThreadsPerChild` threads and a listener
thread hands each new connection to a free one. A thread is cheaper than a process, so the number
goes up, but the unit is still one connection held by one stack.

`event` is where that assumption breaks. It gives each process a listener thread that owns every
socket nobody is actively working on, including keep-alives, so that "the worker threads are not
responsible for idle sockets, and they can be re-used to serve other requests". A connection stops
costing a thread.

nginx starts from that end of the design. "nginx has one master process and several worker
processes. The main purpose of the master process is to read and evaluate configuration, and
maintain worker processes. Worker processes do actual processing of requests." One worker handles
many connections by asking the kernel which sockets are ready and servicing those. `worker_processes
auto` gives you one per core; `worker_connections` defaults to 512 and counts every connection the
worker holds, including the ones out to your upstream servers.

Node is one worker of exactly that shape with JavaScript inside it. One thread runs your code, which
is the subject of [the event loop](/handbook/javascript/the-event-loop); here the consequence is
what matters. Waiting is free, because a waiting connection is a file descriptor and a callback
rather than a stack. Computing is not free, because there is one thread to compute on.

The part that gets skipped: an event loop still needs threads for the work the operating system has
no non-blocking version of. nginx makes this explicit and optional, compiled in with
`--with-threads` and enabled with `aio threads`, so that reads and sends are "offloaded to threads
of the specified pool" without blocking a worker process. Node ships the same idea always on, as
libuv's thread pool, whose "default size is 4". Node's docs name what uses it: all `fs` APIs except
the watchers and the explicitly synchronous ones, `dns.lookup()`, all `zlib` except the synchronous
ones, and the asynchronous crypto that is really CPU work, such as `crypto.pbkdf2()`,
`crypto.scrypt()` and `crypto.randomBytes()`. Sockets are not on that list. Network I/O is
non-blocking at the kernel, so HTTP never touches the pool.

So a Node server has two budgets, not one: a single thread for your JavaScript, and four threads for
that specific list of calls.

## Worked example

Three handlers that look equally asynchronous and are not:

```js
import { readFile } from 'node:fs/promises';
import { pbkdf2, pbkdf2Sync } from 'node:crypto';

// A pool thread reads the file. The loop is free the whole time.
app.get('/avatar/:id', async (req, res) => {
  res.end(await readFile(avatarPath(req.params.id)));
});

// Also a pool thread, but this one holds it for the full 600,000 rounds.
app.post('/login', (req, res) => {
  pbkdf2(req.body.password, salt, 600_000, 32, 'sha256', (err, key) => {
    res.end(verify(key));
  });
});

// On the loop. Every other connection in the process waits for this.
app.post('/login-sync', (req, res) => {
  res.end(verify(pbkdf2Sync(req.body.password, salt, 600_000, 32, 'sha256')));
});
```

The third one freezes the server. The second one does not, but four logins fill the pool, and the
fifth waits behind them, and so does every `readFile` from the first handler, because they draw on
the same four threads.

Using more than one core is a separate decision, and the standard library has it. `cluster` forks
child processes that share a listening socket, distributing connections round-robin by default
everywhere except Windows:

```js
import cluster from 'node:cluster';
import { availableParallelism } from 'node:os';

if (cluster.isPrimary) {
  for (let i = 0; i < availableParallelism(); i++) cluster.fork();
} else {
  createServer(handler).listen(8000);
}
```

That is nginx's `worker_processes auto` in Node's shape: several single-threaded workers behind one
port.

## Traps

**One endpoint got slow and every endpoint got slow.** Somewhere a request is doing real CPU work on
the loop: a synchronous hash, a `JSON.parse` of a huge body, a sort over forty thousand rows in
JavaScript. There is one thread, so one request's computation is every request's latency. Move it
off with `worker_threads`, which are "useful for performing CPU-intensive JavaScript operations"
and, per the same docs, "do not help much with I/O-intensive work".

**A new feature made an unrelated endpoint slower.** The new code gzips responses or reads files,
and both live on the four-thread pool alongside `dns.lookup()`. Node says what follows: "if for
whatever reason any of these APIs takes a long time, other (seemingly unrelated) APIs that run in
libuv's threadpool will experience degraded performance". `UV_THREADPOOL_SIZE` raises the limit, but
the pool is built during runtime startup, so setting it from inside the process is too late.

**The box has eight cores and the process is pinned at one.** A Node instance runs your JavaScript
in a single thread and will not spread across cores on its own. That is what `cluster`, a process
manager, or several containers behind a load balancer are for.

**The server is nearly idle and refusing connections anyway.** CPU is low, so the limit is a count
rather than a workload: worker connections, file descriptors, or a pool in front of the database.
nginx's `worker_connections` is 512 by default and includes proxied connections, and the docs point
out that the real number can never exceed the process's open-file limit. Read the limit before
adding hardware.
