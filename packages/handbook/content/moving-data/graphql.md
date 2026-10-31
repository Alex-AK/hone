---
title: GraphQL
question: The screen needs eleven things. Does GraphQL fix that, or just move it somewhere I cannot see?
order: 5
practise:
  - http-post-json
  - http-pagination-cursor
  - help-board-graphql
  - slow-list-endpoint-kysely
  - orders-report-typeorm
sources:
  - author: GraphQL Foundation
    title: 'Best Practices: Serving over HTTP'
    url: https://graphql.org/learn/serving-over-http/
  - author: GraphQL Foundation
    title: 'Best Practices: Performance'
    url: https://graphql.org/learn/performance/
  - author: GraphQL Foundation
    title: 'Best Practices: Caching'
    url: https://graphql.org/learn/caching/
  - author: GraphQL Foundation
    title: DataLoader
    url: https://github.com/graphql/dataloader
  - author: IETF
    title: 'RFC 9110: HTTP Semantics'
    url: https://www.rfc-editor.org/rfc/rfc9110.html
verified: 2026-08-01
---

With GraphQL, a screen asks for everything it needs in one request, naming exactly the fields it
wants. That removes the slow chain of small requests the browser used to make, but the work does not
disappear. It moves to the server, where one request can quietly turn into a flood of database
queries, and to caching, which stops working the way it used to.

## The model

The client sends one document naming exactly the fields it wants, the server walks that document
field by field, and the response comes back with the same shape. The eleven round trips become one,
and nothing arrives that nobody asked for.

The transport is not part of the language. graphql.org: "The GraphQL specification doesn't require
particular client-server protocols when sending API requests and responses, but HTTP is the most
common choice because of its ubiquity." Over HTTP it is one endpoint, usually `/graphql`; a server
"must handle the HTTP POST method for query and mutation operations, and may also accept the GET
method for query operations".

That single endpoint is where the bill arrives, in two places.

**On the server, the round trips come back as queries.** Every field gets its own resolver, which is
the design: graphql.org describes it as "every field on every type has a focused single-purpose
function for resolving that value". A resolver only knows about its own field, so a list of twenty
orders whose customer name you asked for runs one query for the orders and one for each customer.
graphql.org names this the N+1 problem and names the answer, "a batching technique, where multiple
requests for data from a backend are collected over a short period and then dispatched in a single
request". The over-fetching did not go away. It moved off the network and into the database, where
nobody is watching a waterfall.

**On the cache, the URL stopped meaning anything.** In an endpoint API the URL is a globally unique
key and every cache in the path already knows how to use it. graphql.org puts the loss plainly: "In
GraphQL, there's no URL-like primitive that provides this globally unique identifier for a given
object." Worse, POST responses are barely cacheable at all. RFC 9110: "Responses to POST requests are
only cacheable when they include explicit freshness information... and a Content-Location header
field that has the same value as the POST's target URI." So the browser cache, the CDN and the
reverse proxy all stop contributing, and you rebuild what they were doing: GET for queries where the
document is short enough for a URL, persisted documents where it is not, and a normalised client
cache keyed on an `id` field the schema promises is globally unique.

## Worked example

One request for a screen that used to take twenty-one:

```graphql
query OrdersScreen {
  orders(status: PENDING, first: 20) {
    id
    total
    customer {
      name
    }
  }
}
```

The obvious resolvers, and the twenty-one queries hiding in them:

```js
const resolvers = {
  Query: {
    orders: (_parent, args) => db.orders.findPending(args.first),
  },
  Order: {
    // Runs once per order. Twenty orders on the page, twenty round trips here.
    customer: (order) => db.customers.findById(order.customerId),
  },
};
```

A loader collects the ids requested during one tick and fetches them together. DataLoader "will
coalesce all individual loads which occur within a single frame of execution (a single tick of the
event loop) and then call your batch function with all requested keys":

```js
function createLoaders(db) {
  return {
    customers: new DataLoader(async (ids) => {
      const rows = await db.customers.findByIds(ids);
      const byId = new Map(rows.map((row) => [row.id, row]));
      // One value per key, in key order. A missing row is an explicit null.
      return ids.map((id) => byId.get(id) ?? null);
    }),
  };
}

const resolvers = {
  Order: {
    customer: (order, _args, context) => context.loaders.customers.load(order.customerId),
  },
};
```

Two queries now, whatever the page size. Note where the loaders are made: `createLoaders` runs per
request, because a loader caches as well as batches, and DataLoader's own guidance is to "avoid
multiple requests from different users using the DataLoader instance, which could result in cached
data incorrectly appearing in each request".

## Traps

**One request in the network tab, four hundred queries in the database log.** This is the N+1, and
the network tab is exactly why it survives so long: the client-side symptom you used to get, a
waterfall of small requests, is the thing GraphQL removed. Count statements per request on the
server instead, and count them twice at different page sizes. If the number moves with the page
size, a resolver is looping.

**The CDN and the browser cache stopped doing anything after the migration.** Everything is now one
POST to one URL, and neither half of that is cacheable by default. Switching query operations to GET
brings HTTP caching back, at the cost of a URL length limit that a real document will exceed, which
is what persisted or trusted documents solve by sending a hash instead of the query text.

**The wrong customer's name against an order, or a null where a row exists.** The batch function
returned rows in whatever order the database felt like. DataLoader's contract is strict: "The Array
of values must be the same length as the Array of keys. Each index in the Array of values must
correspond to the same index in the Array of keys." A `WHERE id IN (...)` does not promise that, so
map the results back onto the keys yourself and return an explicit null for the ones that are
missing.

**One client query took the database down.** In an endpoint API the endpoint bounded the work; here
the client writes the shape and can nest it as deep as the schema allows. graphql.org treats this as
a first-class concern, noting "it may be possible for clients to request highly complex operations
that place excessive load on the underlying data sources during execution", whether by accident or
not. Paginate every list field, cap operation depth and breadth, and score complexity before
executing rather than after.
