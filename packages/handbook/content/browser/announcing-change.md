---
title: Announcing what changed
question: The page updated without a reload. How does anyone who is not watching it find out?
order: 5
practise:
  - a11y-aria-live
  - a11y-form-error-association
  - a11y-contrast-ratio
  - a11y-reduced-motion
  - form-errors-react
sources:
  - author: MDN
    title: ARIA live regions
    url: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions
  - author: MDN
    title: 'ARIA: alert role'
    url: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/alert_role
  - author: MDN
    title: 'ARIA: status role'
    url: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/status_role
  - author: MDN
    title: aria-invalid
    url: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-invalid
  - author: MDN
    title: prefers-reduced-motion
    url: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion
  - author: W3C
    title: 'Understanding Success Criterion 1.4.3: Contrast (Minimum)'
    url: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
  - author: W3C
    title: 'Understanding Success Criterion 1.4.11: Non-text Contrast'
    url: https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
  - author: W3C
    title: 'Understanding Success Criterion 1.4.1: Use of Color'
    url: https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html
  - author: W3C WAI
    title: 'Forms tutorial: User notifications'
    url: https://www.w3.org/WAI/tutorials/forms/notifications/
verified: 2026-08-01
---

When part of a page changes without a reload, such as a confirmation or an error appearing, a screen
reader user hears nothing unless the page has marked that spot as one to watch. Sighted users notice
the change, but often only by its colour or its movement, and those carry obligations of their own:
enough contrast, a signal besides colour, and less motion for people who have asked their system for
it.

## The model

**A screen reader reads the page once, then reads whatever the user moves to, and nothing else.**
When a fetch resolves and a component swaps some text in, no navigation happened and focus did not
move, so there is no reason to look again.

A live region is the standing instruction to look again. Put `aria-live` on an element and assistive
technology watches it: when the contents change, the new contents are announced, wherever the user
is at the time.

`polite` queues the announcement until the user is idle. `assertive` interrupts whatever is being
spoken. Polite is right nearly every time, because "Changes saved" and "3 results" are not worth
cutting off a sentence someone is halfway through. Assertive is for something they have to handle
now: a session about to expire, a payment that failed while they carried on filling in the form. MDN
puts the same rule on the assertive shorthand, which "must be used sparingly and only in situations
where the user's immediate attention is required".

**The region has to exist before the message does.** MDN's instruction is to start with an empty
live region and change its content in a separate step. Rendering
`{error && <p aria-live="polite">{error}</p>}` adds the attribute and the text in one commit, and
usually announces nothing, because there was no region there to have changed. Render the container
unconditionally and put only the text behind the condition.

Two roles are the shorthand, and they say what the region is as well as that it talks.
`role="status"` carries an implicit `aria-live="polite"`; `role="alert"` carries an implicit
`aria-live="assertive"`. Both are implicitly `aria-atomic="true"`.

`aria-atomic` decides how much gets read back. The default is `false`, meaning only the nodes that
actually changed, so a region reading "Saved 17:33" whose clock ticks over announces "34" and
nothing else. `aria-atomic="true"` re-reads the region in full. That is right for a one-line status
and wrong for a log, where you would hear every earlier entry again.

**The same idea, one level out.** A live region respects what someone can perceive. Two other things
respect how they have already told the machine to behave.

`prefers-reduced-motion` reads a setting the operating system already exposes, and takes two values,
`no-preference` and `reduce`. The word is reduce: MDN describes the preference as asking for an
interface that removes, reduces or replaces motion-based animation. Large travel is the trigger,
parallax and sliding panels and zooms, not a short fade. Swap the movement for a crossfade or
shorten it. Deleting every transition instead leaves state changes with no continuity, which reads
as a glitch.

Contrast is the one people approximate. All three are WCAG 2.2, and the
first two are Level AA:

- **1.4.3 Contrast (Minimum)** — text needs a contrast ratio of at least 4.5:1 against its
  background, or 3:1 if it is large-scale, meaning at least 18 point, or 14 point bold.
- **1.4.11 Non-text Contrast** — 3:1 for what you need to see to identify user interface components
  and their states, and for the parts of a graphic you need in order to understand it. Input
  borders, focus rings, toggle states, chart series.
- **1.4.1 Use of Color** (Level A) — "Color is not used as the only visual means of conveying
  information, indicating an action, prompting a response, or distinguishing a visual element."

A validation error is all of this at once. It is a change nobody navigated to, it is a state the
field itself has to carry, and it is drawn in red. `aria-describedby` on the input, pointing at the
id of the message, makes the message part of what is announced with the field. It is a description
on top of the field's name, not a replacement for it, so the input still needs a real label: see
[the accessible name](./the-accessible-name.md). `aria-invalid="true"` announces the state itself;
it defaults to `false` and has to be cleared when the field is fixed, or it lies. Then move focus to
the first failing field, which gives a keyboard user somewhere to start and is covered in
[focus](./focus.md).

## Worked example

A save indicator that is in the tree from the first render, with only its text conditional:

```jsx
// role="status" is already aria-live="polite", so there is nothing to repeat.
function SaveStatus({ message }) {
  return (
    <p role="status" className="sr-only">
      {message}
    </p>
  );
}

// mounted with message="" all along; this is the change that gets announced
setMessage('Changes saved');
```

An error on a field, wired to it in both directions:

```html
<label for="email">Email</label>
<input id="email" name="email" aria-invalid="true" aria-describedby="email-error" />
<p id="email-error" class="field-error">Enter an email address, including the @.</p>
```

```js
// on submit, after marking every failing field
form.querySelector('[aria-invalid="true"]')?.focus();

// and when the field is corrected
input.setAttribute('aria-invalid', 'false');
```

Focusing the first failure announces the label, the invalid state and the description together:
everything a sighted user got from the red border and the red text.

Reduced motion, keeping a transition rather than removing it:

```css
.drawer {
  transition: transform 240ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .drawer {
    transition: opacity 120ms ease; /* still a transition, just no travel */
  }
}
```

## Traps

**Nothing is announced, and the markup looks correct in the inspector.** The region and its message
arrived in the same render, so by the time assistive technology saw the element there was no change
to report. The inspector shows the end state, which is why this survives review. Keep the empty
container mounted and change only what is inside it.

**The screen reader talks over itself all the way through a form.** `role="alert"` or
`aria-live="assertive"` on a routine update means every autosave, every filter result and every
character counter cuts off whatever was being read. Assertive is for the thing that cannot wait
until the current sentence ends, which on most screens is nothing. Move it to `polite` or
`role="status"`.

**The only sign of the error is a red border.** That fails 1.4.1 for anyone with a colour vision
deficiency and conveys nothing to a screen reader, which is why the fix is text plus `aria-invalid`,
not a stronger red. The border has its own problem: as the thing that identifies the field's state,
it needs 3:1 under 1.4.11, and the pale hairline borders in most design systems do not have it. You
take all of this on when you replace [the browser's own form
validation](./forms-the-browser-validates.md).

**With reduced motion on, the interface started teleporting.** The usual blanket override sets
`animation-duration: 0.01ms !important` and `transition-duration: 0.01ms !important` on every
element, so drawers appear rather than open and nothing connects the before to the after. The
setting asks for less motion: keep a fade, keep the duration short, and drop only the movement that
travels across the screen.
