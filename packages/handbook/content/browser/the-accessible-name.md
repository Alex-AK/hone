---
title: The accessibility tree, and where a name comes from
question: My button works. Why does a screen reader call it "button"?
order: 3
practise:
  - a11y-div-button
  - a11y-icon-button-name
  - a11y-label-input
  - a11y-alt-decorative
  - html-table-caption-scope
sources:
  - author: W3C
    title: Accessible Name and Description Computation 1.2
    url: https://www.w3.org/TR/accname-1.2/
  - author: W3C WAI
    title: Providing Accessible Names and Descriptions
    url: https://www.w3.org/WAI/ARIA/apg/practices/names-and-descriptions/
  - author: W3C WAI
    title: Button Pattern
    url: https://www.w3.org/WAI/ARIA/apg/patterns/button/
  - author: W3C
    title: ARIA in HTML
    url: https://www.w3.org/TR/html-aria/
  - author: W3C WAI
    title: 'Understanding Success Criterion 2.5.3: Label in Name'
    url: https://www.w3.org/WAI/WCAG22/Understanding/label-in-name
  - author: MDN
    title: Accessibility tree
    url: https://developer.mozilla.org/en-US/docs/Glossary/Accessibility_tree
  - author: MDN
    title: 'ARIA: generic role'
    url: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/generic_role
  - author: MDN
    title: tabindex
    url: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/tabindex
  - author: MDN
    title: title global attribute
    url: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/title
  - author: MDN
    title: '<label>: The Label element'
    url: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/label
  - author: MDN
    title: '<img>: The Image Embed element'
    url: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/img
  - author: MDN
    title: '<caption>: The Table Caption element'
    url: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/caption
  - author: MDN
    title: '<th>: The Table Header element'
    url: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/th
verified: 2026-08-01
---

A screen reader does not see your page. It reads a summary the browser builds from it, where every
control has a kind, such as button or link, and a name, which is the word it is called aloud. The
name is worked out from your markup by fixed rules, and when those rules find nothing, the control
is announced as its kind alone, with no hint of what it does.

## The model

**A screen reader never reads your markup. It reads the accessibility tree the browser builds from
the DOM**, which MDN describes as the representation platform accessibility APIs hand to assistive
technology. Every node in it has four properties: a role (what kind of thing it is), a name (what to
call it), a description (anything worth adding beyond the name) and states (checked, expanded,
disabled). Your markup sets all four, and usually it sets them without you writing anything.

Role comes from the element: `<button>` has the `button` role, `<a href>` has `link`,
`<input type="checkbox">` has `checkbox`. The `role` attribute overrides that mapping, and ARIA in
HTML recommends against setting `role` or `aria-*` to values that match the implicit semantics, so
`role="button"` on a `<button>` is noise. `<div>` and `<span>` map to `generic`, which MDN describes
as a nameless container with no semantic meaning of its own. Nameless is literal there:
`aria-label` and `aria-labelledby` are prohibited on it.

The name is computed, in a specified order. Accessible Name and Description Computation 1.2 checks
these in turn:

1. `aria-labelledby`, if it contains at least one valid id reference.
2. `aria-label`.
3. The host language's own mechanism: a `<label>` for a form control, `alt` on an `<img>`,
   `<caption>` on a `<table>`.
4. The element's own text content, if its role allows name from content. Buttons and links do; a
   text input does not.
5. A tooltip attribute, meaning `title`. The spec is exact about when: "Tooltip attributes are used
   only if nothing else, including subtree content, has provided results."

The first step that produces something wins, so `aria-label` overrides the visible text below it
without any visible sign. And when nothing matches, the name is empty. That is the commonest naming
bug by a distance: a control with a role and no name, announced as its role and nothing else.

`title` sits last for a reason. MDN calls its use highly problematic for touch-only, keyboard and
assistive technology users, among others, and says its main accessible use is labelling `<iframe>`
elements. Everywhere else it buys you a tooltip a mouse user might find.

Description is a separate property: `aria-describedby` adds detail on top of a name and never
supplies one. States are the properties that change while the page is open, and getting a change
noticed is [its own problem](./announcing-change.md).

## Worked example

An icon-only close button, which is the shortest route to an empty name:

```html
<button onclick="close()">
  <svg viewBox="0 0 16 16">…</svg>
</button>
```

Walk the steps. No `aria-labelledby`. No `aria-label`. `button` has no native naming attribute of its
own, since `alt` belongs to `<img>`. Name from content finds an `<svg>` that contributes no text. No
`title`. The name is the empty string, so all the screen reader has is the role: "button".

Two fixes, at two different steps:

```html
<!-- step 2: the name is the attribute -->
<button aria-label="Close" onclick="close()">
  <svg aria-hidden="true">…</svg>
</button>

<!-- step 4: the name is the text content -->
<button onclick="close()">
  <svg aria-hidden="true">…</svg>
  <span class="sr-only">Close</span>
</button>
```

The second is usually the better one. Visually hidden text is real text, so it gets translated, it
survives a stylesheet that failed to load, and it is a word the user can see and say. Either way,
`aria-hidden="true"` on the decorative `<svg>` keeps its contents out of the tree.

Tables are named at step 3, and this is the case nobody files under naming:

```html
<table>
  <caption>
    Revenue by customer, Q1
  </caption>
  <thead>
    <tr>
      <th scope="col">Customer</th>
      <th scope="col">Orders</th>
      <th scope="col">Revenue</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th scope="row">Acme</th>
      <td>12</td>
      <td>4300</td>
    </tr>
  </tbody>
</table>
```

`<caption>` is the table's accessible name, and it has to be the `<table>`'s first child. `scope`
defines which cells a header relates to, taking `col`, `row`, `colgroup` or `rowgroup`. That
association turns "12" into "Orders, 12" as the user moves across the row. Leave `scope` off and the
browser guesses, and one attribute removes the guess.

## Traps

**The Save button works with a mouse and cannot be reached with a keyboard.** `<div class="btn"
onclick="save()">Save</div>` is missing four things: it is not in the tab order, it does not
activate on Enter or Space, it has no role, and `generic` cannot carry a name. Adding
`role="button"` supplies the role, and the name follows, because that role takes its name from
content. The keyboard is untouched: you still owe `tabindex="0"`, a keydown handler for both keys
the button pattern specifies, and focus styling to match. MDN warns that interactive components
built from non-interactive elements are not listed in the accessibility tree. Use the element that
has all of it already; more in [which element means this](./which-element-means-this.md), and on the
tab order in [focus](./focus.md).

**A screen reader announces "button" and stops.** The control is an icon with a click handler and
nothing else, so every step of the computation came back empty. `aria-label` on the button, or
visually hidden text inside it, gives it a name. `alt` will not, because there is no `<img>`.

**Clicking the word "Email" does not focus the field.** The `<label>` is next to the input but not
associated with it, and adjacency is not association. Either `for` carries the input's `id` or the
input is nested inside the label. MDN describes what association buys: clicking or tapping a label
passes focus to its input. The dead click is the symptom you can see; the input having no name is
the one you cannot. In JSX the attribute is `htmlFor`.

**A voice control user says "click Save" and nothing happens.** The markup is `<button
aria-label="Submit form">Save</button>`. `aria-label` is step 2 and the visible text is step 4, so
the word on screen is not the element's name. WCAG's Label in Name criterion requires that "the name
contains the text that is presented visually", so that speech-input users can navigate by speaking
the labels they see. When there is visible text, let it be the name.

**The screen reader reads the caption twice.** An `<img alt="Chart of quarterly revenue">` sits
under a caption already saying that. If the surrounding text carries the meaning, the image is
decorative, and `alt=""` says so. Empty is not the same as absent: with no `alt` at all, MDN says
some screen readers may announce the file name instead, and the user hears "chart-final-2 dot png".

**The report reads aloud as a stream of loose numbers.** "Acme, 12, 4300, 2", with no way to tell
which number is which. The header row is marked up with `<td>`, so there are no headers to pair the
cells with, and there is no `<caption>`, so there is no name to find the table by either. Use
`<th scope="col">` across the header row and `<th scope="row">` at the start of each data row.
