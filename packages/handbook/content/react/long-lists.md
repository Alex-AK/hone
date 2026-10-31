---
title: Long lists
question: Twenty thousand rows are in the DOM and scrolling stutters. Windowing, or pagination?
order: 6
practise:
  - import-review-react
  - react-list-windowing
  - react-index-key
  - react-list-state-index
  - react-list-fragment-key
  - react-content-visibility
sources:
  - author: React
    title: Rendering Lists
    url: https://react.dev/learn/rendering-lists
  - author: React
    title: Preserving and Resetting State
    url: https://react.dev/learn/preserving-and-resetting-state
  - author: React
    title: Fragment
    url: https://react.dev/reference/react/Fragment
  - author: React
    title: useState
    url: https://react.dev/reference/react/useState
  - author: MDN
    title: content-visibility
    url: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/content-visibility
  - author: MDN
    title: 'Element: scrollTop property'
    url: https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollTop
verified: 2026-08-01
---

A very long list is slow for React, which has to build every row, and slow for the browser, which
has to keep every row on the page and account for it each time the layout changes. Showing only the
rows in view fixes the slowness but takes away things people rely on, such as searching the page or
printing it. Splitting the list into pages keeps all of that, at the cost of a click.

## The model

Two costs get confused here, and they are paid to different things.

The first is React's. Twenty thousand rows means building 20,000 elements, reconciling them against
the previous tree and committing 20,000 nodes, on every render of the list
([what a render actually is](./what-a-render-is.md) is those three steps). Memoising the sort or the
filter shrinks the work that happens before that, not the render itself.

The second is the browser's. Twenty thousand elements sitting in the document cost memory, and each
one is something the engine has to account for when style and layout are recalculated. That bill
arrives whether or not React rendered anything this frame, which is why a list can feel heavy while
the profiler shows nothing rendering, and why the same page is smooth on a laptop and stutters on a
mid-range phone.

Windowing attacks the second. Keep the whole array in memory, work out from the scroll offset which
slice of it is on screen, render that slice plus a small overscan above and below, and give the
scroll container a spacer sized to the full list so the scrollbar still tells the truth. The DOM
then holds tens of rows instead of tens of thousands. React's cost collapses too, but as a side
effect: there is less to render.

What windowing gives up is everything the browser does with real elements. `Ctrl-F` searches the
DOM, so in-page find stops at the window. An anchor link to a row that is not mounted lands nowhere.
Print gives you the rows that happened to be on screen. Sequential focus and screen-reader
navigation see the same partial list. Row heights also have to be fixed or measured, because the
spacer height and the slice offset are arithmetic.

Pagination and "load more" cost a click and keep all of it. Inside a page every row is a real
element, so find, print, anchors and focus order behave. Pagination gives each page a URL you can
share; "load more" keeps one scroll position and grows the DOM again as you go.

Only one of the three changes what crosses the network. Windowing renders 29 rows out of 20,000 you
have already downloaded, parsed and put in memory. Paging at the server never sends the other
19,971. So the two pair rather than compete: page at the server to control transfer, window in the
client if a single page is still large.

There is a middle option that keeps the DOM. `content-visibility: auto` leaves the elements in
place and lets the browser skip rendering work for the ones offscreen, and MDN is explicit that
this is what separates it from `hidden`: the skipped contents "must still be available as normal to
user-agent features such as find-in-page, tab order navigation". React still builds and commits all
20,000 elements, so it answers the browser's cost and not React's.

### What a key is for

Long lists are where key bugs surface, because long lists are where rows move. A key is the identity
React matches an element by across renders: same key means "this is the same row, update it",
different key means unmount the old element and mount a new one. Component state and DOM state, an
input's value or focus, follow that identity.

An index is a position, not an identity. Index keys are correct only while the list never reorders,
never gains an item anywhere but the end, and is never filtered. Delete the first row and every
remaining row changes index, so React matches row 1's element and state to what is now a different
record.

## Worked example

Windowing without a library, so the arithmetic is visible. One spacer at the full height, one
absolutely positioned slice inside it:

```jsx
const ROW_HEIGHT = 32;
const VIEWPORT = 600;
const OVERSCAN = 5;

function Rows({ rows }) {
  const [scrollTop, setScrollTop] = useState(0);
  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const count = Math.ceil(VIEWPORT / ROW_HEIGHT) + OVERSCAN * 2;

  return (
    <div
      style={{ height: VIEWPORT, overflowY: 'auto' }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: rows.length * ROW_HEIGHT, position: 'relative' }}>
        <div style={{ position: 'absolute', top: first * ROW_HEIGHT, left: 0, right: 0 }}>
          {rows.slice(first, first + count).map((row) => (
            <Row key={row.id} row={row} />
          ))}
        </div>
      </div>
    </div>
  );
}
```

With 20,000 rows and these numbers the slice holds 29: the 19 a 600px viewport can show at 32px a
row, plus 5 above and 5 below so a fast scroll has something to show before the next render lands.
The spacer carries the full 640,000px, which is what keeps the scrollbar honest. Fixed heights are
the assumption doing the work: if one row wraps to two lines, the spacer is wrong and the scrollbar
drifts. Real libraries add measured heights, sticky headers and scroll restoration, which is the
reason to reach for one rather than keep this.

`key={row.id}` still matters here, and matters more than usual. Every scroll changes which rows are
mounted, and the key is what stops React reusing one row's element and state for a different record.

A row that is more than one element needs the long-form fragment, because the `<>` shorthand takes
no props at all, `key` included:

```jsx
rows.map((row) => (
  <Fragment key={row.id}>
    <dt>{row.term}</dt>
    <dd>{row.def}</dd>
  </Fragment>
));
```

## Traps

**You deleted the top row and a half-typed input moved to a different record.** The rows are keyed
by index, so deleting one renumbers every row below it and React matches the old row 1 to the new
row 1. The DOM node and its state stay put while the data underneath them shifts up. Key on a
stable id from the data. Index keys survive only in a list that is never reordered, filtered or
inserted into above the end.

**React warns about a missing key and there is nowhere to put one.** The row is two sibling
elements wrapped in `<>`, which accepts no props. Import `Fragment` and write
`<Fragment key={row.id}>`. A wrapper `<div>` would take the key, but it is invalid inside `<dl>`,
`<table>` and `<select>`, where the content model does not allow it.

**Toggling a row changes nothing on screen.** `rows[i].done = !rows[i].done` followed by
`setRows(rows)` hands React the same array reference, and React skips the re-render when the next
state is `Object.is`-equal to the current one. `map` gives you a new array with a new object for the
row that changed and the others by reference. Match on `row.id` inside it rather than the index, or
the fix breaks the first time the list is sorted, for exactly the reason index keys do.

**`Ctrl-F` finds nothing and printing gives you 30 rows.** Windowing removed the offscreen rows from
the document, and browser features that read the document went with them. If find, print or anchor
links matter more than one continuous scroll, paginate. If the DOM has to stay intact and it is
paint and layout you are trying to skip, `content-visibility: auto` does that without unmounting
anything.
