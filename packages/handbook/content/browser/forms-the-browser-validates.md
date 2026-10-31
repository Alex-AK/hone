---
title: Forms the browser already validates
question: How much of this validation do I actually have to write?
order: 10
practise:
  - forms-validation-both-sides
  - forms-required-vs-aria
  - forms-autocomplete-attribute
  - forms-normalize-input
  - html-fieldset-legend
sources:
  - author: WHATWG
    title: HTML Standard, 4.10.21 Constraints
    url: https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#constraints
  - author: MDN
    title: Using HTML form validation and the Constraint Validation API
    url: https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Constraint_validation
  - author: MDN
    title: ValidityState
    url: https://developer.mozilla.org/en-US/docs/Web/API/ValidityState
  - author: MDN
    title: HTMLInputElement.setCustomValidity()
    url: https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/setCustomValidity
  - author: MDN
    title: ':user-invalid'
    url: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/:user-invalid
  - author: MDN
    title: The autocomplete HTML attribute
    url: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/autocomplete
  - author: MDN
    title: '<input type="email">'
    url: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/email
  - author: MDN
    title: '<fieldset>'
    url: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/fieldset
  - author: MDN
    title: '<input type="radio">'
    url: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/radio
  - author: Sam Dutton
    title: Sign-in form best practices
    url: https://web.dev/articles/sign-in-form-best-practices
verified: 2026-08-01
---

Browsers can check a form before it is sent: that a field is filled in, that an email looks like an
email, that a number is in range. You switch this on with markup, and the browser blocks the submit
and shows the user what is wrong. It is a convenience and nothing more, because anyone can skip your
page and send whatever they like straight to the server.

## The model

Constraint validation is a feature the browser already ships, and most of it is attributes.
`required`, `type`, `pattern`, `min`, `max`, `minlength`, `maxlength` and `step` declare what a value
has to be. The browser checks them when the form is submitted, refuses the submit, and shows its own
message next to the first field that fails. None of that needs JavaScript, and it is the plainest case
of [what the platform gives you](./what-the-platform-gives-you.md).

Each attribute has a matching flag you can read. `element.validity` is a `ValidityState`, and its
properties map one to one onto the attributes: `valueMissing` for `required`, `typeMismatch` for
`type`, `patternMismatch` for `pattern`, `rangeUnderflow` and `rangeOverflow` for `min` and `max`,
`tooShort` and `tooLong` for `minlength` and `maxlength`, `stepMismatch` for `step`. On top of that,
`checkValidity()` returns a boolean and fires an `invalid` event, `reportValidity()` does the same and
shows the message, and `setCustomValidity(message)` replaces the message with yours. That last one has
a catch worth memorising: while the custom message is a non-empty string the element counts as
invalid, so you clear it with `setCustomValidity('')` on every pass, not only when you set it.

The state reaches CSS too. `:valid` and `:invalid` match from the first render, which is why styling
`:invalid` alone paints every empty required field red before anyone has typed a character.
`:user-invalid` is the one you want: it waits until the user has interacted with the control or tried
to submit. MDN puts it at Baseline, available across browsers since November 2023.

None of this is enforcement. Any of it can be deleted in devtools, and the request can be sent with
curl without your page being involved at all. So the server validates everything, every request, with
no exceptions and no "the form already checked it". Client-side validation exists to save the user a
round trip before being told their email is malformed. That is its entire job. MDN says it in a
warning on the email input page: "your site must not use this validation for any security purposes".

Two attributes near this that carry more weight than they look. Use `required`, not
`aria-required="true"`, on any element that supports it: the native attribute exposes the state to
assistive technology, turns on the validation above, and enables `:required` in CSS, while the ARIA
version does only the first. `aria-required` is for a custom widget that has no native equivalent.
And `autocomplete` takes tokens from a fixed vocabulary (`email`, `given-name`, `postal-code`,
`cc-number`, `one-time-code`), which the browser matches on instead of your `name`, so a field called
`zip_code_2` still fills. Filling it in correctly satisfies WCAG 2.2 success criterion 1.3.5, Identify
Input Purpose, and on a phone it is the difference between a checkout someone finishes and one they
abandon.

Normalise before you validate. Trim, case-fold, strip the formatting a user pasted in, then check the
result, or a perfectly good value gets rejected for a leading space. And wrap a radio group in a
`fieldset` with a `legend`, so the group has a question rather than three unexplained options. The
legend is announced with each control inside it, which the [accessible name](./the-accessible-name.md)
page covers.

## Worked example

The markup does most of it:

```html
<form action="/orders" method="post">
  <fieldset>
    <legend>Delivery speed</legend>
    <input type="radio" id="std" name="speed" value="standard" required />
    <label for="std">Standard</label>
    <input type="radio" id="exp" name="speed" value="express" />
    <label for="exp">Express</label>
  </fieldset>

  <label for="email">Email</label>
  <input id="email" type="email" name="email" required maxlength="254" autocomplete="email" />

  <button>Place order</button>
</form>
```

`required` on one radio makes the group required, and it does not have to be the one the user picks.
`type="email"` gets a `typeMismatch` and a matching keyboard on mobile. No JavaScript so far.

Style the state without shouting at someone mid-word:

```css
input:user-invalid {
  border-color: crimson;
}
```

Then normalise on blur, and replace the browser's wording where yours is more useful:

```js
email.addEventListener('blur', () => {
  email.value = email.value.trim().toLowerCase();
});

email.addEventListener('input', () => {
  const { valueMissing, typeMismatch } = email.validity;
  if (valueMissing) email.setCustomValidity('We need an address to send the receipt to.');
  else if (typeMismatch) email.setCustomValidity('That address is missing an @.');
  else email.setCustomValidity(''); // without this line the form never submits again
});
```

And on the server, the same rules again, because that is the only place they are actually rules.

## Traps

**The form refuses to submit and no field looks wrong.** `setCustomValidity` was called with a message
and never cleared. A non-empty custom message keeps the element invalid forever, whatever the value
now is, and it hides the real reason because your string replaced the browser's. Clear it with
`setCustomValidity('')` on every path where the field is fine, not only inside the branch that set it.

**Someone added `novalidate` and now nothing tells the user anything.** The attribute usually goes on
because the native bubbles look wrong, and then the replacement never gets built. `novalidate` only
turns off the browser's own reporting; the attributes are still in the markup and `checkValidity()`
and `validity` still tell you exactly what failed. Either render your own messages from them, and
[announce](./announcing-change.md) them, or take the attribute back off.

**A real address bounces off your regex.** A hand-written email pattern is a guess at a format you do
not control, and every character you leave out of it rejects a real person: plus-addressing, an
apostrophe in a surname, a top-level domain that did not exist when you wrote it. `type="email"`
applies a defined check instead, and MDN publishes the exact regex behind it. No pattern can prove an
address receives mail anyway; only sending to it does, and that is the server's job. Save `pattern`
for a format you do own, like an internal reference code.

**The password manager stopped filling the login form.** `autocomplete="off"` on a password field
fights the tool that makes unique passwords possible, which leaves people typing something they can
remember instead. MDN notes that most modern browsers ignore it on login fields for that reason. Use
`autocomplete="current-password"` on sign-in and `new-password` on sign-up and password change, which
is what tells the browser which one to offer.
