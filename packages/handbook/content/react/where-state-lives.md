---
title: Where state lives
question: Where should this piece of state actually live?
order: 2
practise:
  - react-lifting-state
  - invoice-panel-react
  - optimistic-save-react
  - react-state-colocation
  - react-derived-state
  - react-unnecessary-effect
  - react-reset-state-key
  - react-ref-vs-state
sources:
  - author: React
    title: Sharing State Between Components
    url: https://react.dev/learn/sharing-state-between-components
  - author: React
    title: Preserving and Resetting State
    url: https://react.dev/learn/preserving-and-resetting-state
  - author: React
    title: You Might Not Need an Effect
    url: https://react.dev/learn/you-might-not-need-an-effect
  - author: React
    title: Referencing Values with Refs
    url: https://react.dev/learn/referencing-values-with-refs
  - author: Kent C. Dodds
    title: State Colocation will make your React app faster
    url: https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster
  - author: Kent C. Dodds
    title: Application State Management with React
    url: https://kentcdodds.com/blog/application-state-management-with-react
  - author: MDN
    title: URLSearchParams
    url: https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams
verified: 2026-08-01
---

Every value a screen remembers, such as the open tab or the text in a search box, has to be kept
somewhere. Keep it too high up and typing in one box makes unrelated parts of the page redo their
work. Keep a copy of something you could have worked out instead, and the copy and the original
drift apart. Picking the home is mostly a matter of asking the questions in the right order.

## The model

There are four homes for a piece of state, and an order to try them in. Most arguments about state
management are this question asked in the wrong order.

**Nowhere: derive it.** If the value can be worked out from props, state or the URL you already have,
it is not state. Write it as an expression in the component body. Storing it gives you two things
that mean the same thing and can disagree, and keeping them in step becomes a permanent job.

**The URL.** Anything that should survive a reload, come back with the back button, or paste into
a message and land somebody on the same screen: the current tab, the filters, the page number, the id
of the record being viewed. The address bar is a state store you did not have to write, and
`URLSearchParams` is how you read and write it.

**The component that needs it.** This is the default, and it is not just tidiness. React rerenders a
component's whole subtree when its state changes, whether or not the children read the changed value,
so state parked high in the tree makes every keystroke expensive for components with no interest in
it. Colocating is what stops that.

**The closest common ancestor of the components that need it.** When a second component genuinely has
to read or write the value, move it to the nearest component above both and pass it down as a prop,
with a callback back up. That is lifting state up, and _closest_ is the load-bearing word: lift as far
as necessary and not one component further. Lifting is what you do when colocation stops working, not
the starting position.

Then there is server data, which is a cache rather than state. Rows owned by a database somewhere,
held on the client for fast access. The questions it raises are staleness, refetching and
invalidation, not who owns the value, which is why a query library answers them better than
`useState` does. Kent C. Dodds' split into server cache and UI state is the clearest version of this.

One more home, off to the side: `useRef`, for what the render output does not depend on. A timer id,
a previous value, a scroll offset you only read in a handler. Changing `ref.current` schedules no
render, which is the point and also the catch, so React's docs are blunt about not reading or writing
it during render.

## Worked example

An orders page holding three things in state:

```jsx
function OrdersPage({ orders }) {
  const [tab, setTab] = useState('open');
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState([]);

  useEffect(() => {
    setVisible(orders.filter((o) => o.status === tab && o.number.includes(query)));
  }, [orders, tab, query]);

  return (
    <>
      <Tabs value={tab} onChange={setTab} />
      <SearchBox value={query} onChange={setQuery} />
      <OrdersTable rows={visible} />
      <ActivityFeed />
    </>
  );
}
```

Three pieces of state, three different answers. `visible` is not state at all: it is `orders`, `tab`
and `query` put through a filter. `tab` belongs in the URL, because a reload should not drop you back
on Open and a link to the refunded orders should be a link. `query` is read by the search box and by
the filter feeding the table, so it belongs at the nearest ancestor of those two, which stops being
this component as soon as they are a pair of their own.

```jsx
function OrdersPage({ orders }) {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'open';

  return (
    <>
      <Tabs value={tab} onChange={(next) => setParams({ tab: next })} />
      <SearchableOrders orders={orders.filter((o) => o.status === tab)} />
      <ActivityFeed />
    </>
  );
}

function SearchableOrders({ orders }) {
  const [query, setQuery] = useState('');
  const visible = orders.filter((o) => o.number.includes(query));

  return (
    <>
      <SearchBox value={query} onChange={setQuery} />
      <OrdersTable rows={visible} />
    </>
  );
}
```

`useSearchParams` here is react-router's; the point is the address bar rather than the router. A
keystroke now rerenders `SearchableOrders` and the two components inside it. `Tabs` and `ActivityFeed`
sit above that boundary and are untouched, without a `memo` anywhere. The effect and the third
`useState` are gone, and with them the render that used to show the previous filter result.

## Traps

**The sorted list froze on the first render.** `useState(sortItems(items))` runs the sort once and
stores the result: the argument is only the initial value, and React ignores it on every later render
in favour of what it has stored. A prop copied into state stops tracking the prop the moment the copy
is made. Derive it instead, `const sorted = sortItems(items)`, and reach for `useMemo` only when the
sort is measurably expensive.

**Typing in the search box rerenders the dashboard.** The state lives above a component that never
reads it, and children rerender by default. `memo` on the dashboard stops the render and leaves the
cause in place; moving the state and the input down into the component that owns them removes the
cause and deletes code rather than adding a wrapper.

**An effect whose entire body is a `setState`.** Every change now renders twice, once with the stale
value and again after the effect corrects it, and the old content is on screen in between. A value
computed from props and state is derived, so compute it during render. Effects are for synchronising
with something outside React, which is what [effects, and what cleanup has to
undo](./effects-and-cleanup.md) is about.

**The edit form still shows the previous user's draft.** React kept the same component instance,
because its type and position in the tree did not change, and state belongs to the instance rather
than to the props. `<UserForm key={user.id} />` tells React this is a different thing, so it discards
the old instance and mounts a fresh one. An effect that clears the fields also works, one render after
the stale draft has been seen. Remounting throws away focus and scroll position too, so put the `key`
on the smallest subtree that needs resetting.

**A value you update but never display, and the component rerenders anyway.** It is in state and does
not need to be. `useRef` holds a mutable value across renders without scheduling one, read and written
through `ref.current`. The trade is that React has no idea when it changed, so nothing the JSX reads
belongs in there.
