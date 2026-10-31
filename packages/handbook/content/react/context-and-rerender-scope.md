---
title: Context and re-render scope
question: Why does every consumer re-render when one field of my context changes?
order: 4
practise:
  - react-context-value-identity
  - react-context-read-scope
  - react-context-dispatch-split
  - react-context-memo-consumer
  - now-playing-react
sources:
  - author: React
    title: useContext
    url: https://react.dev/reference/react/useContext
  - author: React
    title: createContext
    url: https://react.dev/reference/react/createContext
  - author: React
    title: useReducer
    url: https://react.dev/reference/react/useReducer
  - author: React
    title: memo
    url: https://react.dev/reference/react/memo
  - author: React
    title: Scaling Up with Reducer and Context
    url: https://react.dev/learn/scaling-up-with-reducer-and-context
verified: 2026-08-01
---

Context lets a component deep in a React tree read a shared value, such as the signed-in user or the
theme, without every component in between handing it along. What it cannot do is tell which part of
that value a component cares about. Change any part, or only look as if you did, and everything
reading it renders again, whether or not its part moved.

## The model

Context has one unit of subscription: the provider's `value`. Calling `useContext(SomeContext)`
subscribes the component to that whole value. Destructuring one field out of it is not a narrower
subscription, it is a property read on something you already took all of.

When the provider renders, React compares the new value with the old one. The docs are exact about
how: "The previous and the next values are compared with the `Object.is` comparison." Different, and
every component below that reads the context re-renders, whatever it does with the value. Same, and
none of them re-render on the context's account.

That gives you two different failures, which need two different fixes.

**The value is new but its contents are not.** `value={{ user, signOut }}` builds a fresh object on
every render of the provider, and a fresh object is never `Object.is` to the last one, so context
announces a change that did not happen. `useMemo` fixes it, as long as the things inside the object
are stable too: functions come from `useCallback` or from outside the component.

**The value really changed, and most consumers do not care.** A cursor position that updates on
every `mousemove`, sharing one value object with a theme that changes once a session. No amount of
memoising helps, because `pos` genuinely is a different value each time. The only lever left is
scope: give the fast-changing field its own context so components reading the slow one are not
subscribed to it.

Context is not a store with selectors, and splitting is what you have instead of one. Redux's
`useSelector`, Zustand and Jotai all exist to let a component subscribe to a slice of state. Without
one of those, the number of contexts is your only dial.

## Worked example

The sharpest split, because one half of it can never re-render at all. `useReducer` returns a
`dispatch` with a stable identity, the same function for the life of the component. Bundling it with
state throws that guarantee away:

```jsx
const TodosContext = createContext(null);

function TodosProvider({ children }) {
  const [state, dispatch] = useReducer(todosReducer, initialState);
  // a new object every time state changes
  return <TodosContext value={{ state, dispatch }}>{children}</TodosContext>;
}

function AddButton() {
  const { dispatch } = useContext(TodosContext);
  return <button onClick={() => dispatch({ type: 'add' })}>Add</button>;
}
```

`AddButton` renders nothing out of `state` and re-renders every time a todo is toggled anywhere.
`useMemo` on the value would not save it: `state` is a real change, so the memo recomputes and
publishes a new object anyway.

Two contexts, and the button subscribes to something that never changes:

```jsx
const TodosContext = createContext(null);
const TodosDispatchContext = createContext(null);

function TodosProvider({ children }) {
  const [state, dispatch] = useReducer(todosReducer, initialState);
  return (
    <TodosContext value={state}>
      <TodosDispatchContext value={dispatch}>{children}</TodosDispatchContext>
    </TodosContext>
  );
}

function AddButton() {
  const dispatch = useContext(TodosDispatchContext);
  return <button onClick={() => dispatch({ type: 'add' })}>Add</button>;
}
```

Neither value is an object literal now. `state` is whatever the reducer returned, so its consumers
re-render exactly when the state changes, and `dispatch` is the same function for as long as the
provider is mounted, so `TodosDispatchContext` never publishes a new value at all. (React 19 renders
`<TodosContext>` as the provider. Before 19, write `<TodosContext.Provider>`.)

The cost is a second provider and a second `useContext` wherever a component needs both, so it earns
its place once a tree has enough dispatch-only consumers (toolbars, buttons, forms) to matter, not
reflexively on every reducer.

## Traps

**Every consumer re-rendered and not one of their fields changed.** The provider passes an object
literal, which is a new object on each of its own renders, so `Object.is` reports a change on each
one. Consumers cannot defend themselves against this; only the provider can fix it, with
`useMemo(() => ({ user, signOut }), [user, signOut])` and a `signOut` that is stable.

**You wrapped the consumer in `memo` and nothing changed.** `memo` compares props, and the context
read happens inside the component, below that comparison. react.dev says it plainly: a memoized
component still re-renders when a context it uses changes. `memo` can still stop the damage
spreading, though. Read the context in a small outer component and pass the field down as a prop to
a memoized child, and the expensive subtree stops following the value. What `memo` does compare, and
what defeats it, is [memo and what it cannot fix](./memo-and-what-it-cannot-fix.md).

**Mousemove re-renders the sidebar.** The sidebar reads `theme`, but `theme` shares a value object
with `pos`, and `pos` changes dozens of times a second. `theme` never changed and the sidebar
re-renders anyway, because the value is all context compares. There is no identity bug to memoise
here. Move `pos` into its own provider.

**You split the context and the component still re-renders.** Then it is re-rendering as its
parent's child, which context has nothing to do with: a component written inside the provider's JSX
re-renders whenever the provider does. Take it as `{children}` instead, built by a component above
the provider, which is why both examples here thread `children` through.
