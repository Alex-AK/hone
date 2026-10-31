---
title: The DOM API's sharp edges
question: Which of these DOM methods does not do what its name suggests?
order: 13
practise:
  - dom-queryselectorall-type
  - dom-dataset
  - dom-classlist-toggle
  - dom-intersection-observer
  - dom-localstorage-json
  - dom-innerhtml-xss
sources:
  - author: MDN
    title: Document.querySelectorAll()
    url: https://developer.mozilla.org/en-US/docs/Web/API/Document/querySelectorAll
  - author: MDN
    title: Document.getElementsByClassName()
    url: https://developer.mozilla.org/en-US/docs/Web/API/Document/getElementsByClassName
  - author: MDN
    title: Document.getElementsByTagName()
    url: https://developer.mozilla.org/en-US/docs/Web/API/Document/getElementsByTagName
  - author: MDN
    title: HTMLElement.dataset
    url: https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/dataset
  - author: MDN
    title: DOMTokenList.toggle()
    url: https://developer.mozilla.org/en-US/docs/Web/API/DOMTokenList/toggle
  - author: MDN
    title: Intersection Observer API
    url: https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API
  - author: MDN
    title: Storage.setItem()
    url: https://developer.mozilla.org/en-US/docs/Web/API/Storage/setItem
  - author: MDN
    title: JSON.stringify()
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify
  - author: MDN
    title: Element.innerHTML
    url: https://developer.mozilla.org/en-US/docs/Web/API/Element/innerHTML
  - author: MDN
    title: Node.textContent
    url: https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent
  - author: MDN
    title: Element.insertAdjacentHTML()
    url: https://developer.mozilla.org/en-US/docs/Web/API/Element/insertAdjacentHTML
  - author: MDN
    title: Element.setHTML()
    url: https://developer.mozilla.org/en-US/docs/Web/API/Element/setHTML
  - author: MDN
    title: HTML Sanitizer API
    url: https://developer.mozilla.org/en-US/docs/Web/API/HTML_Sanitizer_API
  - author: OWASP
    title: DOM based XSS Prevention Cheat Sheet
    url: https://cheatsheetseries.owasp.org/cheatsheets/DOM_based_XSS_Prevention_Cheat_Sheet.html
verified: 2026-08-01
---

The browser's built-in functions for finding and changing parts of a page were added piece by piece
over many years, and several of them do not quite do what their names suggest. One hands back
something that looks like a list but lacks most list operations, another changes under you while you
loop over it, and one turns any text you give it into live page content, which is how an attacker
gets a script into someone else's page.

## The model

**Several of the DOM calls you make every day return something subtly different from what their
names suggest, and that gap is where the bugs live.**

**`querySelectorAll` gives you a `NodeList`, not an array.** It is static, in document order, and
iterable, and it has `forEach`: the one array method that makes you assume the rest are there.
`map`, `filter`, `reduce`, `find` and `slice` are all absent. `[...nodes]` or `Array.from(nodes)`
gets you a real array.

**`getElementsByClassName` gives you a live `HTMLCollection`.** MDN warns that DOM changes show up
in it as they happen, and an element that stops matching is removed from it automatically. Live is
useful when you want a count that stays current. It goes wrong in a loop that edits the DOM, because
the collection shrinks while the index climbs.

**`dataset` renames your attributes.** It drops the `data-` prefix, then removes each dash followed
by a lowercase ASCII letter and uppercases that letter, so `data-order-id` is `dataset.orderId`.
Every value is a string, in both directions: assigning `null` writes `data-example="null"`, and
`data-count="0"` reads back as `"0"`, which is truthy.

**`classList.toggle` takes a second argument.** With `force`, `true` only adds and `false` only
removes. That is the if/else you were about to write, and it is idempotent. It also touches one
class, where `className =` replaces the attribute.

**`IntersectionObserver` replaces the scroll handler rather than tidying it.** The old approach
called `getBoundingClientRect()` from event handlers and loops on the main thread, and MDN notes
that even one of those can cause performance problems, because reading that geometry forces layout.
The observer reports asynchronously instead. `rootMargin` grows or shrinks the root's box before
intersections are computed, so you can start loading before the element is on screen; `threshold`
sets how much has to be visible.

**`localStorage` holds strings and nothing else.** MDN says it only stores and retrieves strings, so
an object round-trips through `JSON.stringify` and `JSON.parse` and comes back missing everything
JSON cannot represent. A `Date` goes in as an object and comes back as an ISO string, a `Map` or a
`Set` becomes `{}`, and a property whose value is `undefined` is omitted.

### innerHTML is the one that is a vulnerability

The others are surprises; this one is an attack surface. Assigning a string to `innerHTML` parses it
as HTML and replaces all the element's descendants with the result, so any markup in user-controlled
text becomes real elements. MDN calls it "probably the most common vector for cross-site scripting
(XSS) attacks". Injected `<script>` elements do not run, which is the detail that makes people think
they are safe, and it protects nothing. MDN's own example:

```js
const name = "<img src='x' onerror='alert(1)'>";
el.innerHTML = name; // shows the alert
```

`textContent` is the fix nearly every time, and OWASP puts it first as the most fundamental safe way
to put untrusted data into the DOM. Nothing is parsed, so markup is impossible by construction
rather than by escaping. MDN adds that it is faster, because `innerHTML` has to invoke the HTML
parser.

When the content really is HTML, `Element.setHTML()` parses and sanitizes in one step, stripping
`<script>`, `<iframe>`, `<object>` and event handler attributes. As of this page's verified date,
MDN marks both it and the HTML Sanitizer API limited availability, not Baseline, so feature-detect
it rather than reaching for it by default.

## Worked example

Each one-liner, with the version people write instead:

```js
const rows = document.querySelectorAll('tr[data-order-id]');
rows.map((r) => r.dataset.orderId); // TypeError: rows.map is not a function
[...rows].map((r) => r.dataset.orderId); // ['42', '43']

row.dataset.orderId; // '42', from <tr data-order-id="42">
Number(row.dataset.orderId); // 42, because dataset values are strings

el.classList.toggle('active', isActive); // adds when true, removes when false
el.className = isActive ? 'active' : ''; // and every other class is gone

el.innerHTML = comment; // any markup in the string becomes real elements
el.textContent = comment; // characters, never markup
```

Visibility, without touching the main thread on every frame:

```js
const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      load(entry.target);
      observer.unobserve(entry.target); // it has done its job
    }
  },
  { rootMargin: '200px' } // start loading before it is on screen
);

images.forEach((img) => observer.observe(img));
```

And the storage round trip, with the read guarded on both counts:

```js
localStorage.setItem('prefs', JSON.stringify({ theme: 'dark', seenAt: new Date() }));

const raw = localStorage.getItem('prefs'); // null if the key is missing
const prefs = raw ? JSON.parse(raw) : {}; // and JSON.parse throws on anything that is not JSON

typeof prefs.seenAt; // 'string'. The Date did not survive
```

## Traps

**`nodes.map is not a function`, on a thing you can already `forEach`.** `querySelectorAll` returned
a `NodeList`, which has `forEach` and none of the other array methods. Spread it or use `Array.from`
at the query, so the rest of the function works with an array.

**Half the elements were skipped, and running it twice finished the job.** The loop is over a live
`HTMLCollection` from `getElementsByClassName` or `getElementsByTagName`, and removing the class
removes the element from the collection mid-iteration, so `i++` steps over its replacement. Snapshot
it first with `[...els]`, or use `querySelectorAll`, which is static.

**Reading the attribute gives `NaN`, or `id is not defined`.** `row.dataset.user-id` parses as
`row.dataset.user - id`, arithmetic on two things that do not exist. `row.dataset.userid` fails more
quietly, because the mapping camel-cases rather than flattening: `data-user-id` is `dataset.userId`
and nothing else. When the attribute name is dynamic, `getAttribute('data-user-id')` sidesteps the
question.

**The stored value reads back as the literal string `[object Object]`.** `localStorage.setItem` got
an object and coerced it, with no error. `JSON.stringify` on the way in, `JSON.parse` on the way
out, and guard both ends of the read: `getItem` gives `null` for a missing key, and `JSON.parse`
throws on anything that is not JSON.

**Every input in the panel went blank and the buttons stopped responding.** Something did
`el.innerHTML += '<li>…</li>'`, which reads the subtree out as a string, discards it, and parses the
string back into new elements. Every listener on the old ones is gone, and every value a user had
typed but not submitted goes with them. `insertAdjacentHTML` "does not reparse the element it is
being used on, and thus it does not corrupt the existing elements inside that element", and `append`
with a real node is better still.

**The comment field runs JavaScript.** The value went to `innerHTML`, so `<img src=x onerror=…>` in
a comment executes for everyone who loads the page: stored XSS in one assignment. `textContent` is
the fix, with no escaping, no allowlist and no dependency. Reach for a sanitizer only when the
requirement really is user-authored HTML, and check its support before you ship it.
