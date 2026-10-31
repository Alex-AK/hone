---
title: Landmarks, headings and the outline myth
question: How does someone who cannot see the layout find their way around the page?
order: 2
practise:
  - html-main-landmark
  - html-heading-outline-myth
  - a11y-heading-order
  - a11y-skip-link
sources:
  - author: WHATWG
    title: 'HTML Standard: headings and outlines'
    url: https://html.spec.whatwg.org/multipage/sections.html#headings-and-outlines
  - author: WHATWG
    title: 'HTML Standard: the main element'
    url: https://html.spec.whatwg.org/multipage/grouping-content.html#the-main-element
  - author: WHATWG
    title: 'HTML Standard: focusable area'
    url: https://html.spec.whatwg.org/multipage/interaction.html#focusable-area
  - author: WHATWG
    title: 'HTML Standard: being rendered'
    url: https://html.spec.whatwg.org/multipage/rendering.html#being-rendered
  - author: W3C
    title: ARIA in HTML
    url: https://www.w3.org/TR/html-aria/
  - author: W3C WAI
    title: 'ARIA Authoring Practices Guide: landmark regions'
    url: https://www.w3.org/WAI/ARIA/apg/practices/landmark-regions/
  - author: W3C WAI
    title: 'G1: adding a link at the top of each page that goes directly to the main content area'
    url: https://www.w3.org/WAI/WCAG22/Techniques/general/G1
  - author: MDN
    title: The HTML section heading elements
    url: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/Heading_Elements
  - author: MDN
    title: Default styles for h1 elements are changing
    url: https://developer.mozilla.org/en-US/blog/h1-element-styles/
verified: 2026-08-01
---

Plenty of people move around a page without seeing it, using a screen reader to jump from region to
region or from heading to heading. Those jumps only work if the markup says where the regions are
and how the headings nest, because the visual design tells a screen reader nothing. Get it wrong and
there is nothing to jump to, so the only way to the content is through everything in front of it.

## The model

A sighted reader navigates by looking: the nav is the row along the top, the article is the wide
column, the sidebar is the narrow one. None of that is information a screen reader can use, so the
browser exposes two structures in its place, and a screen reader turns each into a list you can jump
through. The landmark list is the regions of the page. The heading list is its outline. Both are
generated from your markup and from nothing else, so a `class="sidebar"` contributes nothing to
either. The ARIA Authoring Practices Guide puts the landmark half plainly: screen readers "exploit
landmark roles to provide keyboard navigation to important sections of a page".

Landmarks come from elements, and the mapping is fixed by ARIA in HTML:

- `main` — the main landmark, the dominant content of the document.
- `nav` — navigation. Several are allowed; give each its own label.
- `header` and `footer` — banner and contentinfo, but only when they are not inside `article`,
  `aside`, `main`, `nav` or `section`. Nested, both are generic, so a card's `<header>` is not the
  site banner.
- `aside` — complementary.
- `search` — the search landmark, which is why a `<form>` inside it does not need `role="search"`.
- `section` — region, but only when it has an accessible name. Without one it is generic and does not
  appear in the landmark list at all. See [the accessible name](./the-accessible-name.md) for where
  that name comes from; a heading inside the section is not it.

Exactly one `main` is a spec rule, not a convention: "A document must not have more than one `main`
element that does not have the `hidden` attribute specified." It matters because `main` is the
address the rest of the page points at. A skip link is a link to it, and WCAG technique G1 describes
the shape: the first interactive item on the page is a link to the beginning of the main content, and
activating it "sets focus beyond the other content to the main content". With no `main` there is
nothing to give an `id` to and nothing to skip to.

Headings are the second structure, and this is where a persistent myth lives. HTML once specified a
document outline algorithm in which sectioning content rebased heading levels, so an `h1` inside a
nested `section` would count as an `h2`. It was removed from the HTML spec in 2022, and MDN's account
of why is the part worth keeping: that default rendering "was implemented in browsers in their UA
styles, but not the heading level in the accessibility tree". Browsers shrank the nested `h1` and
never demoted it, which is how the myth stayed believable. Firefox removes that stylesheet rule in
140 and Chrome has shown a deprecation warning since 136, so a nested `h1` now looks as big as it
always was.

What the standard says today is short: "The outline is all headings in a document, in tree order",
and a heading's level is the digit in its tag name. So `h1` then `h3` skips a level for real, and the
requirement is normative: each heading in the outline "must have a heading level that is less than,
equal to, or 1 greater than" the one before it. The spec gives that exact pair as its non-conforming
example. (It has since added `headingoffset` and `headingreset` attributes for shifting levels
deliberately. They are new enough that MDN does not yet list them among the global attributes, so
treat the digit as the whole story.)

## Worked example

A page skeleton that produces a useful landmark list and a heading list you could read as a table of
contents:

```html
<body>
  <a class="skip-link" href="#content">Skip to main content</a>

  <header>
    <!-- banner: not inside a sectioning element -->
    <img src="/logo.svg" alt="Kettle" />
    <search>
      <form action="/find">
        <input type="search" name="q" aria-label="Search invoices" />
      </form>
    </search>
  </header>

  <nav aria-label="Primary">…</nav>

  <main id="content" tabindex="-1">
    <h1>Invoices</h1>
    <h2>Overdue</h2>
    <h3>This week</h3>

    <section aria-labelledby="paid">
      <h2 id="paid">Paid</h2>
    </section>
  </main>

  <aside aria-label="Related reports">…</aside>
  <footer>…</footer>
</body>
```

Seven landmarks (banner, search, navigation, main, region "Paid", complementary, contentinfo) and
four headings: Invoices, Overdue, This week, Paid. Dropping back from `h3` to `h2` is fine, because
the rule only constrains how far a level may climb.

Two details do the work. The `tabindex="-1"` makes `main` a focusable area, so the focusing steps run
by fragment navigation land on it; without it, focus falls back to the viewport, though the next Tab
still continues from the target. And the skip link is moved off screen rather than removed:

```css
.skip-link {
  position: absolute;
  left: -100vw; /* off screen, still rendered, still focusable */
}

.skip-link:focus {
  left: 0.5rem;
  top: 0.5rem;
}
```

## Traps

**The landmark list is empty on a page that clearly has regions.** Every region is a `div` with a
descriptive class, and a class name is not something a browser can interpret. Swap in `header`,
`nav`, `main` and `footer` and the list fills itself.
[Which element means this](./which-element-means-this.md) is the wider version of the same decision.

**The heading list reads h1, h3, h5.** The levels were picked by how big the text needed to look, so
a designer's type scale became the document's structure. Somebody jumping by heading hears a gap and
goes hunting for the level that isn't there. Pick the level from the position in the hierarchy and
set the size in CSS. Nesting does not rescue you either: two `<h1>`s in nested `<section>`s are two
level-1 headings, one after another, with no relationship between them.

**Six sections, and none of them show up as landmarks.** `<section>` only maps to region when it has
an accessible name, which means `aria-label` or `aria-labelledby` pointing at the heading. Unnamed,
it is exactly a `div`. If it does not deserve a name, it does not want to be a landmark: use a `div`.

**The skip link cannot be reached with Tab.** It was hidden with `display: none`, which leaves it
with no layout boxes, so it is not "being rendered" and an element that is not being rendered is not
a focusable area at all. Off screen is a different thing, and the spec says so: "Just being
off-screen does not mean the element is not being rendered." Move it out of view and bring it back on
`:focus`. A link that stays invisible while focused is the other half of the same bug: a sighted
keyboard user tabs once, sees nothing move, and has no idea where focus went. [Focus](./focus.md)
covers what makes an element focusable in the first place.
