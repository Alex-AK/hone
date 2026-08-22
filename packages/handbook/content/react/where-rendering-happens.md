---
title: Where rendering happens
question: React says the server HTML did not match. What ran twice, and why do the two disagree?
order: 9
practise:
  - react-hydration-mismatch-cost
  - react-suppress-hydration-warning
  - react-typeof-window-guard
  - react-unnecessary-effect
  - dates-format-locale
  - dates-relative-time
  - html-time-datetime
sources:
  - author: React
    title: hydrateRoot
    url: https://react.dev/reference/react-dom/client/hydrateRoot
  - author: React
    title: renderToString
    url: https://react.dev/reference/react-dom/server/renderToString
  - author: React
    title: useId
    url: https://react.dev/reference/react/useId
  - author: React
    title: useLayoutEffect
    url: https://react.dev/reference/react/useLayoutEffect
  - author: React
    title: useSyncExternalStore
    url: https://react.dev/reference/react/useSyncExternalStore
  - author: React
    title: Server Components
    url: https://react.dev/reference/rsc/server-components
  - author: Next.js
    title: Text content does not match server-rendered HTML
    url: https://nextjs.org/docs/messages/react-hydration-error
verified: 2026-08-19
---

Behaviour here was run against React 19.2.8 on Node 24.16.0, with the two passes in separate
processes so the server one genuinely has no DOM.

## The model

[What a render actually is](./what-a-render-is.md) covers one machine's worth of this. Server
rendering runs that same step somewhere else first, and then has to make the browser agree with what
came back.

**The server pass** happens wherever your server runs, with no DOM. `renderToString`, or the
streaming version a framework calls for you, runs your components, walks the tree they return and
produces a string. Rendering is all that happens. No effects, no cleanups, no refs pointing at
anything, no layout, no event handlers. react.dev is flat about it: effects "only run on the client.
They don't run during server rendering."

**The client pass** does not build the DOM. `hydrateRoot` "will attach to the HTML that exists inside
the `domNode`, and take over managing the DOM inside it": it renders your components again, walks the
nodes that are already on the page and claims each one, attaching handlers and building the state it
will need. The first render in the browser is a comparison, not a construction.

One contract holds the two together, and everything below follows from it. From the `useId` docs:
"For hydration to work, the client output must match the server HTML."

```
  server, no DOM                          browser
  ──────────────                          ───────
  render the tree
        |
  an HTML string ───────wire───────>  parse and paint
                                            |
                                      the bundle arrives
                                            |
                                      render the tree again
                                            |
                                      compare against the nodes already there
                                            |
                              agrees ───────┴─────── disagrees
                                 |                       |
                          adopt the nodes,        discard the nodes and
                          attach handlers         build them from scratch
                                 |
                            effects run  <- the first thing to run that is not a render
```

Three things make the two disagree, and they are one thing wearing three hats: a render read
something the other runtime cannot see.

- **The environment.** The zone and locale the process is set to, the viewport, `navigator`,
  `localStorage`, a cookie the server was never sent. Reaching for `window` at all is a
  `ReferenceError` rather than a mismatch, and the guard people reach for is a trap of its own below.
- **The clock and the dice.** `Date.now()`, `new Date()`, `Math.random()`, an id off a module-level
  counter, a relative timestamp that reads "3 minutes ago" on one side and "4 minutes ago" on the
  other. The two passes happen seconds apart on different machines, so anything derived from those
  differs by construction.
- **The data.** The server had a row the client has not fetched, or the client read a store the
  server rendered empty. React's error message lists it as "External changing data without sending a
  snapshot of it along with the HTML".

So the rule under every fix: **a value the two passes cannot both work out has to travel with the
HTML, or wait until after hydration.** Sending it is what `getServerSnapshot` is for, and the
`useSyncExternalStore` docs give the mechanism, "emit a `<script>` tag during server rendering that
sets a global like `window.MY_STORE_DATA`, and read from that global on the client in
`getServerSnapshot`". Waiting means a second render after mount, which costs a visible flash of the
server's version.

Ids are the one case React solved outright. `useId` "is generated from the parent path of the calling
component", so the same tree yields the same id on both sides without a counter that depends on
render order. Measured here, a `Math.random()` id mismatches and a `useId` one does not.

**Server Components move this seam rather than removing it.** They "render ahead of time, before
bundling, in an environment separate from your client app or SSR server" and are "not sent to the
browser", so their output is never hydrated and none of what follows applies to them. What is left is
the `"use client"` boundary, and below it you still have two passes and the same contract.

## Worked example

A timestamp on a comment. The server runs in a container set to UTC, the reader's browser is in New
York, and the locale is pinned so only the zone moves:

```jsx
function PostedAt({ at }) {
  return <p>Updated {new Date(at).toLocaleString('en-GB')}</p>;
}
```

The same instant, the same locale, two processes:

```
TZ=UTC               <p>Updated 19/02/2026, 11:20:00</p>
TZ=America/New_York  <p>Updated 19/02/2026, 06:20:00</p>
```

Hydrating the first with the second, a development build reports:

```
Hydration failed because the server rendered text didn't match the client.
As a result this tree will be regenerated on the client.
```

"This tree" is not the `<p>`. Rendering `<div><header/><section><p/></section><footer/></div>` and
mismatching only the text inside the `<p>`:

```
                                             DOM nodes kept    rebuilt
text mismatch, no Suspense boundary               none         all five
the same, with <Suspense> around <section>   div, header,      section, p
                                             footer
attribute-only mismatch                      all five          none
```

A boundary is what bounds the damage, and an attribute mismatch is a different failure with a
different bill. Both are below.

Three fixes for the timestamp, and they are not interchangeable:

```jsx
// 1. Decide the zone on the server and send the finished string.
return <p>Updated {formatted}</p>;

// 2. Render something zone-free, and correct it after mount.
const [local, setLocal] = useState(null);
useEffect(() => setLocal(new Date(at).toLocaleString('en-GB')), [at]);
return <p>Updated {local ?? at}</p>;

// 3. Tell React not to look.
return (
  <time dateTime={at} suppressHydrationWarning>
    {new Date(at).toLocaleString('en-GB')}
  </time>
);
```

The first needs the reader's zone, which a request does not carry, so it means a cookie or a stored
preference. The second costs a second render and a flash. The third does less than it looks like:
measured, it reports nothing and keeps every node, and the text left on screen is the **server's**
11:20, still there after a later re-render of the same component. It silences the report, it does not
localise anything. `<time dateTime>` is what keeps the machine-readable value right whatever the text
says. React's note on `suppressHydrationWarning`: "This only works one level deep, and is intended to
be an escape hatch. Don't overuse it."

## Traps

**The class is wrong in the DOM and nothing anywhere says so.** An attribute mismatch is not
repaired. Measured on a `<nav>` whose `className` came out `nav-narrow` from the server and
`nav-wide` from the client: the DOM keeps `nav-narrow`, React's tree believes `nav-wide`, and a later
state change that rewrote the text inside that same element left the class alone. A development build
logs one line, "A tree hydrated but some attributes of the server rendered HTML didn't match the
client properties. This won't be patched up." A production build logs nothing at all. The docs give
the reason rather than apologising for it: "There are no guarantees that attribute differences will be
patched up in case of mismatches. This is important for performance reasons because in most apps,
mismatches are rare, and so validating all markup would be prohibitively expensive." The loud failure
is the cheap one to find; this is the one that ships.

**One wrong word threw away the whole page.** A text mismatch regenerates every node up to the
nearest `<Suspense>` boundary, or the root when there is none, so the server render bought nothing
for that region and whatever the DOM was holding goes with it: focus, an uncontrolled input's value,
scroll position inside a nested scroller, media that was playing. A production build reports it as
`Minified React error #418` and names no element. The docs are blunt about the range, "In the best
case, they'll lead to a slowdown; in the worst case, event handlers can get attached to the wrong
elements." Boundaries are the lever. Put one around the region that legitimately differs and the rest
of the page keeps its nodes.

**`typeof window` fixed the crash and shipped the bug.** Touching `window` during the server pass
throws `ReferenceError: window is not defined` out of `renderToString`, and the reflex is to guard it
with `typeof window !== 'undefined'`. That guard is false on the server and true in the browser,
which is the definition of a mismatch, and it is the first cause React's own error message lists: "A
server/client branch `if (typeof window !== 'undefined')`". It converts a crash you get on every
request into a mismatch you get in somebody else's browser. The two honest fixes are a second pass,
an `isClient` state set in an effect, which hydrates clean and then flips, or marking the subtree
client-only so the server renders a fallback for it.

**Server rendering shipped a spinner.** A component that fetches in
[an effect](./effects-and-cleanup.md) renders its loading state during the server pass, because
effects do not run there. Measured: the HTML is `<p>Loading…</p>`, hydration reports nothing because
both passes agree on it, and the client then discards that node and fetches. Nothing is broken, which
is why it survives review, but the server cost was paid and the reader got a shell. Suspense does not
rescue `renderToString`, which "does not support streaming or waiting for data" and emits the nearest
fallback for anything that suspends. The double fetch is the same seam from the other side: a
framework that does load data during the server pass and does not serialise the result into the HTML
makes the client fetch it again on mount, and the request log is the only place that shows up.
