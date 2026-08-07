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
];
