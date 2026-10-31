---
title: Events, and where they actually go
question: Why did my click handler fire for something I never attached it to?
order: 12
practise:
  - dom-target-vs-currenttarget
  - dom-event-delegation
  - dom-prevent-vs-stop
  - dom-debounce-throttle
  - code-debounce
sources:
  - author: MDN
    title: Event bubbling
    url: https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/Event_bubbling
  - author: WHATWG
    title: 'DOM Standard: Dispatching events'
    url: https://dom.spec.whatwg.org/#dispatching-events
  - author: MDN
    title: EventTarget.addEventListener()
    url: https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener
  - author: MDN
    title: Event.preventDefault()
    url: https://developer.mozilla.org/en-US/docs/Web/API/Event/preventDefault
  - author: MDN
    title: Element.closest()
    url: https://developer.mozilla.org/en-US/docs/Web/API/Element/closest
  - author: MDN
    title: 'Element: focus event'
    url: https://developer.mozilla.org/en-US/docs/Web/API/Element/focus_event
  - author: MDN
    title: 'Glossary: Debounce'
    url: https://developer.mozilla.org/en-US/docs/Glossary/Debounce
  - author: MDN
    title: 'Glossary: Throttle'
    url: https://developer.mozilla.org/en-US/docs/Glossary/Throttle
  - author: web.dev
    title: Debounce your input handlers
    url: https://web.dev/articles/debounce-your-input-handlers
verified: 2026-08-01
---

A click lands on whatever is under the pointer, often a small icon inside a button inside a row, but
it does not stop there. The browser carries it up through every element that contains that icon, and
anything listening along the way hears it. That is why a handler on a whole table fires for a click
on one cell, and why one listener can look after a list that keeps changing.

## The model

An event does not happen at one element. It travels, and the DOM Standard numbers the legs of the
journey: `CAPTURING_PHASE` is 1, "before it reaches its target", `AT_TARGET` is 2, and
`BUBBLING_PHASE` is 3, "after it reaches its target". So a click on an icon inside a row inside a
table is offered to the document first, walks down to the icon, and then walks back up the same path.
Your handler fires for something you never attached it to because the event came past it.

Listeners sit on the way back up unless you say otherwise. `capture: true` moves one to the way down:
it "will be dispatched to the registered listener before being dispatched to any `EventTarget`
beneath it in the DOM tree". Everything else in this page is about the trip up.

Two properties describe where you are on that trip. MDN: "`target` refers to the element on which the
event was initially fired, while `currentTarget` refers to the element to which this event handler
has been attached." And the sentence that matters: "While `target` remains the same while an event
bubbles up, `currentTarget` will be different for event handlers that are attached to different
elements in the hierarchy."

**Delegation is what you get for free from all this.** Put one listener on a stable ancestor and it
sees clicks on every descendant, including ones added after the listener existed, because the
listener was never on the row in the first place. A list that grows, re-renders and reorders needs no
new listeners and leaves none behind. `event.target` is whatever was actually under the pointer, so
`closest()` gets you from there to the thing you care about: it "traverses the element and its
parents (heading toward the document root) until it finds a node that matches the specified CSS
selector", and returns `null` when there is no match.

Not everything bubbles. `focus` does not, "but the related `focusin` event that follows does bubble",
which is why delegating focus handling means `focusin` or a capturing listener. Where the keyboard
goes in the first place is [focus](./focus.md).

### Two methods that answer different questions

`preventDefault()` cancels what the browser was going to do on its own: "its default action, such as
page scrolling, link navigation, or pasting text, should not be taken". The event carries on
regardless. MDN is explicit: "The event continues to propagate as usual, unless one of its event
listeners calls `stopPropagation()`".

`stopPropagation()` ends the journey. It "prevents the event from bubbling up to any other elements",
and it does nothing at all about the default action.

So a submit handler that calls only `stopPropagation` still reloads the page, and one that calls only
`preventDefault` still lets a delegated listener above it count the submit. Reaching for the wrong
one often looks like it worked, because most forms have no ancestor listener to notice.

### Rate limiting a handler

`scroll`, `resize`, `mousemove` and `input` fire far faster than any useful response, and web.dev's
rule for input handlers holds for all of them: they "should execute quickly". Two shapes, and the
names get swapped constantly:

- **Debounce** waits for a pause. It "waits for invocations to stop for a specific time to
  consolidate many noisy invocations into one single invocation". Right for search-as-you-type, where
  only the final query matters.
- **Throttle** guarantees a ceiling. It "ensures that the operation is still performed at a certain
  maximum rate" while calls keep coming. Right for scroll position, where you want an answer during
  the scrolling and not only after it.

Both are built on `setTimeout`, so the deferred call is a task and waits behind whatever the loop is
already doing. [The event loop](../javascript/the-event-loop.md) has the queueing.

## Worked example

One listener on the table, doing all three jobs:

```js
const table = document.querySelector('#orders');

table.addEventListener('click', (event) => {
  if (event.target.closest('a')) return; // a link in a cell: let it navigate

  const row = event.target.closest('tr[data-order-id]'); // target is the icon, the span, the cell
  if (!row) return; // the header, or padding between rows

  event.currentTarget === table; // always. currentTarget is where the listener lives
  select(row.dataset.orderId);
});
```

Rows added tonight are handled by the listener you attached this morning. Teardown is one
`removeEventListener`, not one per row.

The two methods, on the same form:

```js
form.addEventListener('submit', (event) => {
  event.preventDefault(); // the page does not reload
  send(new FormData(form)); // the event still reaches listeners above
});
```

And the delay, where one line is the whole idea:

```js
function debounce(fn, ms) {
  let id;
  return (...args) => {
    clearTimeout(id); // every new call cancels the pending one
    id = setTimeout(() => fn(...args), ms);
  };
}

const search = debounce((q) => fetchResults(q), 300);
```

Nothing runs until a call survives 300ms without being cancelled. Throttle inverts it: record when
you last ran, and refuse until the window is up.

## Traps

**Clicking the icon in a row does nothing, clicking the text works.** `event.target` is the deepest
element under the pointer, and in a row with an avatar and a chevron that is usually not the row.
Reading `event.target.dataset.orderId` gets `undefined` from the icon. Go through
`event.target.closest('tr[data-order-id]')` and bail on `null`.

**A menu stopped closing after somebody fixed an unrelated bug in a child.** `stopPropagation()` in
that child ends the event's trip, so every delegated listener above it goes quiet, including the one
on `document` that closes menus on an outside click. Nothing errors and nothing logs. It is also
usually the wrong tool: it leaves the default action running, so if the bug was a navigation or a
reload it is still there. Narrow the handler or test `event.target` at the top instead of cutting
propagation for everyone.

**`preventDefault()` did nothing and the console warned about it.** The listener is passive. "If a
passive listener calls `preventDefault()`, nothing will happen and a console warning may be
generated", and `passive` "defaults to `true` for `wheel`, `mousewheel`, `touchstart` and
`touchmove`" in every browser except Safari. To cancel one of those gestures you have to opt back in
with `{ passive: false }`, and pay the scrolling cost you were opted out of.

**The last thing you typed never got searched.** A debounced call is a pending `setTimeout` owned by
a component. Unmount before the delay elapses and the cleanup that cancels the timer throws away the
final value; skip that cleanup and the callback runs against something that no longer exists. The
same lifetime problem shows up as the opposite symptom when the debounced function is rebuilt on
every render, because each keystroke then holds its own `id` and cancels nothing. Keep the debounced
function stable across renders and cancel it on purpose, which is an
[effects and cleanup](../react/effects-and-cleanup.md) question.
