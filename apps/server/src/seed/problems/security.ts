import { code, md, type ProblemDraft } from './types';

export const securityProblems: ProblemDraft[] = [
  {
    slug: 'security-token-storage',
    title: 'Where to keep a session token',
    category: 'security',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'An app stores its session token in `localStorage` and attaches it to every request.',
      '',
      'Name the risk that choice creates and the storage that avoids it.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['xss', 'cross-site scripting', 'injected script', 'any script'],
          missingFeedback: 'What kind of attack can read localStorage?',
        },
        {
          synonyms: [
            'javascript can read',
            'readable',
            'accessible',
            'exfiltrat',
            'steal',
            'stolen',
          ],
          missingFeedback: 'Why is localStorage exposed to that attack?',
        },
        {
          synonyms: ['httponly', 'http-only', 'http only cookie', 'cookie'],
          missingFeedback: 'What storage is not readable from JavaScript?',
        },
      ],
      hints: [
        'Any script running on your origin can read localStorage, including an injected one.',
        'A single XSS then walks away with the token.',
        'An HttpOnly cookie is invisible to JavaScript.',
      ],
    },
    canonicalAnswer:
      'localStorage is readable by any JavaScript on the origin, so a single XSS can exfiltrate the token and the attacker has a session. Store it in an HttpOnly cookie instead, which JavaScript cannot read, with Secure and SameSite set.',
    solution: code(
      'text',
      'Set-Cookie: session=…; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600'
    ),
    explanation:
      'The trade is real rather than one-sided: `HttpOnly` cookies remove the XSS-reads-the-token path but are sent automatically, which reopens CSRF and is what `SameSite` is for. `SameSite=Lax` blocks the classic cross-site form post while keeping ordinary top-level navigation working. `localStorage` avoids CSRF but hands the token to any injected script, and XSS is by far the more common vulnerability. The honest summary: an HttpOnly, Secure, SameSite cookie is the better default, and neither option saves you if you have XSS.',
  },

  {
    slug: 'security-samesite-none-secure',
    title: 'The cookie the browser threw away',
    category: 'security',
    difficulty: 'easy',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      'An embedded widget needs the session cookie on cross-site requests, so the login route now',
      'sends:',
      '',
      code('http', 'Set-Cookie: session=abc123; HttpOnly; SameSite=None; Path=/'),
      '',
      'The header is right there in devtools and the cookie is not stored at all, with nothing logged',
      'and no error.',
      '',
      'Name the attribute whose absence makes the browser drop it.'
    ),
    graderConfig: {
      accept: ['secure', 'secure attribute', 'secure flag', 'the secure attribute'],
      acceptPatterns: ['\\bsecure\\b'],
      nearMisses: {
        domain:
          'Domain widens which hosts receive the cookie. It has no say in whether SameSite=None is allowed.',
        httponly: 'HttpOnly is already on the cookie, and it is unrelated to SameSite.',
        'samesite=lax':
          'Lax gets stored, and then the widget stops receiving the cookie, which is the problem you started with.',
      },
      hints: [
        'The cookie is not repaired and stored. It is refused whole, which is why nothing appears anywhere.',
        'SameSite=None means "send this on every cross-site request", and the specification refuses that promise over an unencrypted connection.',
        '`Secure`',
      ],
    },
    canonicalAnswer: 'Secure',
    solution: code('http', 'Set-Cookie: session=abc123; HttpOnly; Secure; SameSite=None; Path=/'),
    explanation:
      '`SameSite=None` and `Secure` ship together or not at all: the specification says to abort and ignore the cookie entirely unless the secure-only flag is set, so what you get is no cookie rather than a corrected one. The silence is the part worth remembering, because devtools shows you a `Set-Cookie` header that looks perfect while the cookie jar stays empty. The other `Set-Cookie` rejections behave the same way: a `__Host-` name sent with a `Domain` attribute or a `Path` other than `/`, and `Secure` over plain `http` on any host that is not localhost. Note what `Secure` does and does not buy once it is there. It constrains the transport, so the cookie never rides a plaintext request, and it says nothing about who can read the value once it arrives, which is `HttpOnly`.',
  },

  {
    slug: 'security-xss-source',
    title: 'The rendering call that trusts too much',
    category: 'security',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'short-text',
    prompt: md(
      'A comment body from the database is rendered like this:',
      '',
      code('js', 'el.innerHTML = comment.body;'),
      '',
      'Name the property that renders it as text instead.'
    ),
    graderConfig: {
      accept: ['textcontent', 'textcontent()', 'innertext', 'element.textcontent'],
      acceptPatterns: ['textContent', 'innerText'],
      nearMisses: {
        encodeuricomponent:
          'That is for URLs. It does not make HTML safe and mangles ordinary text.',
        escape: 'Escaping by hand is the thing textContent does correctly for you.',
      },
      hints: [
        'The safe property never parses its input as markup.',
        'It sets the text of the node and nothing else.',
        '`textContent`',
      ],
    },
    canonicalAnswer: 'textContent',
    solution: code(
      'js',
      'el.textContent = comment.body;',
      '',
      '// need real markup? sanitise, do not trust',
      'el.setHTML(comment.body); // or DOMPurify.sanitize before assigning'
    ),
    explanation:
      '`innerHTML` parses its input as markup, so any `<img onerror>` or `<script>` in the stored value runs with your origin’s privileges, which means the session, the cookies and the DOM. `textContent` never parses, so the same string appears as literal characters. The rule is to treat every value that has passed through a user as untrusted regardless of where it now lives, because the database is not a trust boundary. When you genuinely need rich text, sanitise with a maintained library rather than a regex, and set a Content-Security-Policy as a second line of defence.',
  },

  {
    slug: 'security-sql-injection',
    title: 'The query built by concatenation',
    category: 'security',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'short-text',
    prompt: md(
      'A search endpoint builds SQL from a query parameter:',
      '',
      code('js', "db.query(`SELECT * FROM users WHERE email = '${email}'`);"),
      '',
      'Name the fix.'
    ),
    graderConfig: {
      accept: [
        'parameterized query',
        'parameterised query',
        'parameterized queries',
        'prepared statement',
        'prepared statements',
        'placeholders',
        'bind parameters',
        'parameter binding',
      ],
      acceptPatterns: ['paramet(er|ri)[sz]ed', 'prepared statement', 'placeholder', 'bind'],
      nearMisses: {
        'escape the input': 'Hand-escaping is exactly what parameter binding does correctly.',
        'validate the input': 'Validation is worth doing, but it is not what makes the query safe.',
      },
      hints: [
        'The problem is that data becomes part of the statement.',
        'The database should receive the query and the values separately.',
        'Parameterised queries, also called prepared statements.',
      ],
    },
    canonicalAnswer: 'parameterized query',
    solution: code(
      'js',
      "db.query('SELECT * FROM users WHERE email = ?', [email]);",
      '',
      '-- the driver sends structure and data separately, so this is just a string:',
      '--   email = "\' OR 1=1 --"'
    ),
    explanation:
      'Concatenation lets input change the *structure* of the statement, which is the whole vulnerability. A parameterised query sends the statement and the values on separate channels, so a value can never become syntax no matter what it contains. Escaping by hand is the same idea implemented badly: it depends on getting every dialect quirk and every encoding right, and one miss is a breach. Query builders and ORMs parameterise by default, but their raw-SQL escape hatches do not, which is where this bug still appears in modern codebases.',
  },

  {
    slug: 'security-cors-not-auth',
    title: 'What CORS actually protects',
    category: 'security',
    difficulty: 'hard',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A team sets `Access-Control-Allow-Origin: *` on an internal API and calls it "open to our own apps only, since nobody knows the URL".',
      '',
      'Explain what CORS does and does not protect, and what is actually needed here.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['browser', 'in the browser', 'user agent', 'client-side', 'same-origin'],
          missingFeedback: 'Where is CORS enforced?',
        },
        {
          synonyms: ['curl', 'server', 'script', 'postman', 'directly', 'non-browser', 'bypass'],
          missingFeedback: 'Who is not affected by it at all?',
        },
        {
          synonyms: ['auth', 'authentic', 'authoris', 'authoriz', 'token', 'credential', 'session'],
          missingFeedback: 'What actually protects the endpoint?',
        },
      ],
      hints: [
        'CORS is a rule the browser enforces on behalf of the user.',
        'Anything that is not a browser ignores it entirely.',
        'An unauthenticated endpoint is public regardless of its CORS headers.',
      ],
    },
    canonicalAnswer:
      'CORS is enforced by the browser, and it exists to stop a page on one origin reading responses from another on the user’s behalf. It is not access control on the server: curl, a script or any non-browser client ignores the headers completely and gets the response. An endpoint with no authentication is public whatever its CORS policy says, so what is needed here is real authentication and authorisation on every request.',
    solution: code(
      'text',
      '# CORS says which *browser origins* may read the response',
      'Access-Control-Allow-Origin: https://app.example.com',
      '',
      '# authentication says who may have one at all',
      'Authorization: Bearer <token>   ->  401 without it, from any client'
    ),
    explanation:
      'CORS relaxes the same-origin policy, which is a protection for the *user* against a malicious page reading their authenticated responses from another site. It is not a server-side access control, and reasoning about it as one leads directly to open endpoints. Two follow-on details matter: `Access-Control-Allow-Origin: *` cannot be combined with credentials, and a preflight response that says yes is not an authorisation decision. Security by obscure URL is not security either, since URLs leak through logs, referrers and browser history.',
  },

  {
    slug: 'security-password-hashing',
    title: 'Storing a password',
    category: 'security',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      'A codebase stores `sha256(password)` and considers it hashed.',
      '',
      'Name a hashing algorithm actually designed for passwords.'
    ),
    graderConfig: {
      accept: ['bcrypt', 'argon2', 'argon2id', 'scrypt', 'pbkdf2'],
      acceptPatterns: ['bcrypt', 'argon2', 'scrypt', 'pbkdf2'],
      nearMisses: {
        sha512: 'Still a fast general-purpose hash. Speed is the problem.',
        md5: 'Much worse: fast and broken.',
      },
      closeSubstrings: {
        salt: 'A salt is necessary but not sufficient. The algorithm has to be slow too.',
      },
      hints: [
        'SHA-256 is designed to be fast, which is exactly wrong here.',
        'You want something deliberately slow and memory-hungry, with a tunable cost.',
        'bcrypt, scrypt or Argon2id.',
      ],
    },
    canonicalAnswer: 'bcrypt',
    solution: code(
      'js',
      'const hash = await bcrypt.hash(password, 12); // cost factor, tune upward over time',
      'const ok = await bcrypt.compare(attempt, hash);',
      '',
      '// Argon2id is the current recommendation where available'
    ),
    explanation:
      'General-purpose hashes are built to be fast, and a GPU will try billions of SHA-256 guesses a second against a leaked table. Password hashes are built to be slow and, in the case of scrypt and Argon2, memory-hard, so parallel hardware helps an attacker far less. They also handle per-password salting for you, which defeats rainbow tables and stops two users with the same password sharing a hash. The cost factor is a dial you are expected to raise as hardware improves. And compare with the library’s own function, which is constant-time.',
  },

  {
    slug: 'security-password-compare',
    title: 'The hash that never matches',
    category: 'security',
    difficulty: 'easy',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      'A login route hashes the submitted password and compares it to the stored one:',
      '',
      code(
        'js',
        'const attempt = await bcrypt.hash(password, 12);',
        'if (attempt === user.passwordHash) {',
        '  // never reached, even for the right password',
        '}'
      ),
      '',
      'Name the call that compares them correctly.'
    ),
    graderConfig: {
      accept: ['bcrypt.compare', 'compare', 'comparesync', 'argon2.verify', 'verify'],
      acceptPatterns: ['\\bcompare\\b', '\\bverify\\b'],
      nearMisses: {
        timingsafeequal:
          'Right instinct about timing, wrong layer. You still cannot re-hash and compare, because the new hash carries a different salt.',
        sha256: 'Changing the algorithm does not help. The problem is re-hashing at all.',
        'store the salt separately':
          'The salt is already in the stored string. Name the call that reads it back out.',
      },
      hints: [
        'Every call to `hash` generates a fresh salt, so the same password gives a different string every time.',
        'The stored string already carries its salt and its cost factor. Something has to read them back out.',
        '`bcrypt.compare(password, storedHash)`, or `argon2.verify(storedHash, password)`.',
      ],
    },
    canonicalAnswer: 'bcrypt.compare',
    solution: code(
      'js',
      'const ok = await bcrypt.compare(password, user.passwordHash);',
      '',
      '// argon2.verify(user.passwordHash, password) is the same idea'
    ),
    explanation:
      'A password hash is salted per call, so hashing the same password twice gives two different strings and an equality check can only ever fail. The stored value is not a bare digest: it packs the algorithm, the cost factor and the salt alongside the hash, which is what lets `compare` re-derive the digest exactly the way it was made the first time. That packing is also why raising the cost factor does not lock existing users out, since their rows still carry the settings they were hashed with. And `compare` runs in constant time, so it does not leak how much of the digest matched the way a `===` on two strings would.',
  },

  {
    slug: 'security-secrets-in-frontend',
    title: 'The API key in the bundle',
    category: 'security',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'A React app calls a third-party API directly with a secret key from an environment variable:',
      '',
      code(
        'js',
        'fetch(url, { headers: { Authorization: `Bearer ${import.meta.env.VITE_API_KEY}` } });'
      ),
      '',
      'Explain the problem and the standard fix.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'bundle',
            'shipped',
            'client',
            'devtools',
            'network tab',
            'view source',
            'public',
          ],
          missingFeedback: 'Where does that value end up?',
        },
        {
          synonyms: ['anyone', 'extract', 'read it', 'steal', 'copy', 'visible', 'not secret'],
          missingFeedback: 'Who can get hold of it?',
        },
        {
          synonyms: ['proxy', 'server', 'backend', 'own api', 'server-side', 'route it'],
          missingFeedback: 'What is the standard fix?',
        },
      ],
      hints: [
        'Anything the browser needs, the user has.',
        'A build-time variable is inlined into the JavaScript you ship.',
        'Call the third party from your own server and proxy the request.',
      ],
    },
    canonicalAnswer:
      'The key is inlined into the bundle at build time and shipped to every visitor, so anyone can read it from the source or the network tab. It is not a secret once it reaches the browser. Call the third-party API from your own server instead, keep the key there, and have the client talk to your endpoint.',
    solution: code(
      'js',
      '// client',
      "await fetch('/api/quotes');",
      '',
      '// server: the key never leaves this process',
      'const upstream = await fetch(THIRD_PARTY_URL, {',
      '  headers: { Authorization: `Bearer ${process.env.API_KEY}` },',
      '});'
    ),
    explanation:
      'Bundler prefixes like `VITE_` or `NEXT_PUBLIC_` are a signal, not a protection: they exist to make "this will be public" explicit. Anything shipped to a browser is readable, and minification is not obfuscation. A server-side proxy also gives you a place to rate-limit, cache and audit the calls, which you want anyway. Some third-party keys are genuinely publishable, such as a Stripe publishable key or a domain-restricted Maps key, and the way to tell is that the vendor documents them as public and scopes what they can do.',
  },

  {
    slug: 'security-open-redirect',
    title: 'The redirect that trusts a query param',
    category: 'security',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'After login the app sends the user wherever `?next=` says:',
      '',
      code('js', 'res.redirect(req.query.next);'),
      '',
      'Name the vulnerability and a safe way to handle the parameter.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['open redirect', 'redirect', 'phish'],
          missingFeedback: 'Name the vulnerability.',
        },
        {
          synonyms: [
            'attacker',
            'external',
            'another site',
            'evil',
            'their own',
            'off-site',
            'arbitrary',
          ],
          missingFeedback: 'Where can an attacker send the user?',
        },
        {
          synonyms: [
            'relative',
            'allowlist',
            'allow list',
            'whitelist',
            'same origin',
            'starts with /',
            'validate',
            'reject absolute',
          ],
          missingFeedback: 'How do you make the parameter safe?',
        },
      ],
      hints: [
        'The link can be sent by anyone, and it starts on your trusted domain.',
        'It lands the user on an attacker page that looks like yours.',
        'Only allow same-origin relative paths, or check against an allowlist.',
      ],
    },
    canonicalAnswer:
      'It is an open redirect. An attacker sends a link that starts on your trusted domain and bounces the user to their own lookalike site, which makes phishing far more convincing and can leak tokens in the URL. Accept only same-origin relative paths, rejecting anything absolute or protocol-relative, or check the destination against an allowlist and fall back to a default.',
    solution: code(
      'js',
      'function safeNext(next) {',
      "  if (typeof next !== 'string') return '/';",
      '  // reject absolute URLs and protocol-relative ("//evil.com")',
      "  if (!next.startsWith('/') || next.startsWith('//')) return '/';",
      '  return next;',
      '}',
      '',
      'res.redirect(safeNext(req.query.next));'
    ),
    explanation:
      'The value of an open redirect to an attacker is that the link genuinely begins on your domain, so it survives a careful look at the hostname and any filter that trusts your domain. The `//evil.com` case is the one hand-rolled checks miss: it is protocol-relative, so it looks like a path and behaves like an absolute URL. Parsing with `new URL(next, origin)` and comparing the resulting origin is the robust version. The same trap appears in `window.location = userValue` on the client, where a `javascript:` URL is XSS as well.',
  },

  {
    slug: 'security-open-redirect-relative-check',
    title: 'The check that starts with a slash',
    category: 'security',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'short-text',
    prompt: md(
      'After login the app sends the user wherever `?next=` says, once it has checked that the value',
      'is a path on this site:',
      '',
      code('js', "if (next.startsWith('/')) res.redirect(next);"),
      '',
      'Write a value of `next` that passes that check and still lands the user on `evil.com`.'
    ),
    graderConfig: {
      accept: ['//evil.com', '/\\evil.com'],
      acceptPatterns: ['(^|[^:])//evil\\.com', '/\\\\evil\\.com'],
      nearMisses: {
        'https://evil.com':
          'That one the check does catch, because it does not start with a slash. You want a value that does.',
        '/evil.com':
          'One slash is an ordinary path on your own origin, so this redirects to your own 404.',
      },
      hints: [
        'The check reads the value as a string. The browser reads it with a URL parser, and the two disagree.',
        'A URL that opens with two slashes has no scheme and does have a host: the scheme is inherited from the page it resolves against.',
        '`//evil.com`, which starts with `/` and resolves to `https://evil.com`.',
      ],
    },
    canonicalAnswer: '//evil.com',
    solution: code(
      'js',
      "new URL('//evil.com', 'https://your-site.com/login').origin; // 'https://evil.com'",
      '',
      '// the check that holds: parse first, compare the origin, redirect to what you rebuilt',
      'const url = new URL(next, SITE);',
      "if (url.origin !== SITE) return res.redirect('/');",
      'res.redirect(url.pathname + url.search);'
    ),
    explanation:
      "`//evil.com` starts with a slash and carries no scheme, so the parser reads the two slashes as the start of an authority, takes `evil.com` as the host, and inherits `https:` from the page. It is not the only spelling. For `http` and `https` the URL Standard treats a backslash like a slash in that position, so `/\\evil.com` reaches the same host, and `https:/\\evil.com` reaches it without containing `://` for a check to search for. Each of those beats a different piece of string surgery, which is why the check that holds does not inspect the string at all: resolve with `new URL(next, SITE)` and compare `url.origin`. Redirect to the path you rebuilt from the parsed URL rather than to the string that passed, and `javascript:` is rejected for free, since its origin is the string `'null'`.",
  },

  {
    slug: 'security-rate-limit-auth',
    title: 'Protecting a login endpoint',
    category: 'security',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A login endpoint validates credentials correctly and returns 401 on failure, with no other protection.',
      '',
      'Name two attacks it is still exposed to and a mitigation for each.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['brute force', 'bruteforce', 'guess', 'credential stuffing', 'stuffing'],
          missingFeedback: 'What can an attacker do with unlimited attempts?',
        },
        {
          synonyms: ['rate limit', 'throttle', 'lockout', 'backoff', 'captcha', 'slow down'],
          missingFeedback: 'What mitigates that?',
        },
        {
          synonyms: [
            'enumerat',
            'which emails',
            'user exists',
            'different message',
            'timing',
            'reveals',
          ],
          missingFeedback: 'What can the responses leak about who has an account?',
        },
        {
          synonyms: [
            'same message',
            'generic',
            'identical',
            'constant time',
            'do not reveal',
            'uniform',
          ],
          missingFeedback: 'How do you avoid leaking that?',
        },
      ],
      hints: [
        'Nothing stops an attacker trying a million passwords.',
        'And the responses may quietly say whether an account exists.',
        'Rate limit per account and per IP; return an identical response either way.',
      ],
    },
    canonicalAnswer:
      'Unlimited attempts allow brute force and credential stuffing, so rate limit per account and per IP with increasing backoff, and add a CAPTCHA or a temporary lockout after repeated failures. The responses can also enable user enumeration if a missing account and a wrong password differ in message or in timing, so return an identical generic response for both and keep the work done in each case comparable.',
    solution: code(
      'js',
      '// same response either way, and always do the hash work',
      'const user = await findUser(email);',
      'const ok = await bcrypt.compare(password, user?.hash ?? DUMMY_HASH);',
      'if (!user || !ok) {',
      "  return res.status(401).json({ error: 'Invalid email or password' });",
      '}'
    ),
    explanation:
      'Correct credential checking is only the first requirement. Rate limiting is what makes guessing impractical, and it belongs on both the account and the source address so neither a targeted attack nor a spray gets a free run. Enumeration is subtler: "no such user" versus "wrong password" hands an attacker a list of valid accounts, and so does returning faster when the user does not exist, which is why the example hashes against a dummy value anyway. The same care applies to password reset and signup, which leak the same information if they are not equally careful.',
  },

  {
    slug: 'security-nosniff-mime',
    title: 'The upload that executes as a script',
    category: 'security',
    difficulty: 'easy',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      'A file-sharing app serves user uploads at `/uploads/:id` with `Content-Type: text/plain`. A',
      'user uploads a file that is actually HTML with a `<script>` tag, links straight to it, and',
      'anyone who opens the link runs the script.',
      '',
      'Name the response header that stops the browser reinterpreting the declared type.'
    ),
    graderConfig: {
      accept: ['x-content-type-options', 'x-content-type-options: nosniff', 'nosniff'],
      acceptPatterns: ['x-content-type-options', '\\bnosniff\\b'],
      nearMisses: {
        'content-type':
          'Content-Type is what the server already sent. The bug is the browser second-guessing it.',
        'content-disposition': 'That controls download versus inline display, not MIME sniffing.',
      },
      hints: [
        'The browser is the one deciding to reinterpret the file, not your server.',
        'One header tells it to trust the declared Content-Type instead of guessing from the bytes.',
        '`X-Content-Type-Options: nosniff`',
      ],
    },
    canonicalAnswer: 'X-Content-Type-Options: nosniff',
    solution: code('http', 'X-Content-Type-Options: nosniff'),
    explanation:
      'Without nosniff, a browser can ignore the Content-Type you sent and guess the type from the bytes, which is what lets a file declared text/plain still render and run as HTML if its content looks like a page. nosniff forces the browser to use your declared type as-is. For a request whose destination is script or style, a type that is not a JavaScript type or text/css gets the response blocked outright; for everything else, including someone navigating straight to the file, the declared type is used without inspection. Pair it with the right Content-Type on uploads, such as application/octet-stream plus Content-Disposition: attachment, so there is nothing left to execute even before nosniff enters the picture. Helmet and most frameworks set this header by default, which is why the bug tends to show up only in a hand-rolled server.',
  },

  {
    slug: 'security-sri',
    title: 'The CDN script that changed without a deploy',
    category: 'security',
    difficulty: 'easy',
    relevance: 'foundational',
    type: 'short-text',
    prompt: md(
      'A page loads a library straight from a third-party CDN:',
      '',
      code('html', '<script src="https://cdn.example.com/lib.js"></script>'),
      '',
      'The CDN is compromised and starts serving different bytes at that same URL, with no deploy of',
      'your own. Name the HTML attribute that makes the browser refuse to run a file whose bytes do',
      'not match a hash you pin.'
    ),
    graderConfig: {
      accept: ['integrity', 'integrity attribute', 'sri', 'subresource integrity'],
      acceptPatterns: ['\\bintegrity\\b', '\\bsri\\b', 'subresource integrity'],
      nearMisses: {
        crossorigin:
          'crossorigin is required alongside it for a cross-origin load, but the hash itself lives in a different attribute.',
        nonce:
          'A nonce is for inline scripts under CSP, not for pinning a hash of an external file.',
      },
      hints: [
        'The browser needs something to compare the downloaded bytes against.',
        'You supply a hash of the file you expect, in the tag that loads it.',
        '`integrity="sha384-…"`, the Subresource Integrity attribute.',
      ],
    },
    canonicalAnswer: 'integrity',
    solution: code(
      'html',
      '<script',
      '  src="https://cdn.example.com/lib.js"',
      '  integrity="sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC"',
      '  crossorigin="anonymous"',
      '></script>'
    ),
    explanation:
      "The browser hashes the bytes it downloads and compares them against the value in integrity before executing anything, so a mismatch means the script never runs and a tampered CDN response fails safe instead of executing. crossorigin has to be set too, since checking the hash requires the response to go through a CORS-permitted read. What it does not do matters just as much: a swapped file just breaks the page instead of running, it does not stop the CDN from tracking who fetched it, and the hash has to be regenerated on every version bump, or the new file fails the same check an attacker's would.",
  },

  {
    slug: 'security-authorization-caching',
    title: 'The shared cache that will not store a 200',
    category: 'security',
    difficulty: 'easy',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      'A reverse proxy sits in front of an API. Every response carries `Cache-Control: max-age=300`,',
      'but any request that carries an `Authorization` header is always forwarded to the origin,',
      'cache or no cache.',
      '',
      'Name a `Cache-Control` directive that lets the response be cached anyway, when it really is',
      'the same for every caller.'
    ),
    graderConfig: {
      accept: ['public', 's-maxage', 'must-revalidate'],
      acceptPatterns: ['\\bpublic\\b', 's-maxage', 'must-revalidate'],
      nearMisses: {
        private:
          'private does the opposite: it keeps a shared cache from ever storing the response.',
        'max-age':
          'max-age is already there. It is not what unblocks storage for an authorized request.',
      },
      hints: [
        'The rule against storing this response applies specifically to a shared cache, and it takes an explicit opt-in to override.',
        'Three directives grant that opt-in: public, must-revalidate, or s-maxage.',
        '`Cache-Control: public, max-age=300`',
      ],
    },
    canonicalAnswer: 'public',
    solution: code(
      'http',
      '# before: a shared cache refuses to store this, whatever max-age says',
      'Cache-Control: max-age=300',
      '',
      '# after: explicitly declared safe to share',
      'Cache-Control: public, max-age=300'
    ),
    explanation:
      "RFC 9111 singles this case out: a shared cache must not reuse a stored response to a request that carried Authorization unless the response itself says public, must-revalidate, or s-maxage. The default assumption has to be that anything behind Authorization is personal to whoever asked, and getting that wrong hands one user's data to another. The rule only binds shared caches, so it says nothing about the browser's own private cache keeping a copy for the one user allowed to see it. Reach for public only when the response really is identical for every caller, such as a catalog gated by an API key rather than personalised per account.",
  },

  {
    slug: 'security-csp-unsafe-inline',
    title: 'The CSP that still lets the injection run',
    category: 'security',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      "A site ships `Content-Security-Policy: script-src 'self' 'unsafe-inline'` after an XSS audit,",
      'expecting the header to shut the hole down. An attacker still gets an injected `<script>` tag',
      'to run.',
      '',
      'Explain what script-src is supposed to stop, and why unsafe-inline gives most of that back.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['xss', 'cross-site scripting', 'injected script', 'malicious script'],
          missingFeedback: 'What kind of attack is script-src there to stop?',
        },
        {
          synonyms: [
            'allowlist',
            'trusted source',
            'inline script by default',
            'disallow inline',
            'blocks inline',
          ],
          missingFeedback: 'How does script-src normally stop an injected script from running?',
        },
        {
          synonyms: [
            'unsafe-inline',
            'any inline script',
            'inline event handler',
            'regardless of where',
          ],
          missingFeedback: 'What does unsafe-inline specifically re-permit?',
        },
      ],
      hints: [
        'The header exists to stop injected script from running, not to declare a policy in the abstract.',
        'By default script-src only trusts an explicit source list and refuses any inline <script> or event handler, wherever it sits in the page.',
        'unsafe-inline turns that refusal off entirely: any inline script executes, including one an attacker injected.',
      ],
    },
    canonicalAnswer:
      "script-src exists to stop XSS: an attacker's injected script or inline event handler running with your page's privileges. It works by only allowing script from an explicit allowlist of trusted sources and refusing inline script by default. unsafe-inline permits any inline script or event handler regardless of where it came from, which is exactly what an injected script uses, so it hands back most of the protection the policy exists for.",
    solution: code(
      'http',
      "Content-Security-Policy: script-src 'self'",
      '',
      '# keep specific inline scripts without the blanket exception:',
      "Content-Security-Policy: script-src 'self' 'nonce-<random-per-response>'"
    ),
    explanation:
      "CSP's script-src is an allowlist: script has to come from a source you named, and inline script and event handlers are excluded from that allowlist by default, which is exactly where most XSS payloads land. unsafe-inline is a blanket exception to that exclusion, so an attacker's injected <script> tag or onerror handler becomes indistinguishable from code you wrote. A nonce, a random value generated per response and echoed on the tags you trust, or a hash of the exact script contents, lets you keep inline script without reopening the allowlist. CSP is not a substitute for encoding output correctly either. It is what catches the injection you missed, not the first line of defence.",
  },

  {
    slug: 'security-hsts-redirect',
    title: 'The redirect that still gets stripped',
    category: 'security',
    difficulty: 'hard',
    relevance: 'foundational',
    type: 'explain',
    prompt: md(
      'A site redirects every `http://` request to `https://` with a 301 and calls the connection',
      "secure. An attacker on the same coffee-shop network still intercepts a user's first visit and",
      'serves them a page over plain HTTP that never redirects.',
      '',
      'Explain what the redirect fails to prevent, and what Strict-Transport-Security adds that fixes',
      'it.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'ssl strip',
            'sslstrip',
            'ssl-stripping',
            'ssl stripping',
            'man-in-the-middle',
            'mitm',
            'intercept',
          ],
          missingFeedback:
            'Name the attack: what can someone on the network do to that first plaintext request?',
        },
        {
          synonyms: [
            'redirect is still http',
            'redirect itself is sent over http',
            'attacker can just not forward it',
            'never lets the redirect through',
            'serve their own page instead',
            'serves its own response instead',
            'intercepts the redirect',
          ],
          missingFeedback:
            'The redirect is itself an HTTP response. What stops an attacker from just not passing it on?',
        },
        {
          synonyms: [
            'rewrites the url',
            'before sending any request',
            'no plaintext request',
            'preload',
            'remembers the host',
            'upgrades to https before',
          ],
          missingFeedback: 'What does HSTS make the browser do before it sends anything at all?',
        },
      ],
      hints: [
        'The very first request from a fresh browser has to go out unencrypted, before any header from you exists yet.',
        'Your 301 is itself sent over that same connection. Nothing stops an attacker on the network from intercepting it and answering instead.',
        'HSTS makes the browser rewrite the URL to https and skip the plaintext request entirely, from the visit after it first saw the header. Preload removes even that first gap.',
      ],
    },
    canonicalAnswer:
      "This is SSL stripping. The first request to a fresh browser has to go out over plain HTTP, so it travels through whatever the attacker controls on the network, and the redirect you send back is itself an HTTP response on that same connection: the attacker can just intercept it and serve their own page instead of ever letting your redirect through. Strict-Transport-Security fixes it from the second visit onward. Once the browser has seen the header, it remembers the host and rewrites the URL to https before sending any request at all, so there is no plaintext request left to intercept. Preloading, which ships known HSTS hosts inside the browser itself, closes the remaining gap on a user's very first visit.",
    solution: code(
      'text',
      'Visit 1, host never seen before:',
      '  http://site.example  ->  attacker on the network answers first, no redirect required',
      '',
      'Visit 2, after Strict-Transport-Security was received once:',
      '  browser rewrites to https://site.example before sending anything',
      '  -> nothing left for an attacker to intercept'
    ),
    explanation:
      'A redirect only runs after a request already went out, and that first request is exactly the one HSTS is for: with nothing cached yet, the browser has no reason to prefer https, so it asks for http and an attacker in the path can answer instead of your server ever seeing the request. HSTS closes this from the second visit on, because the browser stores the host and upgrades the scheme locally before opening a connection, somewhere the attacker never gets a chance to interfere. The remaining gap is the very first visit to a browser that has never seen the header, which is what the preload list is for: browsers ship with a hardcoded set of hosts that are HSTS from the first request, no prior visit required. Getting listed requires max-age of at least a year and includeSubDomains, since a single subdomain still served in plain HTTP would otherwise undermine the guarantee for the rest of the site.',
  },

  {
    slug: 'security-referrer-policy',
    title: 'The token that leaked through Referer',
    category: 'security',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A password-reset link is `https://app.example.com/reset?token=abc123`. To keep a legacy',
      "analytics tool's attribution working, the team sets `Referrer-Policy: unsafe-url`. The reset",
      "page includes a marketing pixel from a third-party domain, and that domain's access logs start",
      'showing the full reset URL, token included, as the Referer on every page view.',
      '',
      'Explain what unsafe-url sends that a stricter policy would not, and name a value that would',
      'have kept the token off that log.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'full url',
            'query string',
            'path and query',
            'even on a downgrade',
            'regardless of security',
          ],
          missingFeedback: 'What does unsafe-url send that a stricter policy would trim or drop?',
        },
        {
          synonyms: [
            'third party',
            'third-party',
            'cross-origin request',
            'external domain',
            'another origin',
          ],
          missingFeedback: 'Why did a domain that is not yours see it at all?',
        },
        {
          synonyms: [
            'no-referrer',
            'strict-origin-when-cross-origin',
            'strict-origin',
            'same-origin',
          ],
          missingFeedback:
            'Name a Referrer-Policy value that would have kept the query string off that log.',
        },
      ],
      hints: [
        'unsafe-url is the one policy that never trims the URL, whoever is asking.',
        "It's attached to every subrequest the page makes, including one to a third party's pixel, not just navigations.",
        'Referrer-Policy: strict-origin-when-cross-origin (or no-referrer) stops the query string leaving your origin.',
      ],
    },
    canonicalAnswer:
      'unsafe-url sends the full URL, path and query string included, on every request the page makes, even to a third-party origin and even on a downgrade from HTTPS to HTTP, which is exactly what the stricter policies exist to trim. The marketing pixel is on another origin, and the browser attached the Referer to that request the same as any other, so the token rode along into logs nobody on the team controls. strict-origin-when-cross-origin, the safer default, or no-referrer would have kept the query string, and the token, off that log.',
    solution: code(
      'http',
      'Referrer-Policy: strict-origin-when-cross-origin',
      '',
      '# same-origin request  -> full URL, path and query included',
      '# cross-origin request -> origin only, e.g. https://app.example.com/',
      '# https -> http          -> nothing sent at all'
    ),
    explanation:
      "unsafe-url exists for cases that genuinely need the full referring URL everywhere, and analytics attribution is rarely one of them: strict-origin-when-cross-origin still hands a cross-origin analytics tool the origin, which is enough to attribute a visit to your site without handing over the path a user was on. The header only controls the request the browser makes on the page's behalf. It says nothing about a token embedded in the page and copied by a script, or one a user pastes into another site by hand. A value this sensitive belongs in a POST body or a short-lived, single-use code rather than a URL, since a URL also survives in browser history and any proxy log along the way, whatever the Referrer-Policy says.",
  },

  {
    slug: 'security-cors-credentials',
    title: 'Cookies that never make it cross-origin',
    category: 'security',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A single-page app on `https://app.example.com` calls an API on `https://api.example.com` with',
      "`fetch(url, { credentials: 'include' })`. The API answers every origin with",
      '`Access-Control-Allow-Origin: *`, and the browser refuses the response outright, without even',
      'reaching the code that checks `response.ok`.',
      '',
      'Explain why the wildcard is rejected here, and what the server has to send instead.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'wildcard',
            'cannot be combined',
            "can't be combined",
            'not allowed with credentials',
            'fails with credentials',
          ],
          missingFeedback: 'What specifically is not allowed once the request carries credentials?',
        },
        {
          synonyms: [
            'specific origin',
            'exact origin',
            'echo the origin',
            'actual origin',
            'named origin',
          ],
          missingFeedback:
            'What value must Access-Control-Allow-Origin have instead of the wildcard?',
        },
        {
          synonyms: ['allow-credentials', 'allow credentials: true', 'credentials: true'],
          missingFeedback: 'Which second header has to be present too?',
        },
      ],
      hints: [
        "This isn't a syntax error. The combination itself isn't allowed once cookies are on the request.",
        'The server has to know exactly who it is answering, which a wildcard by definition does not say.',
        'Echo the checked Origin back exactly, and add Access-Control-Allow-Credentials: true.',
      ],
    },
    canonicalAnswer:
      'A wildcard Access-Control-Allow-Origin cannot be combined with a credentialed request. The Fetch Standard treats * as meaning no origin was actually checked, and handing cookies to an unchecked audience defeats the point of asking permission at all. The server has to echo back the specific origin that made the request, after checking it against an allowlist, and add Access-Control-Allow-Credentials: true. Without both, the browser withholds the response before your code ever sees it.',
    solution: code(
      'http',
      'Access-Control-Allow-Origin: https://app.example.com',
      'Access-Control-Allow-Credentials: true',
      'Vary: Origin'
    ),
    explanation:
      "The Fetch Standard makes the two mutually exclusive: a response cannot use the literal * origin value if the request's credentials mode is include, and a browser that sees both together throws the CORS error rather than trusting the response. The fix is not to loosen anything, it is to be specific: check the incoming Origin against an allowlist and, if it passes, send that exact value back along with Access-Control-Allow-Credentials: true. That makes the response differ by who asked, so a shared cache in front of the API needs Vary: Origin or it can hand one origin's cookie-bearing response to a different one, the same mistake showing up in a different layer.",
  },

  {
    slug: 'security-vary-origin-poisoning',
    title: "One origin's response served to another",
    category: 'security',
    difficulty: 'hard',
    relevance: 'foundational',
    type: 'explain',
    prompt: md(
      'An API sits behind a shared cache. It echoes back whatever `Origin` header a credentialed',
      'request sends, correctly checked against an allowlist, and sets',
      '`Access-Control-Allow-Origin` to that value. A few hours later, a request from a second',
      'allowed origin gets back a response with the first origin still named in',
      '`Access-Control-Allow-Origin`, and the browser rejects it.',
      '',
      'Explain what the cache did, and the header that would have prevented it.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'keyed only on the url',
            'keyed on the url',
            'served the first',
            'reused the response',
            'served that cached response',
            'served the stored response',
          ],
          missingFeedback: 'What did the cache treat as identical, that actually was not?',
        },
        {
          synonyms: ['vary: origin', 'vary origin', 'vary header'],
          missingFeedback: 'Which response header tells the cache the answer depends on Origin?',
        },
        {
          synonyms: ['cache poisoning', 'wrong origin', 'served to the wrong', 'leaked to'],
          missingFeedback: "What's the actual impact of serving one origin's response to another?",
        },
      ],
      hints: [
        'The two requests looked identical to the cache. What did it use as the key?',
        'Only the URL, so the second origin got served exactly what was generated for the first.',
        'Vary: Origin tells the cache that Origin is part of the key too, so each origin gets its own entry.',
      ],
    },
    canonicalAnswer:
      "The cache stored the response keyed only on the URL, so as far as it knew every request to that endpoint was interchangeable, and it served the second origin the exact response generated for the first, Access-Control-Allow-Origin included. That's cache poisoning: the wrong origin now holds an answer meant for someone else, and the only reason nothing worse happened is that the browser itself double-checks the header against its own Origin before trusting the response. Vary: Origin fixes it by making Origin part of the cache key, so each origin gets its own stored copy instead of sharing one.",
    solution: code(
      'http',
      '# Origin: https://a.example.com  ->  cached under /api/data',
      '# Origin: https://b.example.com  ->  cache hit, wrong Access-Control-Allow-Origin served',
      '',
      '# fix: name Origin as part of what the response depends on',
      'Access-Control-Allow-Origin: https://a.example.com',
      'Vary: Origin'
    ),
    explanation:
      "A cache that only knows the URL treats every request to that path as the same question, which is fine right up until the answer stops being the same for everyone. Reflecting Origin makes the response depend on a request header the cache was never told to key on, so Vary: Origin is not optional the moment you echo it back: without it, the response generated for one origin becomes the response served to the next one who happens to hit a warm cache entry. The browser's own check catches this specific failure, since it compares the header against its own Origin before handing the response to script, but that safety net does not cover everything a shared cache can leak this way. A response that varies on Cookie or Authorization has the same shape of bug and the same fix: name what the response depends on in Vary, or keep it out of any shared cache at all.",
  },

  {
    slug: 'security-xff-trust',
    title: 'The rate limiter one attacker walks straight through',
    category: 'security',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A login endpoint rate-limits by client IP, read from the `X-Forwarded-For` header. One',
      'attacker is making unlimited attempts anyway, from a single machine, no botnet involved.',
      '',
      'Explain how they are bypassing it, and what has to be true before that header can be trusted.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'client can set',
            'attacker can set',
            'spoof',
            'anyone can set',
            'set it to anything',
            'fake value',
          ],
          missingFeedback: 'Where does that header value actually come from, and who can write it?',
        },
        {
          synonyms: [
            'fresh key',
            'new key each',
            'different key every',
            'resets the counter',
            'never sees the same client',
            'a new bucket each',
          ],
          missingFeedback: "What does a different value on every request do to the limiter's key?",
        },
        {
          synonyms: [
            'trust proxy',
            'hop count',
            'number of proxies',
            'read from the right',
            'proxies you control',
            'hops you operate',
          ],
          missingFeedback:
            'What has to be configured before any part of that header can be trusted?',
        },
      ],
      hints: [
        "Nothing forces that header to be true. It's just text the client sent.",
        'A limiter that reads it verbatim gets a brand-new value, and therefore a brand-new bucket, every single request.',
        'Only the hops your own proxy chain appended are trustworthy. Set trust proxy to that exact count and read from the right.',
      ],
    },
    canonicalAnswer:
      'X-Forwarded-For is just a request header, and a client can set it to anything before the request ever reaches your proxy, so sending a different value on every attempt hands the rate limiter a fresh key each time and it never sees the same client twice. The header only becomes trustworthy for the hops your own infrastructure actually appended. You have to configure the exact number of proxies in front of the app, trust proxy set to that count rather than to true, and read the entry that many hops in from the right, past anything the client could have written itself.',
    solution: code(
      'js',
      "app.set('trust proxy', 1); // exactly one proxy in front of this app",
      '',
      '// req.ip is now the address that proxy attached,',
      "// not whatever the client's own X-Forwarded-For claimed"
    ),
    explanation:
      "RFC 7239 says plainly that X-Forwarded-For cannot be relied on, since every node on the path can append to it and nothing checks what was already there; a client is free to open the connection with the header already set. The fix isn't to stop reading it, since a proxy in front of you genuinely does need to pass the real client address along. It's to read only as many entries from the right as you have proxies you actually operate, because those are the only ones you can vouch for. Setting trust proxy to true rather than a count is the trap that looks like a fix: it tells the app to believe the whole chain, client-written entry included, which is the exact bug this problem starts with.",
  },

  {
    slug: 'security-trust-proxy-hops',
    title: 'Every request from the same address',
    category: 'security',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'short-text',
    prompt: md(
      'An Express app runs behind exactly one load balancer. Its rate limiter keys on `req.ip`, the',
      'access log shows a single address for the entire internet, and one noisy client gets everybody',
      'a 429.',
      '',
      'Write the one line that makes `req.ip` the address the load balancer recorded.'
    ),
    graderConfig: {
      accept: ["app.set('trust proxy', 1)"],
      acceptPatterns: ['set\\([^)]*trust proxy[^)]*,\\s*1\\s*\\)'],
      nearMisses: {
        "app.set('trust proxy', true)":
          'true believes the whole chain, the entry the client wrote included. Give it the number of hops you actually run.',
        "req.headers['x-forwarded-for']":
          'Reading the header yourself trusts every entry in it, and the leftmost one is the entry an attacker sets.',
      },
      hints: [
        'Express knows how to read `X-Forwarded-For`. It refuses to until you tell it how far along the chain to trust.',
        'The setting takes a hop count, because Express counts in from the right, past the proxies you operate.',
        "`app.set('trust proxy', 1)`",
      ],
    },
    canonicalAnswer: "app.set('trust proxy', 1)",
    solution: code(
      'js',
      "app.set('trust proxy', 1); // one hop, counted from the right",
      '',
      '// before: req.ip is the load balancer, identically for every request on earth',
      '// after:  req.ip is the address that load balancer wrote down',
      "// never:  app.set('trust proxy', true), which believes the client too"
    ),
    explanation:
      '`req.ip` is the socket address until you say otherwise, and behind a load balancer that address is the load balancer, so a limiter keyed on it has one bucket for everyone. The number is the load-bearing part. A count tells Express how many entries at the right-hand end of `X-Forwarded-For` its own infrastructure appended, so it walks in that far and stops at the first address it did not write. Set it to `true` instead and Express believes the whole chain, which makes `req.ip` the leftmost entry, the one a client can invent, and now the limiter hands out a fresh bucket per request rather than one for everyone. The same setting decides whether `req.protocol` reads `X-Forwarded-Proto`, which is what a redirect-to-HTTPS middleware needs before it stops looping behind a proxy that terminated TLS.',
  },

  {
    slug: 'security-cookie-flags',
    title: 'One cookie, three attributes, three attacks',
    category: 'security',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'A pentest report flags a session cookie shipped as `Set-Cookie: session=abc123`, nothing else.',
      '',
      'Name the three attributes missing and, for each, the specific attack it would have closed.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'httponly',
            'http-only',
            'javascript cannot read',
            "javascript can't read",
            'xss',
          ],
          missingFeedback:
            'Which attribute keeps JavaScript from reading the cookie, and what attack does that stop?',
        },
        {
          synonyms: [
            'secure flag',
            'over https',
            'https only',
            'man-in-the-middle',
            'mitm',
            'plaintext',
          ],
          missingFeedback:
            'Which attribute keeps the cookie off plain HTTP, and what does that protect against?',
        },
        {
          synonyms: ['samesite', 'same-site', 'csrf', 'cross-site request forgery'],
          missingFeedback:
            'Which attribute stops another site riding the cookie along, and what is that attack called?',
        },
      ],
      hints: [
        'One flag is about who can read the value, one is about which connections carry it, one is about which sites can trigger it.',
        'HttpOnly, Secure and SameSite, each closing a different door.',
        'HttpOnly stops XSS reading it, Secure stops it crossing plain HTTP, SameSite stops it riding along on a cross-site request (CSRF).',
      ],
    },
    canonicalAnswer:
      "HttpOnly, Secure and SameSite. HttpOnly keeps JavaScript from reading the cookie through document.cookie, which is what stops a single XSS from exfiltrating it. Secure sends the cookie only over HTTPS, so a network attacker on the same coffee-shop wifi can't read it off a plaintext request the way they could without the flag. SameSite=Lax stops the cookie riding along on a cross-site POST that another site's page triggers, which is CSRF.",
    solution: code(
      'http',
      'Set-Cookie: session=abc123; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600'
    ),
    explanation:
      "None of the three cover for each other. HttpOnly keeps document.cookie from returning it, but a same-origin fetch still attaches the cookie automatically, since HttpOnly blocks the JavaScript read, not the browser's own send. Secure only constrains the transport: a cookie readable by an injected script because HttpOnly is missing is exactly as stealable over HTTPS as over HTTP. SameSite is the one to set explicitly rather than inherit, because browsers disagree about what an absent attribute means: Chromium treats it as Lax, Firefox as None. Lax covers the classic hidden-form CSRF but still sends the cookie on an ordinary top-level GET link, so a state-changing action still needs to happen on POST rather than GET for SameSite to be doing any of the work. Set all three. They cost nothing and each closes a door the others do not.",
  },

  {
    slug: 'security-limiter-after-routes',
    title: 'Ten thousand login attempts, none refused',
    category: 'security',
    difficulty: 'medium',
    relevance: 'occasional',
    tags: ['reading'],
    type: 'short-text',
    prompt: md(
      'A script is trying passwords against `/api/login` as fast as it can, and nothing is ever refused:',
      '',
      code(
        'js',
        'const app = express();',
        '',
        'app.use(helmet());',
        'app.use(express.json());',
        "app.use('/api', apiRoutes);",
        'app.use(rateLimit({ windowMs: 60_000, max: 5 }));',
        '',
        'app.listen(3000);'
      ),
      '',
      'Which requests does that rate limiter actually run for?'
    ),
    graderConfig: {
      accept: [
        'the ones no route matched',
        'requests no route matched',
        'unmatched paths',
        'only the 404s',
        'the 404s',
        'requests that no route handled',
        'requests that fall through',
      ],
      acceptPatterns: [
        'unmatched',
        '404',
        'no (route|handler|match)',
        '(nothing|no route|no handler) (matched|handled|answered)',
        'falls? through',
        'fell through',
      ],
      nearMisses: {
        'every request':
          'Every request enters the stack, but one a route answers never reaches this line: the handler sends the response and never calls `next()`.',
        'requests to /api': 'Those are exactly the ones it misses.',
        'all requests to /api/login': 'Those are exactly the ones it misses.',
        none: 'It does run, for the requests that get that far. Work out which ones those are.',
      },
      hints: [
        'Express runs the stack in registration order, one `next()` at a time.',
        'A handler that sends a response ends the chain. Nothing registered after it runs.',
        'So the limiter only sees requests that got past every route without one answering them.',
      ],
    },
    canonicalAnswer: 'only the ones no route matched',
    solution: code(
      'js',
      'app.use(helmet());',
      'app.use(express.json());',
      'app.use(rateLimit({ windowMs: 60_000, max: 5 })); // before anything that answers',
      "app.use('/api', apiRoutes);",
      '',
      '// tighter still: a stricter limiter mounted on the route that gets attacked',
      "app.use('/api/login', rateLimit({ windowMs: 60_000, max: 5 }));"
    ),
    explanation:
      "Express middleware is a list walked in registration order, and the walk stops the moment something responds instead of calling `next()`. A limiter registered below the routes is therefore protecting only the paths that reached the end of the list without being answered, which is to say the 404s. Run this and the numbers are stark: six logins in a row leave the limiter at zero calls, the same limiter moved above `app.use('/api', apiRoutes)` runs on every one of them, and a request to a path with no route does reach it. Order is the whole configuration for anything mounted with `app.use`, which is why the security-relevant ones go at the top, and why a limiter aimed at a specific endpoint is better mounted on that path than left to the end of the file.",
  },

  {
    slug: 'security-unguessable-id-not-authorization',
    title: 'The id nobody can guess',
    category: 'security',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      "A customer changed the number in the address bar and read somebody else's invoice:",
      '',
      code(
        'text',
        'GET /invoices/4471   -> 200, their own',
        'GET /invoices/4472   -> 200, a different company'
      ),
      '',
      'The proposal on the ticket is to move invoice ids to random UUIDs. Say what that fixes, and what still has to change.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'does not fix',
            "doesn't fix",
            'not a fix',
            'not authorization',
            'not authorisation',
            'authorization check',
            'authorisation check',
            'authorize',
            'authorise',
            'belongs to',
            'owns it',
            'ownership',
            'the owner',
            'permission',
            'allowed to',
            'who is asking',
            'the requester',
            'scope the query',
            'scoped to',
          ],
          missingFeedback:
            'The handler answered both requests without objecting. Say what it never did, and has to.',
        },
        {
          synonyms: [
            'guess',
            'enumerat',
            'walk',
            'harder to find',
            'cannot be predicted',
            'unpredictable',
            'not sequential',
            'how many',
            'leaks',
            'crawl',
            'defence in depth',
            'defense in depth',
            'buys',
          ],
          missingFeedback:
            'A random id does change something. Say what it costs an attacker, and what it stops leaking.',
        },
      ],
      hints: [
        'Ask what the handler checked before it answered the second request. Nothing about the id changes that answer.',
        'A random id makes the next invoice hard to find. It does not make it refused.',
        'The fix is to scope the read to the requester: the invoice has an owner, and the query has to say so.',
      ],
    },
    canonicalAnswer:
      'It does not fix it. The handler answered both requests without ever checking whether the invoice belongs to whoever asked, and that check is still missing whatever the id looks like: scope the query to the requester and answer 404 when it comes back empty. What a random id buys is that the ids stop being walkable, so nobody can crawl the whole table by counting, and sequential numbers stop leaking how many invoices exist and how fast they arrive. That is defence in depth, not access control.',
    solution: md(
      '- **What a UUID fixes**: guessing. The next invoice is no longer `id + 1`, so a walk of the whole table stops being free, and the number stops leaking how many invoices there are.',
      '- **What still has to change**: the authorisation check. The handler has to establish that this invoice belongs to whoever is asking, and refuse otherwise.',
      '',
      code(
        'js',
        '// before: the id is the whole of the authorisation',
        'const invoice = await db.invoice.findUnique({ where: { id } });',
        '',
        '// after: the requester is part of the question',
        'const invoice = await db.invoice.findFirst({ where: { id, accountId: req.user.accountId } });',
        'if (!invoice) return res.sendStatus(404);'
      )
    ),
    explanation:
      'This is a broken object level authorisation bug, which OWASP puts first on its API list, and it survives every id scheme because the id was never the access control. The rule is that a reference supplied by the caller is an input like any other: the handler decides what that caller may see, rather than trusting that they only asked for what they can reach. Scoping the query is stronger than fetching and then comparing, because there is no path where the row is loaded and the check is forgotten. Answer 404 rather than 403 where the existence of the record is itself worth hiding. Unguessable ids are still worth having, and they buy the second half of this: they make an automated sweep expensive and they stop a sequence leaking your volume to anyone who orders twice.',
  },

  {
    slug: 'security-child-process-same-user',
    title: 'It runs in its own process now',
    category: 'security',
    difficulty: 'easy',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      'A handler used to run a generated script with `eval`. It now runs it like this:',
      '',
      code('js', "spawn('node', ['job.js'], { cwd: '/tmp/job-4471' });"),
      '',
      "The ticket says the script can no longer reach the application's own files. Name what the",
      'child inherited that makes that wrong.'
    ),
    graderConfig: {
      accept: [
        'the same user id',
        'the same user',
        'same user',
        'the user id',
        'user id',
        'uid',
        'the parent user id',
        'its parent user id',
        'the same credentials',
        'the parent credentials',
      ],
      acceptPatterns: [
        '\\buids?\\b',
        "(same|parent|your|its|the)\\s+(process(?:['’]s)?\\s+)?(user|credential)",
        'user\\s+(and\\s+group\\s+)?ids?',
      ],
      nearMisses: {
        'the working directory':
          '`cwd` was set, and it is not a jail. A relative path starts there; an absolute one never consulted it.',
        'the environment variables':
          'Those come across too, and `env` is one option away from replacing them. Who the child runs as is not.',
        'the open file descriptors':
          'Real, and narrower than the answer. Even with nothing inherited on stdio, the child can still open the same files.',
      },
      hints: [
        '`cwd` decides where a relative path starts. It decides nothing about what the process may open.',
        'The kernel answers "may this process read that file" from the process credentials, and a child gets a copy of its parent\'s.',
        'The same user id.',
      ],
    },
    canonicalAnswer: 'the same user id',
    solution: md(
      'The child runs as the same user, so every file the server can read, it can read.',
      '',
      code(
        'js',
        '// A separate process is a fault boundary: a crash or a hang stays in the child.',
        '// It is not a privilege boundary until you take something away.',
        "spawn('node', ['job.js'], {",
        "  cwd: '/tmp/job-4471',",
        '  env: {}, // the parent environment is the default, secrets included',
        '  uid: NOBODY_UID, // only a privileged parent may set this',
        '});'
      )
    ),
    explanation:
      "A process boundary is a fault boundary rather than a trust boundary. What it buys is real and worth having: a separate address space, so a bug in the child cannot read the parent's memory, and a crash or an endless loop that stays in the child. What it does not buy is a different identity. `credentials(7)` is explicit that a child created by `fork(2)` inherits copies of its parent's user and group IDs, and file permission checks are answered from those, so the child opens exactly the files the parent could. Node's `spawn` hands the environment down too: `env` defaults to `process.env`, so the provider key and the database URL are in the child unless you pass something else. The `uid` option exists and is not a general escape hatch, because `setuid(2)` only lets a privileged process change to another user; an app server running as `app` spawns children running as `app`. Everything that makes a process contain untrusted code is subtraction from this starting point.",
  },

  {
    slug: 'security-model-wrote-the-query',
    title: 'Nothing left to bind',
    category: 'security',
    difficulty: 'easy',
    relevance: 'daily',
    type: 'short-text',
    prompt: md(
      'A reporting assistant lets the model write the SQL, and the handler runs it:',
      '',
      code('js', 'const rows = await db.raw(await model.sqlFor(question));'),
      '',
      'Review says to parameterise it, and there is nothing to parameterise: the model wrote the',
      'whole statement, literals included. Name the control that does apply.'
    ),
    graderConfig: {
      accept: [
        'a read-only role',
        'a read only role',
        'a read-only database role',
        'a read-only user',
        'a read-only connection',
        'least privilege',
        'run it as a read-only role',
        'a restricted database role',
      ],
      acceptPatterns: [
        'read[\\s-]?only',
        'least[\\s-]privilege',
        'restricted\\s+(database\\s+)?(role|user|connection)',
        'grant\\s+(only\\s+)?select',
        '\\brevoke\\b',
      ],
      nearMisses: {
        'validate the sql':
          'Deciding whether an arbitrary statement is safe means parsing a whole language to build a denylist, and denylists lose. Constrain the connection instead of the string.',
        'an allowlist of tables':
          'Closer, and it is still enforced by reading the statement. The engine already knows how to refuse a table: do not grant it.',
        'sanitise the query':
          'There is no sanitiser for a language. What you can bound is what the session is permitted to do once the statement is parsed.',
      },
      hints: [
        'Parameter binding works because the value travels beside the statement. Here there is no separate value.',
        'You cannot make an arbitrary statement safe by inspecting it. You can decide what the session is permitted to do.',
        'A read-only role, granted only the reporting views, with a statement timeout on it.',
      ],
    },
    canonicalAnswer: 'a read-only database role',
    solution: md(
      'Run it on a connection that cannot do the thing you are afraid of:',
      '',
      code(
        'sql',
        'CREATE ROLE reporting_ro LOGIN;',
        'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM reporting_ro;',
        'GRANT SELECT ON reporting_orders, reporting_customers TO reporting_ro;',
        "ALTER ROLE reporting_ro SET statement_timeout = '5s';",
        'ALTER ROLE reporting_ro SET default_transaction_read_only = on;'
      )
    ),
    explanation:
      'Parameter binding separates the statement from the values, which is exactly the split a generated query does not have: the model produced the syntax and the literals together, so there is no channel left to move anything onto. Inspecting the statement instead is a denylist over a full language, and every denylist over a rich grammar loses eventually. What survives is the shape the rest of this section takes: stop trying to make the input safe and bound what running it can reach. A separate login with `SELECT` on the reporting views and nothing else means `DROP TABLE` and a read of the users table both fail in the engine, whatever the model wrote and whatever the question was. Add a statement timeout, because a correct query over the wrong join is a denial of service you will meet long before you meet a malicious one.',
  },

  {
    slug: 'security-vm-not-a-boundary',
    title: 'There is no process in the realm',
    category: 'security',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'explain',
    prompt: md(
      'A service grades submitted JavaScript by running it in a `node:vm` context:',
      '',
      code(
        'js',
        'const context = createContext({ console, setTimeout, structuredClone, URL });',
        'runInContext(submission, context, { timeout: 1000 });'
      ),
      '',
      'The review approves it, because `typeof process` really is `undefined` in there and the',
      'timeout stops an endless loop.',
      '',
      'Say why that reasoning does not hold, and what the timeout does and does not bound.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'constructor',
            'reaches',
            'reach',
            'escape',
            'escapes',
            'break out',
            'breaks out',
            'gets out',
            'get out',
            'not a security boundary',
            'not a boundary',
            'not a sandbox',
            'not a security mechanism',
          ],
          missingFeedback:
            'Every value handed into that context is an object from the host realm. Say what the submission can do with one.',
        },
        {
          synonyms: [
            'same process',
            'your process',
            'the server process',
            'same user',
            'privileges',
            'credentials',
            'environment',
            'env',
            'filesystem',
            'file system',
            'network',
          ],
          missingFeedback: 'If it does get out, say what it gets out into.',
        },
        {
          synonyms: [
            'synchronous',
            'sync run',
            'does not stop',
            'cannot stop',
            'scheduled',
            'schedules',
            'callback',
            'timer',
            'after it returns',
            'keeps running',
            'still runs',
          ],
          missingFeedback: 'The timeout bounded one thing. Say what it does not bound.',
        },
      ],
      hints: [
        'The absent global is not the question. Look at what you handed in: every one of those is a host object.',
        '`structuredClone.constructor` is the host `Function`, and `Function("return process")()` evaluates in the host.',
        'The timeout bounds one synchronous run. A callback the submission scheduled keeps running after `runInContext` has returned.',
      ],
    },
    canonicalAnswer:
      'A fresh realm is not a boundary. Every value passed into the context is a host object, so the submission walks a constructor chain out of it: `structuredClone.constructor` is the host `Function`, and `Function("return process")()` reaches the real `process` with `require` behind it. Once out it is in the same process as the server, with that process\'s user, its environment variables, its filesystem and its network. Node says so itself: the module is not a security mechanism. The timeout is narrower than it looks too, because it bounds one synchronous run and nothing else: a callback the submission scheduled keeps running after `runInContext` has returned, and it cannot undo a write that already happened.',
    solution: md(
      'Measured against exactly that context, on Node 24:',
      '',
      code(
        'js',
        "runInContext('typeof process', ctx); // 'undefined'",
        '',
        'runInContext("structuredClone.constructor(\'return process\')().env.HOME", ctx);',
        "// '/Users/alex'",
        '',
        'runInContext(',
        '  "structuredClone.constructor(\'return process\')()" +',
        "    \".mainModule.require('node:child_process').execSync('id -un').toString()\",",
        '  ctx',
        ');',
        "// 'alex'"
      ),
      '',
      'And the timeout, measured the same way:',
      '',
      code(
        'js',
        'runInContext("setTimeout(() => log(\'still here\'), 300)", ctx, { timeout: 50 });',
        '// returns in 1ms; the callback runs 301ms later'
      )
    ),
    explanation:
      "Node's own documentation is one sentence: the `node:vm` module is not a security mechanism, and it is not for running untrusted code. What it gives you is a separate realm, which is a namespace rather than a wall, and the wall is missing because objects cross it. Any function you hand in carries `.constructor`, which is the host `Function`, and a host `Function` compiles code that evaluates in the host. `timeout` is documented as the number of milliseconds to execute code before terminating execution, and that is one synchronous evaluation: it does not follow a scheduled callback, and it obviously cannot undo a file the code has already written. Hone runs this exact code path in `grading/code-runner.ts` and treats it as a convenience rather than a boundary, which is why the file says not to reuse it for anybody else's code, and why self-hosting the app was declined rather than solved with a stricter realm.",
  },

  {
    slug: 'security-container-root-on-the-host',
    title: 'Root wrote the file',
    category: 'security',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      'A build container runs as root and writes its output into a bind-mounted host directory:',
      '',
      code(
        'text',
        '$ docker run -v /var/builds/4471:/out builder',
        '$ ls -l /var/builds/4471',
        '-rw-r--r--  1 root  root  1240  bundle.js'
      ),
      '',
      'The unprivileged CI user that started the container cannot then delete its own build output.',
      '',
      "Name the namespace whose absence makes the container's root the host's root."
    ),
    graderConfig: {
      accept: [
        'user namespace',
        'the user namespace',
        'user namespaces',
        'userns',
        'clone_newuser',
        'a user namespace',
      ],
      acceptPatterns: ['user[\\s_-]?namespace', 'CLONE_NEWUSER', '\\buserns\\b'],
      nearMisses: {
        'mount namespace':
          'That is what gives the container its own view of the filesystem, and the file landed exactly where the mount said. It has no say over which uid wrote it.',
        'pid namespace':
          'That renumbers processes, so the build is pid 1 inside. The uid that opened the file is untouched.',
        'network namespace':
          'Wrong resource. A uid wrote this file; nothing was sent over a socket.',
      },
      hints: [
        'Nothing here is a filesystem problem: the bytes went exactly where the mount said they would. Read the owner column.',
        'Root inside the container was uid 0 to the kernel, because uid 0 was never mapped to anything else.',
        'The user namespace, which is what `--userns-remap` turns on.',
      ],
    },
    canonicalAnswer: 'the user namespace',
    solution: md(
      'Two fixes, and they are not the same fix.',
      '',
      '- **Do not be root**: `docker run --user 1000:1000` writes as that uid, and the image needs to',
      '  cope with not owning its own directories.',
      '- **Remap root**: a user namespace maps container uid 0 to an unprivileged host uid, so a',
      '  process that believes it is root is nobody in particular outside.',
      '',
      code(
        'text',
        '$ docker run --user 1000:1000 -v /var/builds/4471:/out builder',
        '$ ls -l /var/builds/4471',
        '-rw-r--r--  1 ci  ci  1240  bundle.js'
      )
    ),
    explanation:
      'Of the namespaces Linux has, the user namespace is the only one that touches identity, and it is the one Docker leaves off by default. `user_namespaces(7)` describes exactly the property that is missing here: a process can have a normal unprivileged user ID outside a user namespace while at the same time having a user ID of 0 inside it, so it has full privileges for operations inside the namespace and is unprivileged for operations outside it. Without that mapping there is no translation to do, and uid 0 in the container is uid 0 to the kernel, which is the same uid 0 that owns the host. Root-owned files in a bind mount are the visible symptom and the cheap one. The expensive version is that anything the container is allowed to reach, it reaches with the capabilities of real root, which is why `--privileged` and a bind-mounted Docker socket are both effectively a root shell on the host.',
  },

  {
    slug: 'security-container-shared-kernel',
    title: 'A container per tenant',
    category: 'security',
    difficulty: 'medium',
    relevance: 'foundational',
    type: 'explain',
    prompt: md(
      "A build platform runs every customer's build in its own container on a shared host. The",
      'design doc says: "each build is isolated in a container, so a compromised build cannot affect',
      'another customer\'s".',
      '',
      'Say what a container is actually made of, and what that sentence is missing.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: ['namespace', 'cgroup', 'control group', 'capabilit', 'seccomp'],
          missingFeedback:
            'A container is not a kernel object. Name the kernel features applied to an ordinary process to make one.',
        },
        {
          synonyms: [
            'same kernel',
            'one kernel',
            'shared kernel',
            'share the kernel',
            'shares the kernel',
            'sharing the kernel',
            'sharing a kernel',
            'host kernel',
            'kernel is shared',
          ],
          missingFeedback:
            'Every container on that host talks to the same one of something. Name it.',
        },
        {
          synonyms: [
            'syscall',
            'system call',
            'kernel bug',
            'kernel vulnerability',
            'kernel flaw',
            'escape',
            'escapes',
            'break out',
            'breaks out',
            'privilege escalation',
            'escalat',
          ],
          missingFeedback:
            'Say where the attack surface is, and what a bug in the shared thing gets somebody.',
        },
      ],
      hints: [
        'There is no container object in Linux. Ask what the kernel actually does to a process to turn it into one.',
        'Namespaces decide what it can see, cgroups cap what it can use, and a reduced capability set plus a seccomp filter decide what it can ask the kernel for.',
        'All of that runs on one kernel, so the boundary is the system call interface and a kernel bug reached through it lands on the host.',
      ],
    },
    canonicalAnswer:
      "A container is an ordinary process with three things done to it: namespaces deciding what it can see, cgroups capping what it can use, and a reduced capability set plus a seccomp filter narrowing what it can ask for. What the sentence misses is that every one of those containers talks to the same kernel. The boundary is the system call interface, which is hundreds of calls wide, so a kernel bug reachable through a call the seccomp filter still permits is a break out of one container and onto the host, and the host is every other customer's build.",
    solution: md(
      'The three parts, and what each one is actually for:',
      '',
      '| Part                     | What it decides            | What it is not          |',
      '| ------------------------ | -------------------------- | ----------------------- |',
      '| Namespaces               | what the process can see   | who it runs as          |',
      '| cgroups                  | what it can use            | what it can reach       |',
      '| Capabilities and seccomp | what it can ask the kernel | a different kernel      |',
      '',
      'Docker states the limit itself: "One primary risk with running Docker containers is that the',
      'default set of capabilities and mounts given to a container may provide incomplete isolation."'
    ),
    explanation:
      'Namespaces are the load-bearing piece and `namespaces(7)` says what they do: a namespace wraps a global system resource in an abstraction that makes it appear to the processes within it that they have their own isolated instance of that resource. Eight of them exist, covering mounts, pids, network, IPC, hostname, cgroup root, clocks and user IDs, and a container is a process placed in a set of them. cgroups are accounting rather than access: a Linux kernel feature that lets processes be organised into groups whose resource usage can be limited and monitored, which stops one build eating the host and stops nothing else. The syscall surface is what remains, and Docker narrows it by default with a seccomp profile that denies by default and allows specific calls, disabling around 44 of 300-plus. Two hundred and fifty system calls is a large interface to a single shared kernel, and that is the honest summary: a container is a very good boundary against a mistake and a much weaker one against somebody trying.',
  },

  {
    slug: 'security-sandbox-with-network',
    title: 'No credentials in the sandbox',
    category: 'security',
    difficulty: 'medium',
    relevance: 'occasional',
    type: 'short-text',
    prompt: md(
      'A code-runner service starts a container per submitted job. The container has no credentials',
      'in its environment, no volumes mounted and a read-only root filesystem. It runs on an EC2',
      "instance whose instance profile can write the service's S3 bucket.",
      '',
      'An audit finds that submitted jobs have been writing to that bucket. Name what the sandbox is',
      'still missing.'
    ),
    graderConfig: {
      accept: [
        'the network',
        'network access',
        'network isolation',
        'egress',
        'egress control',
        'outbound network access',
        'no outbound network',
        'its own network namespace',
      ],
      acceptPatterns: ['\\bnetwork\\b', '\\begress\\b', '\\boutbound\\b', '169\\.254\\.169\\.254'],
      nearMisses: {
        'the iam role':
          'The role is why this is worth anything to an attacker, and it is on the instance rather than in the sandbox. Say how the job reached the thing that hands it out.',
        imdsv2:
          'IMDSv2 raises the price rather than removing the endpoint: a PUT for a token is one extra line from inside the sandbox. What let the job talk to it at all?',
        'a read-only filesystem':
          'Already set, and it is the wrong axis. Nothing was written locally.',
      },
      hints: [
        'Nothing was mounted and nothing was in the environment, and the credentials arrived anyway. They came over something.',
        "An instance's metadata service answers on a link-local address from inside the instance, and AWS documents it as not protected by authentication.",
        'The sandbox still has the network. `--network=none`, or an egress policy that drops link-local.',
      ],
    },
    canonicalAnswer: 'outbound network access',
    solution: md(
      'The job never needed a credential of its own:',
      '',
      code(
        'text',
        '$ curl http://169.254.169.254/latest/meta-data/iam/security-credentials/',
        'code-runner-instance-role',
        '$ curl http://169.254.169.254/latest/meta-data/iam/security-credentials/code-runner-instance-role',
        '{"AccessKeyId":"ASIA…","SecretAccessKey":"…","Token":"…"}'
      ),
      '',
      'Take the network away, and add the two things that survive a mistake in the first:',
      '',
      code(
        'text',
        'docker run --network=none --read-only --user 65534:65534 \\',
        '  --memory=512m --pids-limit=128 runner'
      )
    ),
    explanation:
      'Emptying the environment answers "what secrets are in the sandbox" and not "what can the sandbox reach", and on a cloud instance the second question has an answer sitting on a fixed link-local address. AWS documents the metadata service at `http://169.254.169.254/latest/meta-data/`, says plainly that the data is not protected by authentication or cryptographic methods and that potentially any software running on the instance can view it, and lists `iam/security-credentials/{role-name}` as returning the temporary credentials for the instance role. So a sandbox with no credentials and a default network is a sandbox with the host\'s credentials one HTTP request away, and the same shape is what makes server-side request forgery worth exploiting. IMDSv2 helps by requiring a `PUT` for a token first, and AWS notes that with a response hop limit of 1 a container counts as an extra hop and often cannot reach the service at all, which makes it a mitigation rather than a boundary. Egress is the boundary: no network by default, and an allowlist where the job genuinely needs one.',
  },

  {
    slug: 'security-generated-code-runs-as-you',
    title: 'The tool that runs what the model wrote',
    category: 'security',
    difficulty: 'medium',
    relevance: 'daily',
    type: 'explain',
    prompt: md(
      'An agent has a `run_python` tool, and the handler runs inside the API process, which holds',
      '`DATABASE_URL` and the provider key in its environment:',
      '',
      code(
        'js',
        'async function runPython({ source }) {',
        '  return execSync(`python3 -c ${JSON.stringify(source)}`).toString();',
        '}'
      ),
      '',
      'The mitigation on the ticket is a line in the system prompt telling the model not to touch the',
      'filesystem or the network.',
      '',
      'Say what is wrong with both halves.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'not a control',
            'is not a control',
            'not enforced',
            'nothing enforces',
            'cannot enforce',
            'does not enforce',
            'not enforcement',
            'a request',
            'a suggestion',
            'an instruction',
            'no guarantee',
          ],
          missingFeedback:
            'Say who the line in the system prompt is addressed to, and what it can do about what runs.',
        },
        {
          synonyms: [
            'untrusted',
            'zero trust',
            'zero-trust',
            'tool result',
            'tool results',
            'injection',
            'attacker',
            'a page it read',
            'what it read',
            'not yours',
            'did not write it',
          ],
          missingFeedback:
            'Say where the code came from, and why having written the prompt yourself does not make the output yours.',
        },
        {
          synonyms: [
            'same process',
            'api process',
            'your process',
            'environment',
            'env',
            'database_url',
            'credentials',
            'privileges',
            'secrets',
            'as the server',
          ],
          missingFeedback: 'The string executes somewhere. Say what that somewhere already holds.',
        },
      ],
      hints: [
        'Two separate mistakes. One is about who the instruction is addressed to; the other is about where the string ends up running.',
        'A system prompt shapes what gets generated and has no say over what happens once `execSync` has the string.',
        "The code runs in the API process, so it inherits that process's environment, credentials, filesystem and network. Move it somewhere holding none of them.",
      ],
    },
    canonicalAnswer:
      'The prompt half is not a control. It is an instruction to the thing writing the code, and nothing enforces it once `execSync` has the string; a model that never intended to disobey still produces code that does. The code half is worse, because that source is untrusted input rather than yours: whatever shaped it, a fetched page or a tool result, is content you do not control, so writing the prompt yourself buys nothing. Then `execSync` runs it inside the API process, which means the process environment, `DATABASE_URL` and the provider key, the filesystem and the network. The control is where it runs: a separate process holding no credentials, with no egress and a time and memory budget, while the API process keeps the secrets.',
    solution: md(
      'Nothing about the string changes. What changes is where it runs and what is reachable from',
      'there:',
      '',
      code(
        'js',
        'async function runPython({ source }, session) {',
        '  // A different process, a different user, and an environment built rather than inherited.',
        '  return runner.exec(source, {',
        '    env: {}, // not process.env',
        '    network: false, // link-local included, so no metadata service',
        '    timeoutMs: 10_000,',
        '    memoryMb: 512,',
        "    scope: session.workspaceId, // the only data it can see is this session's",
        '  });',
        '}'
      )
    ),
    explanation:
      'OWASP files this as improper output handling: insufficient validation and handling of model output before it is passed downstream, with output entered directly into a shell or `exec` or `eval` named as the path to remote code execution, and the guidance is to treat the model as any other user and adopt a zero-trust approach to what comes back. Zero trust is the useful part, because it settles the objection that you wrote the prompt: the answer was shaped by tool results and fetched pages that you did not, which is the same surface the tool-call loop already has to survive. From there this is not an AI problem at all. Generated code executes with the privileges of whatever executes it, and `execSync` in the API process means the API process, environment variables included, which is why no amount of prompt engineering is a mitigation and why a `node:vm` context is not either. The three subtractions worth making are credentials, egress and time, and they have to be made by whatever starts the runner, because code cannot be asked to decline privileges it already has.',
  },

  {
    slug: 'security-vm-boundary-and-its-cost',
    title: 'A container per job, or a VM per job',
    category: 'security',
    difficulty: 'hard',
    relevance: 'foundational',
    type: 'explain',
    prompt: md(
      "Two designs for running other people's code on shared hosts:",
      '',
      '- a container per job, with no capabilities and a seccomp filter',
      '- a virtual machine per job',
      '',
      'Say what the virtual machine moves the boundary to, what that costs, and what both designs',
      'still have in common underneath.'
    ),
    graderConfig: {
      groups: [
        {
          synonyms: [
            'own kernel',
            'its own kernel',
            'separate kernel',
            'second kernel',
            'guest kernel',
            'hypervisor',
            'kvm',
            'virtualisation boundary',
            'virtualization boundary',
          ],
          missingFeedback:
            'The container was talking to your kernel. Say what the guest talks to instead.',
        },
        {
          synonyms: [
            'boot',
            'start-up',
            'startup',
            'start up',
            'slower to start',
            'memory',
            'ram',
            'overhead',
            'density',
            'per instance',
            'per job',
          ],
          missingFeedback: 'A second kernel is not free. Say what it costs per instance.',
        },
        {
          synonyms: [
            'hardware',
            'cpu',
            'processor',
            'physical',
            'side channel',
            'side-channel',
            'silicon',
            'same machine',
            'same host',
            'same box',
          ],
          missingFeedback: 'Say what both designs still put in common, below whichever boundary.',
        },
      ],
      hints: [
        'Ask what the untrusted code is actually talking to in each design, and how wide that interface is.',
        'A guest has its own kernel, so the boundary drops to the hypervisor: a vCPU, some memory and a handful of emulated devices instead of hundreds of system calls.',
        "It costs a boot and a kernel's worth of memory per job, and both designs still share the hardware.",
      ],
    },
    canonicalAnswer:
      'The virtual machine gives the job its own kernel, so what the untrusted code talks to is the hypervisor rather than yours: a vCPU, some memory and a handful of emulated devices, against a system call interface hundreds of calls wide. What it costs is a second kernel per job, a boot to sit through and memory spent whether the job uses it or not, which is why nobody put a VM on a request path until the device model was cut down to make it cheap. What both still share is the hardware, so a CPU side channel does not care which side of the boundary you are on, and the hypervisor is software with bugs of its own, which is why the people who build them put a second barrier behind the first.',
    solution: md(
      'Where the untrusted code stops, in each design:',
      '',
      code(
        'text',
        'container per job                    VM per job',
        '',
        '  job A      job B                     job A         job B',
        '    |          |                         |             |',
        '  glibc      glibc                    guest kernel  guest kernel',
        '    |          |                         |             |',
        '  ====== syscalls ======             ===== hypervisor =====   <- boundary',
        '    |          |                         |             |',
        '     host kernel      <- boundary          host kernel',
        '    |          |                         |             |',
        '      hardware                             hardware    <- shared either way'
      )
    ),
    explanation:
      "The two designs differ in one thing, which is what the untrusted code is allowed to talk to. A container talks to your kernel through system calls, and Docker's default seccomp profile disables around 44 of 300-plus, so the interface is still a few hundred entry points into code that also runs everything else on the box. A guest kernel absorbs those calls itself, and what reaches your side is the hypervisor: Firecracker exposes five emulated devices, virtio-net, virtio-block, virtio-vsock, a serial console and a minimal keyboard controller, which is a far smaller thing to get right. The cost used to settle the argument on its own, and microVMs are why it no longer does: Firecracker reports under 5 MiB of memory overhead per microVM, user space in as little as 125ms, and up to 150 microVMs per second per host, which is what let AWS put a VM boundary between Lambda tenants. The last part is the one worth carrying: Firecracker's own design treats every vCPU thread as running malicious code from the moment it starts, runs unprivileged in a chroot with seccomp filters, and describes the jailer as a second line of defence in case the virtualization barrier is ever compromised. Nobody who builds these treats one boundary as sufficient.",
  },
];
