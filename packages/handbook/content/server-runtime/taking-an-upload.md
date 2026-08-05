---
title: Taking an upload
question: Someone is uploading a 2 GB video to my endpoint. What is my process supposed to do with it?
order: 4
practise:
  - security-nosniff-mime
  - node-flowing-mode-ignores-async
  - node-pipeline-over-pipe
  - http-body-once
  - http-upload-size-limit
  - streaming-export-express
sources:
  - author: MDN
    title: POST request method
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Methods/POST
  - author: IETF
    title: 'RFC 7578: Returning Values from Forms: multipart/form-data'
    url: https://www.rfc-editor.org/rfc/rfc7578
  - author: OWASP
    title: File Upload Cheat Sheet
    url: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
  - author: Node.js
    title: 'Stream: stream.pipeline(streams, callback)'
    url: https://nodejs.org/api/stream.html#streampipelinestreams-callback
  - author: Express
    title: body-parser middleware
    url: https://expressjs.com/en/resources/middleware/body-parser/
  - author: Amazon Web Services
    title: Download and upload objects with presigned URLs
    url: https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html
verified: 2026-08-04
---

The browser half of this is settled: a form with a file needs `multipart/form-data`, and
[submitting a form](../browser/submitting-a-form.md) covers what the boundary is and how to avoid
destroying it. This page is what happens after those bytes reach your process, which is a different
question with a worse failure mode, because the thing arriving is as large as somebody's phone will
let it be.

## The model

**A body is a stream, and buffering it is a decision you can make by accident.** Body parsers buffer:
that is their whole job, and `express.json()` is documented as parsing "incoming requests with JSON
payloads", with a `limit` option that defaults to `"100kb"`. That default is doing more work than
people notice, because the moment a parser has run, the size of the request is a number in your heap
rather than a number on the wire. For a file that is exactly the wrong shape. What you want is the
bytes going somewhere else as they arrive, which is [backpressure](./backpressure.md) pointed at the
request instead of the response, and `pipeline` rather than `pipe`, because Node describes it as
piping "forwarding errors and properly cleaning up" while `pipe` leaves the destination open when the
source fails.

**The limit is only real where the bytes stop.** `Content-Length` is the sender's arithmetic, and a
chunked request does not carry one at all, so a limit that reads the header is a limit against
honest clients. The enforcement that works counts bytes as they arrive and destroys the request when
the count passes the cap. Where a parser is doing this for you, know what it does when it trips:
body-parser sets "the status property is set to 413 and the type property is set to
'entity.too.large'". Its own advice is not to raise the number casually, because "allowing larger
payloads increases memory usage because of the resources required for decoding and transformations".

**Everything the client says about the file is a claim.** A multipart part carries a
`Content-Disposition` header naming the field and, for a file, a `filename`, and it may carry its own
`Content-Type`. Both come from the sender. RFC 7578 is direct about the first: "do not use the file
name blindly, check and possibly change to match local file system conventions if applicable, and do
not use directory path information that may be present". OWASP is direct about the second, saying the
content type "is provided by the user, and as such cannot be trusted, as it is trivial to spoof",
while still being worth a glance because it catches the honest mistake. So the name you store is one
you generated, OWASP's own recommendation being "creating a random string as a filename, such as
generating a UUID/GUID", and the client's name survives as a label rather than as a path.

**The version of this endpoint that scales best never sees the bytes.** A presigned URL hands the
client a time-limited, pre-authorised request against object storage: AWS describes it as allowing
"an upload without requiring another party to have AWS security credentials or permissions", with
"the capabilities of a presigned URL limited by the permissions of the user who created it", and
warns that they are "bearer tokens that grant access to those who possess them". Your process signs
and records; the file goes straight past you. That moves every constraint you care about to signing
time, which is where the key, the expiry and any size condition are decided, and it leaves you one
new problem the streaming version does not have, which is that the object and the database row are
now two writes with nothing joining them.

## Worked example

Taking the bytes yourself, with the cap where the bytes are rather than in the header:

```js
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const MAX_BYTES = 25 * 1024 * 1024;

function capped(limit) {
  let seen = 0;
  return new Transform({
    transform(chunk, _encoding, done) {
      seen += chunk.length;
      done(
        seen > limit ? Object.assign(new Error('too large'), { code: 'TOO_LARGE' }) : null,
        chunk
      );
    },
  });
}

app.post('/uploads', async (req, res) => {
  const id = randomUUID(); // the name on disk is ours, not theirs
  try {
    await pipeline(req, capped(MAX_BYTES), createWriteStream(join(UPLOAD_DIR, id)));
    res.status(201).json({ id });
  } catch (err) {
    res.status(err.code === 'TOO_LARGE' ? 413 : 400).end();
  }
});
```

The counting happens in a `Transform` rather than in a `req.on('data')` handler for a reason: a
`data` listener switches the request into flowing mode, and then chunks arrive whether or not the
disk has kept up. `pipeline` is what destroys the whole chain when the cap trips or the client hangs
up mid-upload, which is the failure that actually happens.

Handing the bytes to storage instead is a smaller handler and a different bargain:

```js
// Sign, and record that we are expecting something.
const key = `uploads/${randomUUID()}`;
const url = await getSignedUrl(s3, new PutObjectCommand({ Bucket, Key: key }), { expiresIn: 300 });
await db.insert(uploads).values({ key, status: 'pending', ownerId: session.userId });

res.json({ url, key });
```

The client `PUT`s to that URL and then tells you it is done, and you flip the row to `stored`. Five
minutes is the whole window in which that URL is worth anything, and nothing in your process ever
holds the file.

## Traps

**It works locally and the proxy rejects it before your handler runs.** There are at least two size
limits in front of your code, yours and whatever is in front of you, and the outer one answers first
with its own error page in its own format. Find out what nginx, the platform ingress or the CDN is
configured to allow before tuning anything in the application, because a 413 from a proxy is not
something your error handler can dress up, and users will hit it long before they hit yours.

**The upload succeeded and there is no row, or the row is there and the file is not.** Once the bytes
live in object storage, the write to storage and the write to the database are two operations with no
transaction across them, and this is not a bug you can fix by ordering them cleverly. Write the row
first as pending, confirm it after the object lands, and sweep whatever never got confirmed. The
sweeper is the part everyone skips, and orphaned objects are cheap right up until they are a storage
bill nobody can explain.

**The file comes back out as a page.** An uploaded HTML file served from your origin with a
guessable type runs as your origin, which is
[what security headers are for](../headers/security-headers.md): serve uploads with `nosniff` and
`Content-Disposition: attachment`, and if the material is genuinely untrusted, OWASP's first
recommendation is to keep it on "a different host, which allows for complete segregation of duties
between the application serving the user, and the host handling file uploads and their storage".
Generating the stored name closes the other half of this, because a filename of `../../etc/passwd`
never reaches a path join in the first place.
