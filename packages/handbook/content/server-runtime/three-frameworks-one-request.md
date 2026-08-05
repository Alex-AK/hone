---
title: Three frameworks, one request
question: Express, Nest or FastAPI, which parts of the route is each one writing for me?
order: 10
practise:
  - jwt-auth-express
  - auth-guard-nestjs
  - http-webhook-raw-body
  - http-status-created
  - http-status-choice-validation
sources:
  - author: Express
    title: Using middleware
    url: https://expressjs.com/en/guide/using-middleware/
  - author: Express
    title: express.json()
    url: https://expressjs.com/en/5x/api/express/
  - author: Express
    title: Response object
    url: https://expressjs.com/en/5x/api/response/
  - author: Express
    title: Error handling
    url: https://expressjs.com/en/guide/error-handling/
  - author: Express
    title: Error handling (4.x)
    url: https://expressjs.com/en/4x/guide/error-handling/
  - author: NestJS
    title: Controllers
    url: https://docs.nestjs.com/controllers
  - author: NestJS
    title: Validation
    url: https://docs.nestjs.com/techniques/validation
  - author: FastAPI
    title: Request Body
    url: https://fastapi.tiangolo.com/tutorial/body/
  - author: FastAPI
    title: Response Model - Return Type
    url: https://fastapi.tiangolo.com/tutorial/response-model/
  - author: FastAPI
    title: Response Status Code
    url: https://fastapi.tiangolo.com/tutorial/response-status-code/
  - author: FastAPI
    title: Handling Errors
    url: https://fastapi.tiangolo.com/tutorial/handling-errors/
verified: 2026-08-02
---

## The model

One route, three frameworks: `POST /reports` takes JSON, creates a report, answers 201. What changes
between them is not what is possible. It is how much of that sentence you write down, and therefore
how much is happening that you did not write.

**Express hands you the request and gets out of the way.** Its own docs describe it as "a routing and
middleware web framework with minimal functionality of its own: an Express application is essentially
a series of middleware function calls executed during the request-response cycle". The body is not
parsed until you mount `express.json()`, which "only parses JSON and only looks at requests where the
`Content-Type` header matches the `type` option". The status is whatever you pass `res.status()`. The
response is whatever you pass `res.json()`, which sends "the parameter converted to a JSON string
using `JSON.stringify()`". Almost nothing is hidden because almost nothing is supplied. The whole
route is in front of you, including every step you forgot.

**Nest declares the structure and leaves the meaning to you.** `@Controller('reports')` and `@Post()`
say where the handler lives; the status is decided for you, "always 200 by default, except for POST
requests which use 201", and changed with `@HttpCode()`; a returned object or array "will
automatically be serialized to JSON". What is still yours is whether the body is any good.
`ValidationPipe` is exported from `@nestjs/common`, but it needs `class-validator` and
`class-transformer` installed and it needs binding, and until it is bound the decorators on your DTO
are inert. That DTO has to be a class rather than an interface, because "Classes are part of the
JavaScript ES6 standard, so they remain intact as real entities in the compiled JavaScript" and a
pipe has to read something at runtime.

**FastAPI declares the data and derives the rest from it.** A Pydantic model as a parameter
annotation is the entire declaration. From it, FastAPI will "Read the body of the request as JSON",
"Convert the corresponding types (if needed)", "Validate the data", and "Generate JSON Schema
definitions for your model, which are part of the OpenAPI schema" and so of the interactive docs.
Invalid data never reaches your function: FastAPI "internally raises a `RequestValidationError`", and
422 Validation Error is the response its generated schema carries for it. The return annotation runs
the same machinery outward and "will limit and filter the output data to what is defined in the
return type". Status is the one thing not derived: the default is 200, and `status_code=201` goes on
the decorator, not on the function.

| Step             | Express                            | Nest                                  | FastAPI                            |
| ---------------- | ---------------------------------- | ------------------------------------- | ---------------------------------- |
| The route        | `app.post('/reports', handler)`    | `@Post()` in `@Controller('reports')` | `@app.post("/reports")`            |
| Reading the body | `express.json()`, mounted by you   | `@Body()` onto a DTO class            | a Pydantic model annotation        |
| Validating it    | yours to write                     | `ValidationPipe`, bound by you        | the same annotation, no extra step |
| Success status   | `res.status(201)`, always explicit | 201 for POST, 200 otherwise           | 200, or `status_code=201`          |
| The response     | `res.json(value)`                  | returned objects serialised for you   | the return annotation, filtered    |

The trade is identical in all three, only priced differently: what a framework does for you is what
you stop being able to see. Express reminds you of nothing and surprises you with nothing. FastAPI
derives the most, so it fails in places you never wrote, and reading its failures means knowing what
the annotations generate. Nest is the one that catches people out, because the structure looks like
it implies the checking and it does not.

## Worked example

The same route three times. Express first, in the shape the
[jwt-auth-express](/workouts/jwt-auth-express) workout uses:

```js
const app = express();
app.use(express.json()); // Without this, req.body is undefined.

app.post('/reports', (req, res) => {
  const { title } = req.body ?? {};
  if (typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }

  const report = reports.create({ title: title.trim() });
  res.status(201).json(report);
});
```

Nest, in the shape [auth-guard-nestjs](/workouts/auth-guard-nestjs) uses:

```ts
class CreateReportDto {
  @IsString()
  @IsNotEmpty()
  title!: string;
}

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post() // 201, because it is a POST
  create(@Body() body: CreateReportDto): Report {
    return this.reports.create(body); // Serialised to JSON for you.
  }
}
```

Those two decorators on `title` do nothing on their own. Somewhere in `main.ts` there has to be an
`app.useGlobalPipes(new ValidationPipe())`, or the equivalent binding on the controller, and a body
with no `title` reaches `create` unchecked until there is.

FastAPI, which is here to read rather than to run: nothing in this project executes Python.

```python
class CreateReport(BaseModel):
    title: str

@app.post("/reports", status_code=201)
def create_report(body: CreateReport) -> Report:
    return reports.create(body)
```

Count the lines that are about HTTP rather than about reports. Express: most of them. Nest: the
decorators. FastAPI: the two annotations, which are also the type declarations you would have written
anyway. Then count what happens if a field is added to the report. In the third one, the request
schema, the response filter and the published API documentation all move with the model. In the first
one, nothing moves until someone moves it.

## Traps

**`req.body` is undefined and the client definitely sent a body.** Express parses nothing by default,
so either `express.json()` was never mounted or the request did not match it. The docs give the three
causes in one sentence: `req.body` is undefined "if there was no body to parse, the `Content-Type`
was not matched, or an error occurred". A client sending `text/plain` hits the middle one and looks
identical to the first.

**The webhook signature never matches, and the payload logs perfectly.** Same middleware, opposite
problem: `express.json()` consumed the raw bytes and gave you an object, and `JSON.stringify` of that
object is not the byte sequence the sender signed. Key ordering, whitespace and number formatting are
all free to differ. The route that verifies a signature needs the raw body kept for it.

**A POST that only queues a job answers 201 Created.** Nest picks the status from the HTTP method,
not from what happened: 201 for POST and 200 for everything else. Nothing was created, so `@HttpCode`
on that handler is what makes the answer honest.

**The same malformed body gets 400 from one service and 422 from another.** Nest's `ValidationPipe`
answers a failed payload with 400 Bad Request; FastAPI's validation error is a 422. Neither is wrong,
and a client written against one will misread the other. Pick the status at the API boundary and
override the default that disagrees with it.

**An async handler rejects and the process exits.** Express 4, and its docs are explicit: "Errors
from rejected promises are not passed to `next` automatically, and this includes `async` functions",
which "crashes the process on current Node.js versions". Express 5 changed it, so handlers "that
return a Promise call `next(value)` automatically when they reject or throw an error". Which major
version you are on decides whether the `try`/`catch` around every `await` is redundant or is the only
thing keeping the server up.
