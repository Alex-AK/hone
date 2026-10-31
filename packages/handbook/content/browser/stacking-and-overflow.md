---
title: Stacking, positioning and the box that will not scroll
question: My z-index is 9999 and it is still behind the header. Why?
order: 9
practise:
  - css-stacking-context
  - css-position-context
  - css-margin-collapse
  - css-overflow-scroll-parent
  - css-transition-display
sources:
  - author: MDN
    title: Stacking context
    url: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Positioned_layout/Stacking_context
  - author: MDN
    title: Layout and the containing block
    url: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Display/Containing_block
  - author: MDN
    title: Mastering margin collapsing
    url: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Box_model/Margin_collapsing
  - author: MDN
    title: overflow
    url: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overflow
  - author: W3C
    title: CSS Flexible Box Layout Module Level 1
    url: https://www.w3.org/TR/css-flexbox-1/
  - author: MDN
    title: Top layer
    url: https://developer.mozilla.org/en-US/docs/Glossary/Top_layer
  - author: MDN
    title: visibility
    url: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/visibility
  - author: MDN
    title: transition-behavior
    url: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/transition-behavior
  - author: MDN
    title: '@starting-style'
    url: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@starting-style
  - author: MDN
    title: overlay
    url: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overlay
  - author: Una Kravets
    title: 'Now in Baseline: animating entry effects'
    url: https://web.dev/blog/baseline-entry-animations
verified: 2026-08-01
---

Some CSS bugs look like the browser is ignoring you: a menu told to sit on top still shows up behind
the header, a list with a fixed height will not scroll, a gap appears that nothing seems to own. The
rule did apply. These properties are settled by the elements around the one you styled, mostly the
ones above it, so that is where the fix is.

## The model

**These bugs share one misconception: that a CSS property acts on the element you wrote it on.**
Each resolves against the element's ancestors instead, so the element you are looking at is the one
place the answer is not. If you doubt the declaration applied at all, settle it with
[the cascade](./the-cascade.md) first.

**`z-index` orders siblings within one stacking context.** A stacking context paints as a single
unit at its own level, and no descendant can be interleaved with anything outside it. So a `z-index`
of 9999 inside a context that sits below the header is still below the header. The element that has
to win is the context, not the child.

The properties that create one mostly look decorative: `opacity` below 1, any `transform` other than
`none`, `filter`, `backdrop-filter` or `clip-path`, `isolation: isolate`, `contain: paint` or
`layout`, `position: fixed` or `sticky`, and any positioned element with a `z-index` other than
`auto`. MDN's full list has more you would not guess, such as `container-type`.

**`position: absolute` resolves against the nearest positioned ancestor**, the nearest one whose
`position` is not `static`. With none, it falls back to the initial containing block, which is why a
badge meant for a card corner turns up in the corner of the page. `position: relative` with no
offsets fixes it. The decorative properties come back here: `transform`, `filter`, `perspective`,
`contain` and others establish a containing block for absolute **and fixed** descendants, which is
how a `position: fixed` header ends up scrolling with a transformed parent.

**Adjacent vertical margins collapse into one**, and the larger wins rather than the two adding up.
It happens between siblings, and between a parent and its first or last in-flow child, where the
child's margin escapes through the parent's edge and moves the parent. A `border-top`, a
`padding-top`, inline content or clearance on the parent stops the top one. Flex and grid containers
never collapse their items' margins, which is the real argument for spacing siblings with `gap`.

**A scrollbar appears on whichever ancestor has a constrained size.** Content overflows only an
element whose space is limited, by a `height`, a `max-height` or their inline equivalents, so
`overflow: auto` does nothing on a box that grows to fit. The height has to come from above and
survive every step down to the scroller. Flex layout is where it usually dies: the spec gives a flex
item an automatic minimum size equal to its content-based minimum, so a wrapper refuses to shrink
and passes the full content height on. `min-height: 0` opts out, and in grid `minmax(0, 1fr)` is the
same fix. There is more in [layout without media queries](./layout-without-media-queries.md).

**A transition needs two values in two frames, and `display` does not give it one.** By default
transitions do not start for discrete properties like `display`, so flipping `display: none` to
`block` alongside `opacity: 0` to `1` renders the end state immediately. `transition-behavior:
allow-discrete` opts the discrete property in, and `@starting-style` supplies the
before-first-render value. Both reached Baseline Newly available in August 2024. `overlay`, which
keeps a top-layer element there while it animates out, is still limited availability on MDN, so an
exit animation on a popover or a modal `<dialog>` needs a fallback where the entry animation does
not.

The fallback that has always worked is to keep the element in the layout: pair `opacity` with
`visibility`, which interpolates as a discrete step, so it stays `visible` for the fade out and
turns hidden at the end of it.

```css
.panel {
  visibility: hidden;
  opacity: 0;
  transition:
    opacity 200ms,
    visibility 200ms;
}
.panel.open {
  visibility: visible;
  opacity: 1;
}
```

## Worked example

An app shell with two bugs, each one element above where it shows up:

```css
.page {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.header {
  position: relative;
  opacity: 0.98; /* a stacking context, by accident */
}
.header .menu {
  position: absolute;
  z-index: 9999; /* only ever compared inside .header */
}

.content {
  flex: 1; /* min-height is auto, so this never shrinks */
}
.content .list {
  overflow-y: auto; /* nothing overflows: the box grew instead */
}
.card {
  position: relative;
  z-index: 1; /* and this beats the whole header */
}
```

The menu is behind the card and the list runs off the screen. Neither the `9999` nor the
`overflow-y` is wrong. The fixes are on the ancestors:

```css
.header {
  position: relative;
  z-index: 10; /* the header is what has to beat .card */
}
.header .menu {
  position: absolute;
  z-index: 1; /* enough, now that it means something */
}

.content {
  flex: 1;
  min-height: 0; /* let it shrink to the space it was given */
  display: flex;
  flex-direction: column;
}
.content .list {
  flex: 1;
  min-height: 0;
  overflow-y: auto; /* now there is a constrained height to overflow */
}
```

Deleting the `opacity: 0.98` also works, and is worth trying first, because it removes the context
rather than working around it.

## Traps

**The modal renders behind the header.** An ancestor of the modal created a stacking context, so the
modal's `z-index` is compared only against its siblings inside it, and no number crosses that
boundary. Fix the ancestor, or take the modal out: a portal into `document.body`, or `<dialog>` with
`showModal()`, which puts it in the browser's top layer. See
[what the platform gives you](./what-the-platform-gives-you.md).

**The tooltip is cut off at the edge of the card.** This is not stacking, and no `z-index` will
touch it. An ancestor has `overflow: hidden` and clips its descendants whatever layer they are on.
Move the element out: a portal, or the top layer via `popover` or a modal `<dialog>`, which nothing
in the document clips.

**Nothing changed, and the layering broke.** Somebody added `opacity: 0.99` to fade a panel in, a
`transform: translateZ(0)` for smoothness, or a `will-change: transform`. Each silently creates a
stacking context and caps every descendant at that ancestor's level. The diff looks cosmetic, so
`git log` on the parent's stylesheet finds it faster than the inspector does.

**There is a gap above the section and no element owns it.** The section's first child has a top
margin, and it collapsed through the parent's edge to move the parent. The inspector shows the
child's margin box outside the parent, which looks like a rendering glitch. Put a `padding-top` or a
`border-top` on the parent, make it a flex or grid container, or move the spacing to the parent.

**The panel has a fixed height and still will not scroll.** A flex item between the sized ancestor
and the scroller has the default `min-height: auto`, so it will not shrink below its content and
hands the full height down. Give every flex item in that chain `min-height: 0`, not only the one
with `overflow`.
