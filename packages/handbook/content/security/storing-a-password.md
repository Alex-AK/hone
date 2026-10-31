---
title: Storing a password
question: It is hashed, so why is that not the end of it?
order: 3
practise:
  - security-password-compare
  - security-password-hashing
  - security-rate-limit-auth
sources:
  - author: OWASP
    title: Password Storage Cheat Sheet
    url: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
  - author: OWASP
    title: Authentication Cheat Sheet
    url: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
  - author: IETF
    title: 'RFC 9106: Argon2 Memory-Hard Function for Password Hashing and Proof-of-Work Applications'
    url: https://www.rfc-editor.org/rfc/rfc9106.html
  - author: IETF
    title: 'RFC 7914: The scrypt Password-Based Key Derivation Function'
    url: https://www.rfc-editor.org/rfc/rfc7914.html
  - author: NIST
    title: NIST Special Publication 800-63B
    url: https://pages.nist.gov/800-63-4/sp800-63b.html
  - author: Node.js
    title: Crypto
    url: https://nodejs.org/api/crypto.html
  - author: C2SP
    title: PHC Strings
    url: https://c2sp.org/phc-strings
  - author: OpenBSD
    title: crypt(3)
    url: https://man.openbsd.org/crypt.3
  - author: OpenBSD
    title: crypt_checkpass(3)
    url: https://man.openbsd.org/crypt_checkpass.3
verified: 2026-08-02
---

When somebody signs up, you need to keep something that lets you check their password later without
keeping the password itself. The standard answer is a hash: a one-way scramble you can recompute and
compare but cannot reverse. This page is about why a hash alone is not enough. If the database is
ever stolen, the attacker can guess offline for as long as they like, and the way you hash decides
what each guess costs them.

## The model

**Hashing stops the table being a list of passwords. It does not stop anyone guessing.** Cracking a
stolen table never touches your server: pick a candidate, hash it, compare. The only thing you
control is what one guess costs, which is why OWASP rules out general-purpose hashes: "Fast hashing
algorithms such as SHA-256 are not suitable for password storage because they allow attackers to
perform large numbers of guesses quickly." You compute one hash per login. An attacker computes one
per candidate, against every account in the dump, on GPUs.

**The work factor is a dial you are expected to turn.** A password hash is slow on purpose, and you
set how slow. Often the factor is an exponent, so each step up doubles the work. That costs you one
slower login and costs the attacker every guess. NIST says to set it as high as is practical and
raise it over time, and OWASP caps it at under a second per hash. Set too high, a burst of login
attempts can exhaust your CPU, so keep it off the event loop: Node's `crypto.argon2` and
`crypto.scrypt` take a callback, and their `Sync` versions block everything while they run.

**Every password gets its own random salt, and it lives inside the hash string.** A salt is random
data mixed into each password before hashing. It makes precomputed lookup tables (rainbow tables)
useless, and it means two users with the same password store different values. There is no salt
column: the library generates the salt and writes it, with the algorithm and the cost, into the
string it returns.

```
$argon2id$v=19$m=65536,t=2,p=1$gZiV/M1gPc22ElAH/Jh1Hw$CWOrkoo7oJBQ/iyh7uJ0LO2aLEfrHwTWllSAxT0zRno
$2b$12$FPWWO2RJ3CK4FINTw0Hi8OiPKJcX653gzSS.jqltHFMxyDmmQ0Hqq
```

The first is Argon2 in the PHC string format: algorithm, parameters, salt, hash. In the bcrypt line,
`12` is the log of the round count, and the rest is 128 bits of salt followed by the hash. One text
column holds all of it, which is what NIST asks for, because storing the scheme and cost with each
password is what lets you migrate later.

**Memory is what keeps a guess expensive as hardware improves.** Chips get faster and smaller every
year, so RFC 7914 points out that a fixed iteration count gets cheaper to attack even while your
login time stays the same. Memory does not shrink the way logic does. A memory-hard function like
scrypt or Argon2 makes each guess need a large working set, so running a thousand guesses at once
needs a thousand times the RAM. Of the Argon2 variants, use Argon2id, the one RFC 9106 requires
every implementation to support.

### Choosing the algorithm

OWASP's minimums as of this page's verified date. These numbers move, so check the cheat sheet
before relying on them.

- **Argon2id** first: 19 MiB of memory, 2 iterations, parallelism 1. OWASP also lists equivalent
  settings that trade memory for iterations, from 46 MiB at t=1 down to 7 MiB at t=5.
- **scrypt** where Argon2id is not available: N=2^17, r=8, p=1.
- **bcrypt** for legacy systems only, at a work factor of 10 or more, with input capped at 72 bytes.
- **PBKDF2** where FIPS-140 compliance requires it: 600,000 iterations of HMAC-SHA-256.

RFC 9106 recommends more than that floor: 2 GiB where the machine has it, 64 MiB where memory is
tight. A login endpoint serves concurrent requests from the RAM it has, so pick a row and measure.

**bcrypt stops reading at 72 bytes.** Enforce the limit and reject longer input rather than hashing
a prefix, because NIST requires the whole password to be checked. Pre-hashing to shorten the input
is the usual workaround, and OWASP calls it dangerous for two reasons. bcrypt stops at the first
null byte, so any raw digest that starts with a zero byte hashes the same as an empty password.
Base64-encoding the digest fixes that and not the second problem, password shucking: if a password's
inner hash has leaked from another site, an attacker can test it against your bcrypt output
directly. OWASP's verdict on `bcrypt(base64(sha512($password)))` is that it "is as secure as just
using pure SHA-512". If you must pre-hash, OWASP's form keys it with a secret pepper:
`bcrypt(base64(hmac-sha384(data:$password, key:$pepper)), $salt, $cost)`.

### Around the hash

**Compare with the library's `verify`, never with `===`.** An ordinary comparison stops at the first
differing byte, so how long it takes leaks how much of the value matched. `verify` compares in
constant time, as `crypto.timingSafeEqual` does, and reads the parameters out of the stored string,
so it still checks hashes made with settings you have since changed.

**A pepper is a second secret, kept out of the database.** It is a key shared across every stored
hash, so a leaked table alone is not enough to start guessing. The cost is key management: it
belongs in a secrets vault or an HSM, and it cannot be changed without every user's password, so
rotating it forces a reset on everyone.

**You can only upgrade a hash while the password is in front of you.** Raising the cost or changing
the algorithm needs the plaintext, which you have only during a login. Rehash then, and expect the
table to hold a mix of old and new settings for a long time.

**The live login needs its own protection.** A good hash protects the dump and does nothing about
guessing against your login form. The algorithms are in [rate limiting](../apis/rate-limiting.md);
what a login adds is what you count. Count failures per account, so an attacker spread across many
IP addresses still trips a limit, and per source, so one password sprayed across every account trips
one too. NIST bounds the per-account counter at 100 consecutive failures.

Then make every failure look the same. A wrong password, a missing account and a locked account all
get one generic message, or the login form becomes a way to test whether an address has an account.
Timing counts as a difference: returning early for a missing user skips the slowest thing the
handler does. OpenBSD's `crypt_checkpass` builds the fix in, doing a default amount of hashing work
even when there is no stored hash to check against.

## Worked example

The login path with a password-hashing library, which is the version you should write:

```js
const DUMMY_HASH = await argon2.hash(randomUUID()); // a real hash of a value nobody knows
const GENERIC = { status: 401, body: { error: 'Invalid email or password' } };

async function login(email, password) {
  const user = await users.findByEmail(email);

  // Hash either way, so a missing account is not the fast path.
  const ok = await argon2.verify(user?.passwordHash ?? DUMMY_HASH, password);
  if (!user || !ok) return GENERIC;

  // The parameters are in the stored string, so "stale" compares them against current settings.
  if (isStale(user.passwordHash)) {
    await users.setPasswordHash(user.id, await argon2.hash(password));
  }

  return { status: 200, body: startSession(user) };
}
```

Node has shipped the primitive in core since v24.7.0, and it shows what the library hides.
`crypto.argon2` takes `memory` in 1 KiB blocks (so 19456 is OWASP's 19 MiB), `passes`,
`parallelism` and a `nonce` you generate and store yourself. It returns a raw tag, with no encoded
string and no verify, which is what `crypto.timingSafeEqual` is then for.

## Traps

**Hashing the right password gives a different string from the one in the database.** Every call
salts afresh, so `hash(password) === stored` is false for a correct password and always will be.
Pass the stored hash to the library's `verify`, which reads the salt and the parameters out of it.

**Two different long passphrases log the same user in.** bcrypt reads at most 72 bytes and those two
share their first 72. Enforce the limit at the boundary, and remember it counts bytes, so an emoji
costs more than one character's worth.

**Everyone who chose the same password has the same value in the column.** Nothing is salted, which
in practice means a hand-rolled `sha256(password)` or one app-wide salt constant. That table is a
lookup away from plaintext, and it tells an attacker which accounts to crack first.

**The cost factor went up in config and nothing changed for existing users.** Old rows still carry
the old parameters, and no batch job can fix that without the plaintext. Rehash on the next
successful login, while the password is in memory.

**Pre-hashing to get past bcrypt's 72 bytes left the hash no stronger than SHA-512.** That is
password shucking: an attacker holding the inner hash from another breach tests it against your
bcrypt output directly, so your cost factor never enters the fight.

**A wrong email answers in milliseconds and a wrong password takes a quarter of a second.** The
handler returns early when the account is missing, so timing sorts real addresses from invented ones
even though both replies read "Invalid email or password". Hash against a dummy value on that path
and return the same body with the same status.
