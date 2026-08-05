---
title: The life of a request in a framework
question: What runs before my controller method, and where does the check I keep forgetting belong?
order: 5
practise:
  - auth-guard-nestjs
  - http-401-vs-403
  - jwt-auth-express
  - rate-limit-express
sources:
  - author: NestJS
    title: Request lifecycle
    url: https://docs.nestjs.com/faq/request-lifecycle
  - author: NestJS
    title: Guards
    url: https://docs.nestjs.com/guards
  - author: NestJS
    title: Middleware
    url: https://docs.nestjs.com/middleware
  - author: NestJS
    title: Pipes
    url: https://docs.nestjs.com/pipes
  - author: IETF
    title: 'RFC 9110: HTTP Semantics, client error 4xx'
    url: https://www.rfc-editor.org/rfc/rfc9110.html#section-15.5
verified: 2026-08-01
---

## The model

A framework's real product is an itinerary. Every request takes the same path through the same
layers in the same order, so new code joins a layer instead of inventing a place to live. Nest
publishes that order, and it is worth knowing by heart:

1. Middleware, globally bound then module bound.
2. Guards: global, then controller, then route.
3. Interceptors on the way in: global, controller, route.
4. Pipes: global, controller, route, then the route's parameters.
5. The controller method.
6. The service.
7. Interceptors on the way out, resolving route to controller to global.
8. Exception filters, which alone resolve "from the lowest level possible", route first.
9. The response.

Each layer is defined by what it can see, and that is what tells you where a check belongs.

Middleware runs first and knows the least. Nest's own docs are blunt about it: "middleware, by its
nature, is dumb. It doesn't know which handler will be executed after calling the `next()`
function." That makes it right for work that does not depend on the route, like parsing a token onto
the request or counting hits for a rate limiter.

A guard is the first thing that knows where the request is going. It receives an `ExecutionContext`
and so knows "exactly what's going to be executed next", which is why authorization lives here.
Guards run "after all middleware, but before any interceptor or pipe", and `canActivate` returning
false stops the request before the handler is ever called.

Pipes are last before the handler and operate on values, so validation and coercion belong to them:
by the time your method runs, the id is a number and the body has been checked.

Then the three layers you write. The controller owns the HTTP shape, and nothing else: read
parameters, return a value, choose a status. The service owns the rule. The repository owns the
query. That split is what makes the rule testable without a request and the query replaceable
without touching the rule.

## Worked example

From the [auth-guard-nestjs](/workouts/auth-guard-nestjs) workout, whose whole subject is where a
check belongs. The guard answers one question for the entire controller:

```ts
@Injectable()
export class OwnerGuard implements CanActivate {
  constructor(private readonly reports: ReportsService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<IncomingRequest>();

    const user = request.headers['x-user'];
    if (typeof user !== 'string' || !user.trim()) throw new UnauthorizedException();

    const id = request.params.id;
    if (id === undefined) return true; // No id in the route: nothing to own yet.

    const report = this.reports.findById(Number(id));
    if (!report) return true; // "No such report" is the handler's answer, not the guard's.

    if (report.ownerId !== user) throw new ForbiddenException();
    return true;
  }
}
```

And it is attached to the class, not to the routes:

```ts
@Controller('reports')
@UseGuards(OwnerGuard)
export class ReportsController {
  @Get() list(@Headers('x-user') user: string) { ... }
  @Get(':id') get(@Param('id') id: string) { ... }
  @Get(':id/export') export(@Param('id') id: string) { ... }
  @Delete(':id') remove(@Param('id') id: string) { ... }
}
```

Four routes, one check, and the fifth route is covered on the day someone writes it. Note the order
inside `canActivate` too: identity is settled before anything is looked up, so an anonymous caller
gets 401 without learning whether the id exists.

## Traps

**A 403 that has already deleted the row.** The check was inside the handler, after the work. The
status was right and the damage was done. A guard runs before the handler, which is the difference
between refusing an action and reporting on one.

**Four correct copies of the same `if`, and a fifth route with none.** This is the failure the
workout is built around, and it never shows up as a bug in existing code, because the existing code
is fine. `@UseGuards()` on the controller covers every handler on it, including the ones nobody has
written yet. That is the only version of the check that stays true.

**401 and 403 the wrong way round.** 401 means the server does not know who you are; 403 means it
knows and the answer is no. Nest throws `ForbiddenException` automatically when a guard returns
false, so an unauthenticated caller can end up with 403 by default. If you also return 404 for ids
that do not exist, the difference between 403 and 404 tells a stranger which ids are real. Answer
401 first, before any lookup.

**Authorization written as middleware, which then has to re-parse the URL.** The symptom is a regex
over `req.path` to work out what is being asked for. That information already exists one layer down:
middleware cannot see the handler, a guard can. Keep authentication in middleware if you like, but
the "may this user touch this thing" question wants the layer that knows what the thing is.
