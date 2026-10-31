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

A web framework is the library that turns an incoming HTTP request into a call to your code, and
what your code returns into a response. Frameworks differ less in what they can do than in how much
of that work they do without being asked. The more they do for you, the less of it you can see, and
the part you cannot see is where the surprises come from.

## The model

**What changes between frameworks is not what is possible but how much of the route you write down,
and so how much is happening that you did not write.** One route, three frameworks: `POST /reports`
takes JSON, creates a report, answers 201.

**Express hands you the request and gets out of the way.** Its own docs call it a routing and
middleware framework with minimal functionality of its own: an Express app is essentially a series
of middleware function calls. The body is not parsed until you mount `express.json()`, which parses
only JSON and only looks at requests whose `Content-Type` matches its `type` option. The status is
whatever you pass `res.status()`. The response is whatever you pass `res.json()`, which runs it
through `JSON.stringify()`. Almost nothing is hidden because almost nothing is supplied. Every step
is in front of you, including the ones you forgot.

**Nest declares the structure and leaves the meaning to you.** `@Controller('reports')` and
`@Post()` say where the handler lives. The status is decided for you, 200 by default and 201 for
POST, and changed with `@HttpCode()`. A returned object or array is serialised to JSON for you. What
is still yours is whether the body is any good. `ValidationPipe` is exported from `@nestjs/common`,
but it needs `class-validator` and `class-transformer` installed and it needs binding, and until it
is bound the decorators on your DTO are inert. That DTO has to be a class rather than an interface,
because the Nest docs point out that classes survive into the compiled JavaScript as real entities,
and a pipe has to read something at runtime.

**FastAPI declares the data and derives the rest from it.** A Pydantic model as a parameter
annotation is the entire declaration. From it, FastAPI reads the body as JSON, converts the types
where needed, validates the data, and generates JSON Schema for the model, which feeds the OpenAPI
schema and the interactive docs. Invalid data never reaches your function: FastAPI raises a
`RequestValidationError` internally, and 422 Validation Error is the response its generated schema
carries for it. The return annotation runs the same machinery outward, limiting and filtering the
output to what the return type defines. Status is the one thing not derived: the default is 200, and
`status_code=201` goes on the decorator, not on the function.

| Step             | Express                            | Nest                                  | FastAPI                            |
| ---------------- | ---------------------------------- | ------------------------------------- | ---------------------------------- |
| The route        | `app.post('/reports', handler)`    | `@Post()` in `@Controller('reports')` | `@app.post("/reports")`            |
| Reading the body | `express.json()`, mounted by you   | `@Body()` onto a DTO class            | a Pydantic model annotation        |
| Validating it    | yours to write                     | `ValidationPipe`, bound by you        | the same annotation, no extra step |
| Success status   | `res.status(201)`, always explicit | 201 for POST, 200 otherwise           | 200, or `status_code=201`          |
| The response     | `res.json(value)`                  | returned objects serialised for you   | the return annotation, filtered    |

Each one sets the trade between help and visibility differently. Express reminds you of nothing and
surprises you with nothing. FastAPI derives the most, so it fails in places you never wrote, and
reading its failures means knowing what the annotations generate. Nest is the one that catches
people out, because the structure looks like it implies the checking and it does not.

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
decorators. FastAPI: the two annotations, which are also the type declarations you would have
written anyway. Then add a field to the report. In the third one, the request schema, the response
filter and the published API documentation all move with the model. In the first one, nothing moves
until someone moves it.

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
and they say that crashes the process on current Node.js versions. Express 5 changed it: a handler
that returns a promise calls `next(value)` for you when it rejects or throws. Which major version
you are on decides whether the `try`/`catch` around every `await` is redundant or is the only thing
keeping the server up.
