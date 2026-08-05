# Stop trusting the query string

`GET /orders` is the dashboard's list endpoint. Page, page size, status, sort order and a toggle for
archived orders all arrive on the query string. Five tickets are open on it:

- Asking for five orders on page two comes back with fifty.
- A page number with a typo in it comes back empty, and comes back `200`.
- The pager on page two links to page 21.
- Turning the archived filter off leaves the archived orders in the list.
- The one query the endpoint does refuse answers `Bad Request` and nothing else, so the dashboard
  cannot say which filter to fix.

## The task

`createListOrders` in `src/server/list-orders.ts` is the endpoint. Nothing reaches `orders.list`
until it has been checked, and what reaches it is what the schema says the query meant.

**A query. Every part of it optional:**

| Parameter         | Accepts                                    | Missing means |
| ----------------- | ------------------------------------------ | ------------- |
| `page`            | a whole number, 1 or more                  | `1`           |
| `perPage`         | a whole number, 1 to 100                   | `20`          |
| `status`          | `pending`, `paid`, `shipped` or `refunded` | no filter     |
| `sort`            | `newest` or `oldest`                       | `newest`      |
| `includeArchived` | `true` or `false`                          | `false`       |

**Anything that does not fit is a `400`**, and the body says what did not fit:

```json
{
  "error": "invalid_query",
  "issues": [{ "field": "perPage", "message": "Too big: expected number to be <=100" }]
}
```

One entry per field that is wrong, not only the first one the endpoint tripped over. `field` is the
parameter's name, and `message` is a sentence the dashboard can put under the input.

**One description of a query, not two.** `listQuerySchema` is where the shape lives, and the type the
handler works with comes off it rather than sitting beside it.

**What must still be true.** A query that fits still answers `{ query, total, orders }`, where
`query` is the criteria the listing actually ran with. The dashboard draws its filter chips from it.

## Notes

- `zod` is in the workspace, and `list-orders.ts` already imports it.
- A checkpoint imports `listQuerySchema` and holds the endpoint to it, so keep the name.
- `src/server/orders.ts` is read-only. `orders.list(criteria)` does the filtering, sorting and
  paging, and `orders.listed` counts how many listings it has built, which is how a checkpoint tells
  whether a request got through.
- `req.query` is a getter in Express 5 and there is nothing to write back to it. Hand the checked
  value on instead.
- `npm`-style commands are not available here. Hit **Run checkpoints** to see where you are.

## If you finish early

- A parameter sent twice arrives as a list: `?status=paid&status=shipped` is `['paid', 'shipped']`.
  Decide whether this endpoint takes the first, takes both, or refuses it, and make the schema say
  so.
- The `400` is read by a client as well as a person. Work out what a form needs to highlight a field
  whose label it owns, and whether a machine-readable `code` belongs next to `message`.
- The same schema would run in the browser before the request is sent. Work out what that saves, and
  what the server still has to do afterwards.
