---
title: What the platform gives you free
question: Which of these components am I about to install a library for, and does the browser already have it?
order: 6
practise:
  - html-details-summary
  - html-dialog-showmodal
  - html-output-progress-meter
  - html-inputmode-keyboard
  - html-fieldset-legend
sources:
  - author: MDN
    title: The details disclosure element
    url: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/details
  - author: MDN
    title: The details-content pseudo-element
    url: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/::details-content
  - author: web.dev
    title: Details and summary
    url: https://web.dev/learn/html/details
  - author: MDN
    title: The dialog element
    url: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog
  - author: MDN
    title: The popover global attribute
    url: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/popover
  - author: MDN
    title: anchor-name
    url: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/anchor-name
  - author: MDN
    title: The output element
    url: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/output
  - author: MDN
    title: The progress indicator element
    url: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/progress
  - author: MDN
    title: The meter element
    url: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meter
  - author: MDN
    title: The webkit-progress-value pseudo-element
    url: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/::-webkit-progress-value
  - author: MDN
    title: The inputmode global attribute
    url: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/inputmode
  - author: MDN
    title: The enterkeyhint global attribute
    url: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/enterkeyhint
  - author: MDN
    title: The number input type
    url: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/number
  - author: MDN
    title: The fieldset element
    url: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/fieldset
  - author: MDN
    title: Customizable select elements
    url: https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms/Customizable_select
  - author: W3C Web Accessibility Initiative
    title: Grouping controls
    url: https://www.w3.org/WAI/tutorials/forms/grouping/
verified: 2026-08-01
---

A lot of the interface pieces people install a library for are already built into the browser: a
section that expands, a box that takes over the page, a pop-up hint, a progress bar. The built-in
versions handle the keyboard, focus, and what a screen reader announces. What the browser often
leaves to you is how they look, which takes CSS rather than a library.

## The model

**The browser already ships the behaviour of the common widgets, and what it does not always ship is
the appearance.** That behaviour is the open and closed state, the focus handling, the keyboard, and
the entry in the accessibility tree. Take it, write the CSS, and pay for a dependency only where the
platform genuinely stops.

**`<details>` and `<summary>` for a disclosure or an FAQ.** The browser owns the open state, the
expanded state it reports to assistive technology, and the keyboard. Give several the same `name`
and opening one closes the rest. It stops at
animation: the fix, `::details-content` with `transition-behavior: allow-discrete`, only became
available across browsers in September 2025.

**`<dialog>` with `showModal()` for anything modal.** One call gets you the top layer, above
everything whatever your z-index, the rest of the page inert, a stylable `::backdrop`, and Escape to
close. Focus moves into the dialog and returns to the opener afterwards, which is the part
hand-rolled modals get wrong; [focus](./focus.md) covers why. A `<form method="dialog">` inside
closes it without submitting and sets `returnValue` from the button pressed. Focus lands on the
first focusable element inside, usually the close button, so mark the control you meant with
`autofocus`.

**The `popover` attribute for the non-modal case**: a menu, a hint bubble, a toast. `popovertarget`
on a button wires the toggle with no script, and because the popover renders in the top layer, an
ancestor's `overflow: hidden` cannot clip it and z-index does not come into it. An `auto` popover is
light-dismissed by a click outside or Esc; a `manual` one stays until something closes it. It has
worked across the latest browser versions only since April 2024, so check your support floor. It
stops at position: the top layer puts the popover above the page, not beside its button. CSS anchor
positioning is the platform's answer, and `anchor-name` only reached the same newly-available status
in January 2026.

**`<output>`, `<progress>` and `<meter>` instead of three styled divs.**

- `<output>` — the result of a calculation over other controls. Its implicit role is `status`, and
  MDN notes that many browsers implement it as a live region, so a recalculated total is announced
  without focus moving. Its value is never submitted.
- `<progress>` — a task on its way to done. The minimum is always 0. Leave `value` off for the
  indeterminate bar.
- `<meter>` — a measurement inside a known range, such as disk usage. `low`, `high` and `optimum`
  say which part of the range is good.

The last two get swapped, and one is going somewhere while the other is not. All three stop at
appearance: restyling the bars means vendor pseudo-elements such as `::-webkit-progress-value`,
which MDN marks as non-standard.

**`inputmode` and `enterkeyhint` for the on-screen keyboard.** `inputmode` changes which keyboard
opens without touching the field's type, and `enterkeyhint` labels the enter key. Both are only
hints: MDN says `inputmode` enforces no validity requirements, so validation stays with `type` and
[the validation the browser already does](./forms-the-browser-validates.md). On a desktop with a
hardware keyboard nothing visible happens, which is most of why they are almost never set.

**`<fieldset>` and `<legend>` for a group of radios.** A `<label>` names one control, so three
labelled radios still have nothing saying what the question is. A fieldset's implicit role is
`group`, and its first `<legend>` child captions it. `disabled` on the fieldset disables every
control inside except those in the legend, which freezes a section of a form while a request is in
flight. It stops at layout, because a fieldset defaults to `min-inline-size: min-content` and
refuses to shrink in a flex or grid container until you override that. And the W3C forms tutorial
says screen readers read the legend with every control, once, or, rarely, not at all, so keep it
short and make each label make sense on its own.

Install something for a styled `<select>` with a custom drop-down, where MDN says
`appearance: base-select` is not Baseline; for a `<details>` that animates open on a support
floor older than late 2025; and for popover placement that flips to stay on screen, until anchor
positioning is old enough for your users.

## Worked example

A confirm dialog and a hint bubble, one script call between them:

```html
<button popovertarget="tips">Formatting tips</button>
<div id="tips" popover>Markdown works here. Two spaces make a line break.</div>

<dialog id="confirm">
  <form method="dialog">
    <p>Delete this invoice?</p>
    <button value="cancel">Cancel</button>
    <button value="delete" autofocus>Delete</button>
  </form>
</dialog>

<script>
  const dialog = document.querySelector('#confirm');
  dialog.showModal();
  dialog.addEventListener('close', () => report(dialog.returnValue));
</script>
```

The popover needs no JavaScript, and every behaviour in the dialog lives in `showModal()`.

Part of a checkout form, with no script at all:

```html
<fieldset>
  <legend>Shipping speed</legend>
  <input type="radio" id="std" name="shipping" checked />
  <label for="std">Standard</label>
  <input type="radio" id="ovn" name="shipping" />
  <label for="ovn">Overnight</label>
</fieldset>

<label for="qty">Quantity</label>
<input id="qty" type="number" min="1" value="2" />

<label for="code">Verification code</label>
<input id="code" type="text" inputmode="numeric" enterkeyhint="done" maxlength="6" />

<output name="total" for="qty">248.00</output>
<progress id="upload" max="100" value="62">62%</progress>
<meter id="disk" min="0" max="512" low="256" high="448" value="184">184 GB of 512 GB</meter>
```

The radios are announced under their question. The quantity gets a stepper; the code, a digit
string, gets a numeric keypad and a Done key. The total announces itself when it changes. [Which
element means this](./which-element-means-this.md) asks the same question about the rest of the
document.

## Traps

**The modal is open and the page behind it still takes clicks.** Escape does nothing either. It was
opened with `show()`, the non-modal dialog: no top layer, no inert background, no backdrop, no
Escape. The two calls look alike in a diff until someone clicks straight past your modal.

**A five-star rating rendered as a bar that never fills.** `<progress>` means a task heading for
completion, and a rating is not advancing towards anything. A value inside a fixed range is
`<meter>`, which also lets the browser colour it by `low`, `high` and `optimum`. The swap fails the
other way too: a `<meter>` standing in for an upload bar gives up the indeterminate state of a
`<progress>` with no `value`.

**The answer is in the FAQ and find-in-page walks straight past it.** It is inside a closed
`<details>`. web.dev's Learn HTML says Chrome and Edge expand a closed `<details>` to show a match,
and Firefox and Safari do not. If it has to be findable everywhere, ship that one open, or put the
searchable words in the summary.

**The verification code lost its leading zeros.** `type="number"` fixed the alphabetic keyboard on
mobile and brought the rest of its semantics along: stepper arrows, non-numbers marked invalid, and
a value read as a number. MDN says `number` "is not appropriate for values that happen to only
consist of numbers but aren't strictly speaking a number, such as postal codes in many countries or
credit card numbers". Keep `type="text"` and add `inputmode="numeric"`, which changes the keyboard
and nothing else.
