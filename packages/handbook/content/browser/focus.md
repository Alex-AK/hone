---
title: Focus, and the three things that break it
question: Where does the keyboard go after this, and can anyone see where it went?
order: 4
practise:
  - a11y-tabindex-programmatic-focus
  - a11y-focus-visible
  - a11y-focus-trap-modal
  - html-dialog-showmodal
  - autocomplete-react
  - form-errors-react
sources:
  - author: MDN
    title: tabindex
    url: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/tabindex
  - author: MDN
    title: ':focus-visible'
    url: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/:focus-visible
  - author: MDN
    title: The dialog element
    url: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog
  - author: MDN
    title: showModal()
    url: https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal
  - author: MDN
    title: inert
    url: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/inert
  - author: MDN
    title: Document.activeElement
    url: https://developer.mozilla.org/en-US/docs/Web/API/Document/activeElement
  - author: MDN
    title: order
    url: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/order
  - author: WHATWG
    title: HTML Standard, the dialog element
    url: https://html.spec.whatwg.org/multipage/interactive-elements.html#the-dialog-element
  - author: W3C
    title: ARIA Authoring Practices Guide, dialog (modal) pattern
    url: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
  - author: W3C
    title: ARIA Authoring Practices Guide, developing a keyboard interface
    url: https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/
  - author: W3C
    title: Understanding SC 2.4.7 Focus Visible
    url: https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html
verified: 2026-08-01
---

## The model

Exactly one element in a document has focus, and keyboard events go to that element.
`document.activeElement` names it, and when nothing is focused it is the `<body>`. Two things follow
from that, and both are your job: everything interactive has to be reachable in that state, and the
user has to be able to see where they are.

Tab walks a sequence built from the document, not from the stylesheet. Elements that are interactive
by default are in it (`a` with an `href`, `button`, `input`, `select`, `textarea`), in source order.
CSS that moves things around visually does not move their tab stop: `order` "is only meant to affect
the visual order of elements and not their logical or tab order", so a column you reshuffled in
flexbox still tabs in the order you wrote it.

`tabindex` edits that sequence. It takes three kinds of value, and one of them is a mistake:

- `tabindex="0"` — puts an element into the sequence at its position in the document. What you add
  to a `div` you gave a role to.
- `tabindex="-1"` — takes it out of the sequence but leaves it focusable from script, so `.focus()`
  works. How you send focus somewhere the user cannot Tab to.
- A positive value — jumps the element ahead of everything with `tabindex="0"`, ordered by number,
  across the whole document. MDN's advice is flat: "You are recommended to only use 0 and -1 as
  tabindex values."

Reachable is half of it. Three things break the other half, and they are separate bugs with separate
fixes.

### Focus you cannot see

`:focus` matches whenever an element has focus, mouse click included, which is why a designer asks
for the ring to go and somebody writes `button:focus { outline: none }`. `:focus-visible` matches
only when the browser's heuristics say the user needs telling where focus is, which in practice
means keyboard. In MDN's words, it "allows authors to change the appearance of the focus indicator
without changing when the focus indicator appears". A visible keyboard focus indicator is WCAG
success criterion 2.4.7, level AA. `:focus-visible` has been Baseline widely available since March 2022.

### Focus that escapes something modal

A modal owes the keyboard four things: focus moves into it on open, Tab and Shift+Tab cycle inside
it while it is open, Escape closes it, and focus returns to whatever opened it. There is a fifth for
screen readers, which is that the content behind it has to be inert, or the reading cursor wanders
into a page the user cannot reach.

`<dialog>` opened with `showModal()` is all five, from the platform. It renders in the top layer,
above everything else regardless of `z-index`. Every element in the document except the dialog and
its descendants becomes inert, "as if the `inert` attribute is specified", which means unfocusable,
unclickable and out of the accessibility tree. Escape is a close request: it fires `cancel`, then
closes the dialog if nothing cancelled it. And the spec stores the element that was focused
beforehand as the "previously focused element", then focuses it again on close.

`show()` opens the same element non-modally and gives you none of that. The page behind stays live
and Escape does nothing, which is the same bet as everywhere else in
[what the platform gives you](./what-the-platform-gives-you.md): the element is doing work you would
otherwise write, until you call the method that switches it off.

Say where focus should land with `autofocus`, on "the element the user is expected to interact with
immediately upon opening a modal dialog". Do not put `tabindex` on the `<dialog>` itself; its
contents take focus, not it.

### Focus that gets lost

The third one gets forgotten because nobody writes it. Delete the row whose button you just pressed,
or swap the view on a client-side navigation, and the element holding focus stops existing. The APG
is blunt about what happens next: if you do not move focus deliberately, "browsers move focus to the
body element, effectively causing a loss of focus within the user interface". Nothing is
highlighted, and the user's place in the page is gone.

So pick the destination before you remove the source: the next row, the list that contained it, or
the heading of whatever you navigated to, with `tabindex="-1"` so it can take focus without joining
the tab sequence. Tab order is not the whole picture either, because screen reader users move
through [landmarks and headings](./landmarks-and-headings.md) rather than tabbing everything.

Not every keyboard interaction moves focus. In the autocomplete workout the arrow keys move a
highlight through the listbox while DOM focus never leaves the input, and `aria-activedescendant` is
what says which option is active: "the browser keeps the DOM focus on the container element or on an
input element that controls the container element."

## Worked example

A confirm dialog that behaves, in the amount of code the platform actually needs:

```html
<button id="delete">Delete project</button>

<dialog id="confirm">
  <p>Delete this project? This cannot be undone.</p>
  <button id="cancel" autofocus>Cancel</button>
  <button id="ok">Delete</button>
</dialog>

<script>
  const dialog = document.querySelector('#confirm');

  document.querySelector('#delete').addEventListener('click', () => dialog.showModal());
  document.querySelector('#cancel').addEventListener('click', () => dialog.close('cancel'));
  document.querySelector('#ok').addEventListener('click', () => dialog.close('ok'));

  dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'ok') deleteProject();
  });
</script>
```

Nothing there traps Tab, hides the background from a screen reader, handles Escape or remembers the
delete button. All four arrive with `showModal()`, and all four leave if you change that one call to
`show()`.

The removal case has no platform equivalent, so it is the one you write. Choose the next focus
target while the current one still exists:

```js
function deleteRow(row) {
  const sibling = row.nextElementSibling ?? row.previousElementSibling;
  const next = sibling?.querySelector('button') ?? list; // list carries tabindex="-1"

  row.remove();
  next.focus();
}
```

## Traps

**The design looks clean and nobody can tell where they are.** `outline: none` with nothing in its
place is the most common accessibility regression in a codebase, and it is invisible to everyone
testing with a mouse. Keep the reset on `:focus` if the click ring is what the designer objected to,
then draw your own on `:focus-visible`, with `outline-offset` so the ring sits outside the element
rather than on its edge.

**Tab out of the last button in your modal and you are in the page behind it.** A modal built from
divs has no trap, because the document behind it never stopped being tabbable. `showModal()` ends
that by making everything else inert. Hand-rolled, you own all of it: the wrap at both ends, `inert`
on the background, and Escape. `inert` has been Baseline widely available since April 2023.

**You close the dialog and nothing is focused.** Focus was inside it, the dialog went away, and
nothing put focus back, so it fell to `<body>`. The next Tab then starts wherever the browser
decides rather than where the user was. Capture `document.activeElement` before you open and
`.focus()` it on close, or use `showModal()`, which already does.

**One field jumps to the front of the whole form.** A positive `tabindex` is not scoped to the
component that declares it. It orders against every other positive value in the document and comes
before everything with `tabindex="0"`, so a `tabindex="3"` inside one card reorders the page. Delete
it and move the element in the markup instead.

**Focus is visible and still says nothing.** Landing on an icon button announces its accessible
name, and if there is no name there is nothing to announce, which is
[the accessible name](./the-accessible-name.md) problem rather than this one.
