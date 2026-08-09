---
title: Permissions, ownership, and why the container is not root
question: The file is right there and the process cannot read it. Permission denied by whom?
order: 4
practise:
  - node-privileged-port-in-the-container
  - node-eacces-on-the-mounted-volume
  - node-root-owns-the-files-it-wrote
sources:
  - author: Linux man-pages
    title: credentials(7)
    url: https://man7.org/linux/man-pages/man7/credentials.7.html
  - author: Linux man-pages
    title: path_resolution(7)
    url: https://man7.org/linux/man-pages/man7/path_resolution.7.html
  - author: Linux man-pages
    title: ip(7)
    url: https://man7.org/linux/man-pages/man7/ip.7.html
  - author: Docker
    title: 'Dockerfile reference: USER'
    url: https://docs.docker.com/reference/dockerfile/
  - author: Node.js Docker Team
    title: 'docker-node: 24/bookworm-slim/Dockerfile'
    url: https://github.com/nodejs/docker-node/blob/main/24/bookworm-slim/Dockerfile
verified: 2026-08-09
---

## The model

Two numbers on the process, three numbers on the file, and one comparison between them.

The process carries a user id and a group id. `credentials(7)` describes the effective pair as the
ones "used by the kernel to determine the permissions that the process will have when accessing shared
resources". They are integers. Names like `node` and `alex` live in `/etc/passwd`, which is userspace
convenience and which the kernel never consults.

The file carries an owner id, a group id, and nine mode bits in three groups of three. Read, write and
execute, for owner, group and everybody else. `path_resolution(7)` says which group is used, and this
is the sentence worth memorising:

> The first group of three is used when the effective user ID of the calling process equals the owner
> ID of the file. The second group of three is used when the group ID of the file either equals the
> effective group ID of the calling process, or is one of the supplementary group IDs of the calling
> process. When neither holds, the third group is used.

**One group applies, and it is the first one that matches.** Not the union, not the most permissive.
That is why a file you own with mode `077` is a file you cannot read: you match as the owner, the
owner bits say nothing, and the check is over before the generous bits for the group and for everybody
else are looked at. Measured here on macOS: `chmod 077` on a file owned by the current user, then
reading it from Node, gives `EACCES`.

One extra rule that surprises people: on a directory, the execute bit means search. Without it you
cannot resolve a path through the directory at all, however readable the file at the end of it is.

Containers do not change any of this, which is the whole point of the page. A container shares the
host's kernel, and a bind mount is the host's own file system, so the numbers are the host's numbers
and nothing translates them at the boundary. The official Node images create their user with
`useradd --uid 1000`, so `USER node` means the process runs as uid 1000, and uid 1000 is uid 1000 on
both sides of the mount. Root in a container is uid 0, and uid 0 is root.

```
  host                                container
  /srv/data  owner uid 1000  ───────  /data      the same directory, the same numbers
                                      process uid 1000   matches the owner, can write
                                      process uid 0      root, and writes root-owned files
                                      process uid 65534  EACCES
```

Ports work the same way, one layer over. `ip(7)`: ports below 1024 are privileged, and "only a
privileged process (on Linux: a process that has the CAP_NET_BIND_SERVICE capability in the user
namespace governing its network namespace) may bind to these sockets". Drop root and you drop that,
which is why a container that used to bind 80 stops being able to.

## Worked example

The two halves of a non-root container, which have to agree on a number:

```dockerfile
FROM node:24-slim
WORKDIR /app
COPY --chown=node:node . .
RUN npm ci --omit=dev
USER node
EXPOSE 3000
CMD ["node", "server.js"]
```

```bash
# On the host, before anything is mounted at /data:
chown -R 1000:1000 /srv/app-data
docker run -v /srv/app-data:/data -p 80:3000 app
```

Three things are doing work. `COPY --chown=node:node` lands the application files under the uid that
will run them, since everything before `USER` runs as root and copies as root. `chown -R 1000:1000` on
the host gives the volume the same owner, which is the one thing `chmod` cannot do for you. And the
app listens on 3000 while the runtime maps 80, because binding 80 needs a capability a web app has no
reason to hold.

## Traps

**It booted until somebody added `USER node`.** `EACCES` on a mounted volume means uid 1000 is neither
the owner nor in the owning group, so it is being checked against the last three bits. The fix is
ownership on the host side, not the mode: `chmod 777` makes it work, opens the directory to every
account on the machine, and leaves the mismatch in place for the next volume.

**A file the container wrote cannot be deleted on the host.** The container ran as root, the bind
mount stored uid 0, and now `rm` on your laptop wants `sudo`. A CI job hits the same thing as a
cleanup step that fails. Running as a non-root uid that owns the directory prevents it; this is the
practical half of "don't run as root", and it bites long before anything security-shaped does.

**Permission denied on a port nothing is using.** `EADDRINUSE` is a clash; `EACCES` on a listen is the
privileged-port rule, everything below 1024. Bind a high port and let the ingress, the load balancer
or `-p 80:3000` map it. macOS does not enforce the restriction at all, which is precisely why this is
found in CI.

**The file is readable and the read still fails.** Check the directories on the way to it. Traversing
a path needs the execute bit on every directory in it, and a `700` directory hides a `644` file from
everyone but its owner.
