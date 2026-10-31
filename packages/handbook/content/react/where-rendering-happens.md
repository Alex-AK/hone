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

A server-rendered React page is rendered twice: once on the server, to send finished HTML, and again
in the browser, which takes over the page it was sent. The two have to match. When they do not,
React either throws away part of the page and rebuilds it, or quietly leaves the wrong thing on
screen.

## The model

Server rendering runs your components twice, on two machines, and the browser's pass only works if
it produces what the server's did. [What a render actually is](./what-a-render-is.md) covers one
pass.

**The server pass** happens with no DOM. `renderToString`, or the streaming version a framework
calls for you, runs your components and turns the tree into a string. Nothing else happens: no
effects, no refs pointing at anything, no layout, no event handlers.

**The client pass** does not build the DOM. `hydrateRoot` renders your components again, walks the
nodes already on the page and claims each one, attaching handlers. The first render in the browser
compares rather than constructs.

The `useId` docs state the contract: "For hydration to work, the client output must match the server
HTML."

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

Every disagreement is a render that read something the other runtime cannot see, from one of three
places.

- **The environment.** The zone and locale the process is set to, the viewport, `navigator`,
  `localStorage`, a cookie the server was never sent. Touching `window` at all is a `ReferenceError`
  rather than a mismatch, and the usual guard is a trap below.
- **The clock and the dice.** `Date.now()`, `Math.random()`, an id off a module-level counter, a
  relative timestamp that reads "3 minutes ago" on one side and "4 minutes ago" on the other. The
  two passes happen seconds apart on different machines, so these differ by construction.
- **The data.** The server had a row the client has not fetched, or the client read a store the
  server rendered empty.

So the rule under every fix: **a value the two passes cannot both work out has to travel with the
HTML, or wait until after hydration.** Sending it is what `getServerSnapshot` is for: the
`useSyncExternalStore` docs describe a `<script>` tag that sets a global during server rendering,
which `getServerSnapshot` reads on the client. Waiting means a second render after mount, and a
visible flash of the server's version.

Ids are the one case React solved outright. `useId` derives the id from the component's parent path,
so the same tree yields the same id on both sides whatever the render order.

## Worked example

Measured on React 19.2.8 and Node 24.16.0, with the two passes in separate processes so the server
one has no DOM. A timestamp on a comment: the server runs in UTC, the reader's browser is in New
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
it reports nothing and keeps every node, and the text on screen stays the **server's** 11:20, even
after a later re-render. `<time dateTime>` keeps the machine-readable value right whatever the text
says. React calls `suppressHydrationWarning` an escape hatch that works only one level deep.

## Traps

**The class is wrong in the DOM and nothing anywhere says so.** An attribute mismatch is not
repaired. Measured on a `<nav>` whose `className` came out `nav-narrow` from the server and
`nav-wide` from the client: the DOM keeps `nav-narrow`, React's tree believes `nav-wide`, and a
later state change to the text inside that element left the class alone. A development build logs
one line; a production build logs nothing. The docs say "There are no guarantees that attribute
differences will be patched up in case of mismatches", because validating all markup would be
prohibitively expensive when mismatches are rare.

**One wrong word threw away the whole page.** A text mismatch regenerates every node up to the
nearest `<Suspense>` boundary, or the root when there is none, and whatever the DOM was holding goes
with them: focus, an uncontrolled input's value, nested scroll position, media that was playing. A
production build reports it as `Minified React error #418` and names no element. Put a boundary
around the region that legitimately differs and the rest of the page keeps its nodes.

**`typeof window` fixed the crash and shipped the bug.** Touching `window` during the server pass
throws `ReferenceError: window is not defined`, and the reflex is to guard it with
`typeof window !== 'undefined'`. That guard is false on the server and true in the browser, which is
the definition of a mismatch, and React's own error message lists it as the first cause. It trades a
crash on every request for a mismatch in somebody else's browser. The honest fixes are an `isClient`
state set in an effect, which hydrates clean and then flips, or marking the subtree client-only so
the server renders a fallback.

**Server rendering shipped a spinner.** A component that fetches in
[an effect](./effects-and-cleanup.md) renders its loading state on the server, because effects do
not run there. Measured: the HTML is `<p>Loading…</p>`, hydration reports nothing because both
passes agree, and the client then discards that node and fetches. Nothing is broken, which is why it
survives review, but the server cost was paid and the reader got a shell. Suspense does not rescue
`renderToString`, which cannot wait for data and emits the nearest fallback for anything that
suspends. The mirror case is a framework that loads data on the server without serialising it into
the HTML: the client fetches it again on mount, and only the request log shows it.
