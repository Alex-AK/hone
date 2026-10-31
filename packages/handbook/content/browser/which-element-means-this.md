---
title: Which element means this
question: Does it matter which element I use if I style it the same?
order: 1
practise:
  - html-section-vs-article-vs-div
  - html-anchor-vs-button
  - html-em-vs-i
  - html-list-semantics
  - html-time-datetime
  - html-button-type-default
sources:
  - author: web.dev
    title: Semantic HTML
    url: https://web.dev/learn/html/semantic-html
  - author: MDN
    title: '<button>: The Button element'
    url: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/button
  - author: MDN
    title: '<a>: The Anchor element'
    url: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/a
  - author: MDN
    title: '<section>: The Generic Section element'
    url: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/section
  - author: MDN
    title: '<i>: The Idiomatic Text element'
    url: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/i
  - author: MDN
    title: '<time>: The (Date) Time element'
    url: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/time
  - author: MDN
    title: aria-setsize
    url: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-setsize
  - author: MDN
    title: 'HTML: A good basis for accessibility'
    url: https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Accessibility/HTML
  - author: WHATWG
    title: HTML Standard, Sections
    url: https://html.spec.whatwg.org/multipage/sections.html
  - author: WHATWG
    title: HTML Standard, Implicit submission
    url: https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#implicit-submission
  - author: W3C
    title: ARIA Authoring Practices Guide, Button Pattern
    url: https://www.w3.org/WAI/ARIA/apg/patterns/button/
  - author: W3C
    title: ARIA Authoring Practices Guide, Link Pattern
    url: https://www.w3.org/WAI/ARIA/apg/patterns/link/
verified: 2026-08-01
---

Two elements can look identical on screen and behave completely differently. The element you choose
tells the browser what the content is, and the browser hands out behaviour based on that: whether a
keyboard can reach it, what a screen reader calls it, whether it opens in a new tab or submits a
form. Pick a generic box and style it, and all of that is yours to rebuild.

## The model

**An element is a promise about what the content means, and the browser pays out on that promise in
behaviour**: tab order, which keys activate the thing, what the accessibility tree calls it, what
the right-click menu offers, whether a form submits. A `div` promises nothing, so it is given
nothing. web.dev says it plainly: without the semantic button, you have to program all those
features back in.

**`a` or `button`** is settled by one question: does it go somewhere, or does it do something? A
link has a destination, and every affordance browsers built around URLs keys off a real `href`:
middle-click or Cmd-click for a new tab, copy link address and bookmark in the context menu,
dragging, the destination in the status bar. A button acts in place. The keyboard contract differs
too, and that is the part that gets missed: Space and Enter both activate a button, while Enter
alone follows a link, because Space scrolls the page.

**`section`, `article`, `div`.** `article` is content that would still make sense somewhere else.
The HTML Standard defines it as "a complete, or self-contained, composition ... independently
distributable or reusable, e.g. in syndication", which is a blog post, a comment, a product card.
`section` is weaker than its reputation: it maps to the `region` landmark only when it has an
accessible name, and a heading inside it does not supply one. Unnamed, it exposes exactly what a
`div` exposes. The spec encourages `div` when an element is needed only for styling or as a
convenience for scripting, so `div` is the honest answer more often than semantic-HTML advocacy
admits. The test for a `section` is whether the block has a name and is worth navigating to.

**A list buys you a number you did not compute.** Browsers calculate the size of a set and each
item's position in it from the DOM, such as the number of `<li>`s in a list, so the list is
announced with its length before the first item is read. Three divs in a row are announced and
counted as nothing, and a count you write by hand is wrong the first time the list is filtered.

**`em` and `strong` are claims about the sentence**, not requests for a font. `em` is stress
emphasis, the word you would say louder: "I said _tomorrow_" and "_I_ said tomorrow" are different
claims. `strong` is importance. `i` and `b` produce the same look while claiming neither, which is
what a taxonomic name, an idiom in another language or a run-in label actually needs.

**`time` takes the date out of the prose.** The visible text stays whatever reads well, and
`datetime` carries the machine-readable value that search engines and your own scripts can parse. It
takes a fixed set of forms, among them `YYYY-MM-DD`, `HH:MM`, a full date and time, a week like
`2013-W46` and a duration like `PT7H12M13S`.

## Worked example

A notification card, built out of divs:

```html
<div class="list">
  <div class="card">
    <div class="title">Invoice 42</div>
    <span class="ago">2 days ago</span>
    <div class="link" onclick="location.href = '/invoices/42'">View invoice</div>
    <div class="btn" onclick="archive(42)">Archive</div>
  </div>
</div>
```

It looks right and it works with a mouse. Nothing else about it works.

The same card with the promises written down:

```html
<ul class="list">
  <li>
    <article class="card">
      <h3 class="title"><a href="/invoices/42">Invoice 42</a></h3>
      <p>Sent <time datetime="2026-03-14T09:30Z">2 days ago</time></p>
      <button type="button" class="btn" onclick="archive(42)">Archive</button>
    </article>
  </li>
</ul>
```

The classes survived, so style it the same and it looks the same. What changed is what you no longer
own: both controls are in the tab order, Enter follows the link, Space and Enter work on the button,
the link opens in a new tab and copies from the context menu, the browser reports how many cards the
list holds, and the exact instant stays on the page after the friendly text goes stale. Writing that
back by hand takes `tabindex`, roles, two key handlers, a counter and a second copy of the date.

## Traps

**Cancel reloaded the page and everything typed is gone.** A `<button>` inside a form with no `type`
is a submit button. MDN on `submit`: "This is the default if the attribute is not
specified for buttons associated with a `<form>`, or if the attribute is an empty or invalid value."

```html
<button onclick="closeDialog()">Cancel</button>
<!-- posts the form, then the page reloads under the handler -->

<button type="button" onclick="closeDialog()">Cancel</button>
<!-- does nothing but run the handler, which is what Cancel means -->
```

It also steals the Enter key. The HTML Standard makes a form's default button the first submit
button in tree order, and Enter in a text field fires a click at it, so an untyped Cancel written
above Place order gets the keypress meant for the real submit. Write `type` on every `<button>`.

**The click works with a mouse and cannot be reached from the keyboard.** A `div` with an `onclick`
is not focusable, so Tab skips it, Enter and Space do nothing, and the accessibility tree has no
name or role to announce. MDN says a fake div button immediately loses the native keyboard
accessibility a `<button>` would have given you. Putting it back means `tabindex="0"`, a role,
handlers for both keys, and the disabled and focus-ring behaviour you have not thought about yet.
Use the button.

**Support keeps asking why the invoice will not open in a second tab.** Something navigates without
a real destination: a `<button>` that assigns `location.href`, or an `<a href="#">` with a click
handler. MDN warns that bogus `href` values cause unexpected behaviour when copying or dragging
links, opening them in a new tab or window, bookmarking, or when JavaScript is loading, errors or is
disabled. The direction matters. A link styled to look like a button is fine, because it still
navigates. A button marked up as a link is not, because it advertises a destination that does not
exist.

**The page has eight `<section>`s and the landmark list is empty.** A `section` becomes a `region`
only once it has an accessible name, from `aria-labelledby` pointing at its heading or from
`aria-label`. Name the ones worth jumping to and demote the rest to `div`:
[the accessible name](./the-accessible-name.md) is where the naming rules live, and
[landmarks and headings](./landmarks-and-headings.md) covers what a screen reader user does with the
result.

**"2 days ago" is the only date the page contains.** It is wrong the moment the page is cached,
scraped or opened a week later, because nothing says which day that was.
`<time datetime="2026-03-14T09:30Z">2 days ago</time>` keeps the friendly text and adds the instant.
`datetime` is only for parsers, though: a human reader still has nothing to pin the relative string
to until you show the date.

More of the same bargain, in focus behaviour, forms and dialogs, is in
[what the platform gives you](./what-the-platform-gives-you.md).
