---
title: Submitting a form
question: What actually happens when this form submits, and what do I owe it?
order: 11
practise:
  - forms-prevent-default-submit
  - forms-formdata-serialize
  - forms-file-upload-type
  - forms-optimistic-double-submit
  - react-controlled-input
  - forms-controlled-value-null
  - forms-debounce-validation
  - form-errors-react
sources:
  - author: WHATWG
    title: HTML Standard, 4.10.22.2 Implicit submission
    url: https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#implicit-submission
  - author: MDN
    title: HTMLFormElement, the submit event
    url: https://developer.mozilla.org/en-US/docs/Web/API/HTMLFormElement/submit_event
  - author: MDN
    title: '<form>'
    url: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/form
  - author: MDN
    title: FormData
    url: https://developer.mozilla.org/en-US/docs/Web/API/FormData
  - author: MDN
    title: Event.currentTarget
    url: https://developer.mozilla.org/en-US/docs/Web/API/Event/currentTarget
  - author: MDN
    title: Using FormData objects
    url: https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest_API/Using_FormData_Objects
  - author: react.dev
    title: '<input>'
    url: https://react.dev/reference/react-dom/components/input
verified: 2026-08-01
---

## The model

A form submit is a navigation. The browser serialises every named control, builds a request from
`action`, `method` and `enctype`, and replaces the page with the response. That behaviour predates
JavaScript and is still what happens when nothing cancels it, which is the whole explanation for a
single-page app form that reloads and loses its state.

You cancel it in the `submit` event, on the form, not in a click handler on the button. The event
fires for three things: a submit button being activated, the user pressing Enter while editing a
field (the spec calls this implicit submission), and a script calling `form.requestSubmit()`. It does
not fire for `form.submit()`. The distinction matters because a click handler catches exactly one of
those three, and typing an address then hitting Enter is how a lot of people submit a form.

Once the submit is yours, `new FormData(form)` reads the current value of every control that has a
`name`, and only those, which is the usual reason a field mysteriously never arrives.
`Object.fromEntries(formData)` gives a plain object and keeps the last value of any repeated name, so
checkbox groups and multi-selects need `formData.getAll(name)` instead. An unchecked checkbox is
absent from the set rather than `false`, so give the boolean a default rather than reading it off the
object.

Files change the encoding. A form carrying a file needs `enctype="multipart/form-data"`, which splits
the body into parts separated by a generated boundary string, and the `Content-Type` header has to
carry that exact boundary. With `fetch`, pass the `FormData` as the body and set no `Content-Type` at
all: the browser serialises it as multipart and writes the header with the boundary it used. MDN is
blunt about this, warning you not to set the header explicitly, because doing so "will prevent the
browser from being able to set the `Content-Type` header with the boundary expression".

The second click is the other thing a submit handler owes you. A user who double-clicks gets a second
request in flight before the first response lands, and two orders. Disable the button while the
request is running. Debouncing is the wrong tool here: it delays the submit rather than deduplicating
it, and a delay someone can out-wait is not a guarantee. Neither is disabling, come to that. A retry
on a flaky connection, a refresh mid-request or a second tab all produce a second request without a
second click, so the real protection is on the server, as an idempotency key or a unique constraint.
Debounce the availability check that runs while someone types. Never debounce the submit.

In React, one extra rule. react.dev puts it as: "A controlled component should always receive a string
`value`, not `null` or `undefined`." `value={user.name}` where `name` is sometimes missing means React
owns the input on some renders and the DOM owns it on others, and the switch is where the warning and
the lost keystrokes come from. The fix react.dev gives is `value={someValue ?? ''}`. Use `??` rather
than `||`, so a real empty string or zero survives. Whether that value needs to be in state at all is
the [where state lives](../react/where-state-lives.md) question, and `FormData` is often the answer
that removes it.

## Worked example

One handler carrying all of it:

```jsx
function OrderForm({ user }) {
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault(); // otherwise the page navigates
    const body = new FormData(event.currentTarget); // read it before any await
    setSubmitting(true);
    try {
      await fetch('/api/orders', { method: 'POST', body }); // no Content-Type header
    } finally {
      setSubmitting(false); // runs on failure too
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="name">Name</label>
      <input id="name" name="name" value={user.name ?? ''} onChange={onChange} />

      <label htmlFor="receipt">Receipt</label>
      <input id="receipt" name="receipt" type="file" />

      <button type="submit" disabled={submitting}>
        {submitting ? 'Placing order' : 'Place order'}
      </button>
    </form>
  );
}
```

Four decisions are load-bearing there. `onSubmit` on the form means Enter works. `FormData` is built
before the `await`, because `currentTarget` is only set while the handler is running and reads as
`null` outside it. The `fetch` sets no headers at all, so the file survives. And `setSubmitting(false)`
is in a `finally`, so a failed request gives the button back.

The form's own validation is a separate subject, covered in
[forms the browser already validates](./forms-the-browser-validates.md).

## Traps

**Pressing Enter submits the form and your code never runs.** The handler is on the button's `click`,
so it only fires for a real click, while Enter in a text field triggers implicit submission straight
past it. The page then navigates, which looks like a random reload. Move the handler to the form's
`submit` event, where every route into a submission arrives.

**The upload arrives at the server with no file.** A hand-written
`headers: { 'Content-Type': 'multipart/form-data' }` on a `FormData` request overwrites the header the
browser was going to generate and drops the boundary with it, so the server cannot split the body into
parts and reports the file as missing rather than as a parse error. Delete the header. This is one of
the few requests that is more correct with fewer headers set.

**The button says "Saving" forever.** It was disabled on submit and re-enabled only in the success
path, so the first failed request leaves the form unusable with no way back except a reload. Re-enable
in a `finally`. Disabling also takes the button out of the tab order while the request runs, so think
about where that leaves [focus](./focus.md).

**React warns that the input switched between controlled and uncontrolled, and what was typed
disappears.** The `value` prop arrived as `undefined`, almost always an optional field missing from an
object that was fetched after the first render. `value={user.name ?? ''}` pins it controlled from the
first render on.
