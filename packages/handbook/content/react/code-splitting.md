---
title: Code splitting and lazy loading
question: Which parts of the bundle are worth splitting out, and when does splitting make things worse?
order: 7
practise:
  - react-lazy-bundle-growth
  - react-lazy-in-render
sources:
  - author: React
    title: lazy
    url: https://react.dev/reference/react/lazy
  - author: React
    title: Suspense
    url: https://react.dev/reference/react/Suspense
  - author: MDN
    title: import()
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import
  - author: web.dev
    title: Reduce JavaScript payloads with code splitting
    url: https://web.dev/articles/reduce-javascript-payloads-with-code-splitting
  - author: webpack
    title: SplitChunksPlugin
    url: https://webpack.js.org/plugins/split-chunks-plugin/
  - author: Philip Walton
    title: Deploying ES2015+ Code in Production Today
    url: https://philipwalton.com/articles/deploying-es2015-code-in-production-today/
verified: 2026-08-01
---

Splitting the code means the browser downloads what the first screen needs and fetches the rest only
when someone goes looking for it. Done well, people stop paying for parts of the app they never
open. Done in the wrong place, the page waits on a second download before it can show something it
needed from the start.

## The model

A dynamic `import()` is the split point. A static import gets inlined into whatever bundle contains
it; `import()` returns a promise instead, and the bundler emits that module, plus everything only it
needs, as a separate chunk. Nothing fetches the chunk until the import runs. MDN's framing is that
dynamic imports let you "load a module conditionally or on demand".

`lazy` is the React-shaped way to wait for one. It takes the function that returns the promise, and
React "will not call `load` until the first time you attempt to render the returned component".
While that promise is pending the component suspends, and the nearest `<Suspense>` boundary shows
its fallback.

So a split trades bytes now for a request later, and it pays off when later is genuinely later. It
pays best when later turns out to be never. Split something that renders on first paint and the
trade runs backwards: those bytes still have to arrive before the page is usable, but now they
arrive in a second request that cannot start until the first bundle has downloaded, parsed and
rendered far enough to reach the import. One download became two sequential ones, and a fallback
flashes where a component used to appear.

Three rules survive contact with a real app:

- **Routes first.** A visit uses one route and pays for all of them. This is the split with the
  largest ratio of code moved to behaviour changed, and the router already has the boundary.
- **Interaction second.** The modal nobody opens, the editor behind a button, the export dialog two
  percent of sessions reach. Its bytes and its request happen only if someone gets there.
- **Never above the fold.** If it renders on first paint, import it normally. There is no work to
  defer, only a round trip to add.

The request you deferred still costs latency the first time somebody wants it, and preloading buys
that back. Start the import on intent rather than on render: pointer enter, focus, the mousedown
before the click. Calling the same `import()` twice does not fetch twice, because the module map
hands back the first call's result, so the preload is a plain call to the same function and the
render that follows gets a promise that has already settled.

What happens to a module that two lazy chunks both need is a bundler decision, not a law. webpack's
defaults pull shared code into its own chunk once it is at least 20kb and used by at least two
chunks, and leave it inlined in both below that. Another bundler draws the line somewhere else. Read
the output rather than reasoning about it: how many chunks, how big, and which modules landed in more
than one.

Splitting is also not the only lever on bytes. Philip Walton's module/nomodule pattern serves modern
browsers untranspiled syntax and the legacy bundle only to browsers that need it, which cuts the
download without adding a request.

## Worked example

A route split, with the boundary where the page can survive a gap:

```jsx
import { lazy, Suspense } from 'react';
import { Header } from './Header'; // renders on first paint: import it normally

// Top level, so the component type is stable across renders
const Reports = lazy(() => import('./routes/Reports'));

function App() {
  return (
    <>
      <Header />
      <Suspense fallback={<RouteSkeleton />}>
        <Reports />
      </Suspense>
    </>
  );
}
```

The same idea for a panel behind a click, with the fetch started on hover:

```jsx
const loadEditor = () => import('./Editor');
const Editor = lazy(loadEditor);

function Page() {
  const [editing, setEditing] = useState(false);

  return (
    <>
      <button onPointerEnter={loadEditor} onFocus={loadEditor} onClick={() => setEditing(true)}>
        Edit
      </button>
      {editing && (
        <Suspense fallback={<EditorSkeleton />}>
          <Editor />
        </Suspense>
      )}
    </>
  );
}
```

Hovering starts the fetch while the pointer travels to the button, so by the time the click lands the
module is usually there. If the click never comes, the chunk was never downloaded, which was the
point.

## Traps

**The network tab shows more bytes after the split, not fewer.** A dependency both chunks need sat
below the bundler's threshold for a shared chunk, so it shipped twice, and each chunk carries its own
wrapper and registration on top of the code. Splitting is a layout change to the output, not a
deletion, so check the built chunks before assuming a `lazy` call made anything smaller.

**A spinner appears where a button used to render instantly.** The component was above the fold, so
its code was always going to be needed at first paint, and the split added a round trip and a
fallback in front of it. Import it normally and split the thing further down the page instead. Bytes
are only one of the two budgets: [the main thread](./the-main-thread.md) is what the bytes cost once
they have arrived.

**One slow chunk holds up content that was ready.** A boundary covers everything inside it: "even if
only one of these components suspends waiting for some data, all of them together will be replaced by
the loading indicator". Wrap the part that is allowed to be missing, not the whole screen.

**State inside a panel resets every time the parent renders.** `lazy()` was called in a component
body, so each render produces a new component type and React unmounts the old tree to mount a fresh
one. react.dev says it directly: "Do not declare `lazy` components inside other components." Move the
call to the top level of the module.
