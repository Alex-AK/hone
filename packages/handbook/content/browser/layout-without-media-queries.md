---
title: Layout that does not need a media query
question: How many breakpoints does this actually need?
order: 8
practise:
  - css-grid-auto-fit
  - css-container-query
  - css-flex-min-width
  - css-center-both-axes
sources:
  - author: MDN
    title: Basic concepts of flexbox
    url: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Flexible_box_layout/Basic_concepts
  - author: MDN
    title: gap
    url: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/gap
  - author: MDN
    title: place-items
    url: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/place-items
  - author: MDN
    title: CSS container queries
    url: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries
  - author: W3C
    title: CSS Box Sizing Module Level 3
    url: https://www.w3.org/TR/css-sizing-3/
  - author: W3C
    title: CSS Flexible Box Layout Module Level 1
    url: https://www.w3.org/TR/css-flexbox-1/
  - author: W3C
    title: CSS Grid Layout Module Level 2
    url: https://www.w3.org/TR/css-grid-2/
  - author: W3C
    title: CSS Values and Units Module Level 4
    url: https://www.w3.org/TR/css-values-4/
  - author: W3C
    title: CSS 2 visual formatting model details
    url: https://www.w3.org/TR/CSS2/visudet.html
  - author: web.dev
    title: Container queries land in stable browsers
    url: https://web.dev/blog/cq-stable
verified: 2026-08-01
---

Making a page fit both a narrow screen and a wide one used to mean a separate set of rules for each
screen width. A card or a panel does not care how wide the screen is, though, only how much room it
was given, and a card that sits in a narrow sidebar breaks as soon as those two differ. Modern CSS
can size things from the space they actually have, so most of those per-width rules never need
writing.

## The model

A media query asks how wide the viewport is. Almost nothing in a layout wants to know that. A
component wants to know how much room it was given, and the viewport is a proxy for that which stops
being true the moment the same component appears in a sidebar.

Flex and grid answer different questions. Flexbox works in one dimension at a time, a row or a
column, and sizes from the content outwards: items take their content size, then grow or shrink into
whatever space is left over. Grid is the two-dimensional one, and it works the other way round, from
a structure you declare down onto whatever lands in it. If you are describing how leftover space
gets shared along one axis, that is flex. If you are describing the rows and columns themselves,
that is grid.

Grid also removes most breakpoints on its own:

```css
grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
```

The browser fits as many 200px tracks as the container allows, and `1fr` shares the remainder so the
tracks stretch. The column count follows the space available, and no pixel width is written into a
query. `auto-fill` runs the same computation with one difference, which the Grid spec states
directly: `auto-fit` behaves the same as `auto-fill` "except that after grid item placement any
empty repeated tracks are collapsed".

Sizing has its own vocabulary to reach for before a number. `min-content` is the size of the widest
thing in the box that cannot be broken, `max-content` is the size it would take on one line with no
wrapping, and `fit-content(x)` is `min(max-content, max(min-content, x))`. For values that should
move with the space, `min()` and `max()` represent the smallest and largest of their arguments, and
`clamp(MIN, VAL, MAX)` represents the same value as `max(MIN, min(VAL, MAX))`. So
`width: min(100%, 65ch)` is a fluid width and a maximum in one declaration.

Spacing is `gap`. It is shorthand for `row-gap` and `column-gap`, and it applies to flex containers,
grid containers and multi-column elements. It puts space between items and never on the outside
edge, which is what the old pattern of margin on every child and a negative margin on the parent was
trying to do.

Container queries are the honest form of the breakpoint. The container opts in, and `@container`
then matches its descendants:

```css
.panel {
  container-type: inline-size;
}

@container (min-width: 400px) {
  .card {
    grid-template-columns: 8rem 1fr;
  }
}
```

The query never matches the container itself, which is why the extra wrapper element exists in every
example of this. Support is settled: size container queries shipped in Chrome and Edge 105, Safari
16 and Firefox 110, and have been in all three engines since February 2023.

### Centring

Centring is one declaration and has been for years. `display: grid` with `place-items: center` puts
a single child in the middle on both axes, `place-items` being shorthand for `align-items` and
`justify-items`.

Flex needs two properties instead, `justify-content: center` and `align-items: center`, because
`justify-items` does not apply in flex layout and the second half of `place-items` is ignored there.
Flex also binds those properties to axes rather than to directions, so `flex-direction: column`
swaps which one centres vertically. Grid does not have that trap, which is the reason to prefer it
for this.

## Worked example

A card list that is responsive twice: the grid to its own width, and each card to the width it
happened to land in.

```css
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  gap: 1rem;
}

.card {
  container-type: inline-size;
}

.card-body {
  display: grid;
  gap: 0.5rem;
}

@container (min-width: 24rem) {
  .card-body {
    grid-template-columns: 6rem 1fr;
  }
}
```

No breakpoint anywhere. Put this markup in a 300px sidebar and the grid collapses to one column and
every card stays stacked, because no card's own box reaches 24rem. Put the same markup in a wide
main column and both decisions change, without either rule knowing the window size.

The header inside the card is a flex row, and it needs one more declaration to survive a long title:

```css
.card-header {
  display: flex;
  gap: 0.5rem;
}

.card-header h3 {
  min-width: 0; /* without this the title holds the whole row open */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

## Traps

**The page scrolls sideways and one row is wider than everything around it.** A flex item refuses to
shrink below its own content. `min-width` and `min-height` have an initial value of `auto`, not `0`,
which CSS Sizing 3 changed from CSS 2, and the Flexbox spec resolves that automatic minimum on a
flex item's main axis to the item's content-based minimum size. One long URL, a `<pre>`, a table or
an image with an intrinsic width then props the row open, and nothing you set on the container moves
it. `min-width: 0` on the item opts out. In a column container the same bug wears `min-height: 0`,
and it is the usual reason a panel that should scroll does not
([stacking and overflow](./stacking-and-overflow.md)). The spec zeroes the automatic minimum for a
flex item that is itself a scroll container, so `overflow: hidden` on the item has the same effect;
set it on a child instead and the item still props the row open.

**Two cards in a grid built for five, stretched across the whole row.** That is `auto-fit`: it
collapses the empty tracks so the real items take the space. `auto-fill` keeps those tracks, so the
two cards stay 16rem wide and the row ends early with a hole on the right. Neither is a bug. Use
`auto-fit` when items should fill the row, `auto-fill` when the column rhythm should look the same
whether the row is full or not.

**`height: 100%` did nothing.** A percentage height resolves against the containing block's height,
and CSS 2 is explicit about the other case: if that height is not specified explicitly and the
element is not absolutely positioned, the value computes to `auto`. Every ancestor between the two
has to have a definite height for the percentage to mean anything. Set the height on the box the
percentage is measured against, or start the chain with something definite such as `100dvh` on the
outermost element.

**The layout is right at every viewport width and still wrong in the sidebar.** The breakpoint is
measuring the window when the thing that changed is the component's own box. Two instances of one
component on the same page, at two widths, cannot both be right under a media query. Move the rule
into `@container` and set `container-type: inline-size` on the wrapper. If a layout declaration
looks ignored altogether rather than firing at the wrong width, that is a cascade question rather
than a layout one ([the cascade](./the-cascade.md)).
