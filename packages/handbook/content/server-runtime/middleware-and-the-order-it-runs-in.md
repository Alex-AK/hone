---
title: Middleware and the order it runs in
question: My middleware is registered and it never runs. Where in the file does it have to go?
order: 9
practise:
  - security-limiter-after-routes
  - http-webhook-raw-body
  - http-read-finish-middleware
  - rate-limit-express
sources:
  - author: Express
    title: Writing middleware for use in Express apps
    url: https://expressjs.com/en/guide/writing-middleware/
  - author: Express
    title: Using Express middleware
    url: https://expressjs.com/en/guide/using-middleware/
  - author: Express
    title: Error handling
    url: https://expressjs.com/en/guide/error-handling/
  - author: NestJS
    title: Middleware
    url: https://docs.nestjs.com/middleware
  - author: Node.js
    title: 'HTTP: Class http.ServerResponse'
    url: https://nodejs.org/api/http.html#class-httpserverresponse
verified: 2026-08-02
---

## The model

A middleware is a function holding three things: the request, the response, and a handle on
everything that has not run yet. Express names all three. Middleware functions "have access to the
request object (req), the response object (res), and the next function in the application's
request-response cycle", and what they can do with them is "execute any code", "make changes to the
request and the response objects", "end the request-response cycle" and "call the next middleware in
the stack".

Boiled down, each one makes exactly one of three moves.

- **Pass control on.** Call `next()`, which "when invoked, executes the middleware succeeding the
  current middleware".
- **Short-circuit.** Answer the request and do not call `next()`. Nothing below you ever runs, for
  this request.
- **Neither**, which is not a move but the bug you get for free. Express: "If the current middleware
  function does not end the request-response cycle, it must call `next()` to pass control to the
  next middleware function. Otherwise, the request will be left hanging."

The stack is the file. Express states it in one sentence, and it is most of what goes wrong: "The
order of middleware loading is important: middleware functions that are loaded first are also
executed first." Registration reads like configuration and behaves like control flow.

```
app.use(a)   a ──next()──> b ──next()──> route handler ──res.send()──> response
app.use(b)                                    │
app.use(c)                          c never runs: nobody called next()
app.use(err)                        err runs only on next(someError)
```

Nest is the same model in different syntax. Its docs say middleware "is a function which is called
**before** the route handler", and that "Nest middleware are, by default, equivalent to express
middleware". What moves is where the order is written: a `configure(consumer)` method rather than a
run of `app.use()` calls. [The life of a request](./the-life-of-a-request.md) covers how Nest stacks
its own layers on top of this one.

**Errors run in a second chain laid over the same list.** Express picks error handlers out by arity:
they take "four arguments instead of three, specifically with the signature `(err, req, res,
next)`", and "you must provide four arguments to identify it as an error-handling middleware
function". Passing anything to `next()` switches chains: Express then "regards the current request
as being an error and will skip any remaining non-error handling routing and middleware functions".
A request moves from the normal chain to the error chain and never back, which is why you "define
error-handling middleware last, after other `app.use()` and routes calls". One case needs care in
your own handler: if the error arrives after the response started, Express's default handler "closes
the connection and fails the request", so check `res.headersSent` and delegate rather than trying to
send a second response.

**"After the response" is not "after `next()` returned".** `next()` returns when the layers below it
hand control back, which is a different moment. Running an Express 5 app with a middleware that logs
on both sides of `next()`:

```
=== /sync ===                      === /async ===
A: before next()                   A: before next()
handler: sync send                 A: after next() returned
A: after next() returned           handler: async send (30ms later)
A: res 'finish'                    A: res 'finish'
```

Against an async handler, the line after `next()` runs before the handler has even answered. The
moment you actually wanted has its own event. Node fires `'finish'` on the response "when the
response has been sent", and is careful about what that does not mean: "It does not imply that the
client has received anything yet." Its sibling `'close'` "indicates that the response is completed,
or its underlying connection was terminated prematurely", so a client that hung up mid-download
gives you `'close'` without `'finish'`.

That is the shape of the whole layer. Express middleware runs before, or observes after through an
event. It cannot sit around the handler and transform what comes back, which is the gap Nest fills
with interceptors.

## Worked example

An ordinary registration block, where every line is placed rather than added:

```js
const app = express();

app.use(requestTimer); // Every request, including the ones no route matches.
app.use(helmet()); // Headers on, before anything downstream can respond.
app.use('/webhooks', express.raw({ type: 'application/json' }), webhookRoutes);
app.use(express.json()); // Everything below this line gets a parsed body.
app.use(rateLimit({ windowMs: 60_000, max: 5 }));
app.use('/api', apiRoutes); // Most requests are answered here and stop.
app.use(errorHandler); // Four arguments, so it only ever sees next(err).
```

Move `rateLimit` one line down and it stops protecting `/api`, because `apiRoutes` answers and never
calls `next()`. Move `express.json()` above the webhook mount and the raw body is gone before the
signature check can read it. Neither edit looks like a behaviour change in review.

The timer is the piece that has to reach past the end of the chain:

```js
function requestTimer(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    logger.info({ method: req.method, path: req.path, status: res.statusCode, ms });
  });

  next();
}
```

The handler registered on `'finish'` is the only part that runs late. Everything else in the function
runs first, which is what makes this the right place to start a clock and the wrong place to read
one.

And the error handler, which never runs unless somebody hands it an error:

```js
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  logger.error({ err, path: req.path });
  res.status(err.status ?? 500).json({ error: 'Internal Server Error' });
}
```

## Traps

**Ten thousand login attempts and the limiter refused none of them.** It sits below the router that
answers `/api/login`, and that handler sends a response instead of calling `next()`. The limiter is
not dead code: it runs for every request no route matched, which is the 404 traffic you had no
reason to limit. A limiter has to be above what it protects.

**The webhook signature never matches, and the payload logs perfectly.** A body parser above the
route consumed the stream, so the handler holds a parsed object rather than the bytes the sender
signed. Running `JSON.stringify` over that object to get them back produces different bytes, and the
HMAC is over bytes. Mount a raw parser on that path above the JSON one, which is the only reason
line 3 of the example sits where it does.

**A 500 page nobody on the team wrote, sometimes with a stack trace on it.** The error handler was
declared with three arguments, so Express never recognised it and its own built-in handler answered
instead. That one is "added at the end of the middleware function stack", and its body "will be the
HTML of the status code message when in production environment, otherwise will be `err.stack`". Take
the fourth argument even when you ignore it.

**The timing log says 2ms for a request that took 900ms.** The clock was read on the line after
`next()`, which returned as soon as the async handler awaited something. Read it in a `'finish'`
listener instead, and remember what `'finish'` promises: the bytes went to the operating system, not
that anybody received them.
