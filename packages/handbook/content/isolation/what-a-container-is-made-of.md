---
title: What a container is made of
question: It runs in a container. What is actually between it and the host?
order: 2
practise:
  - security-child-process-same-user
  - security-container-root-on-the-host
  - security-container-shared-kernel
sources:
  - author: Linux man-pages
    title: namespaces(7)
    url: https://man7.org/linux/man-pages/man7/namespaces.7.html
  - author: Linux man-pages
    title: user_namespaces(7)
    url: https://man7.org/linux/man-pages/man7/user_namespaces.7.html
  - author: Linux man-pages
    title: cgroups(7)
    url: https://man7.org/linux/man-pages/man7/cgroups.7.html
  - author: Docker
    title: Docker Engine security
    url: https://docs.docker.com/engine/security/
  - author: Docker
    title: Seccomp security profiles for Docker
    url: https://docs.docker.com/engine/security/seccomp/
  - author: Docker
    title: docker container run
    url: https://docs.docker.com/reference/cli/docker/container/run/
verified: 2026-08-09
---

## The model

There is no container object in Linux. A container is an ordinary process, the one from
[the previous page](./what-a-process-gives-you.md), with three unrelated kernel features applied to
it. Learning which of the three does what is most of the subject, because almost every wrong
expectation about containers is one of them being credited with another's job.

**Namespaces decide what it can see.** `namespaces(7)`: a namespace "wraps a global system resource
in an abstraction that makes it appear to the processes within the namespace that they have their own
isolated instance of the global resource." There are eight, and they are independent, so a process
can be in a new one of some and the host's for the rest:

| Namespace | Flag              | Isolates                             |
| --------- | ----------------- | ------------------------------------ |
| Mount     | `CLONE_NEWNS`     | Mount points                         |
| PID       | `CLONE_NEWPID`    | Process IDs                          |
| Network   | `CLONE_NEWNET`    | Network devices, stacks, ports, etc. |
| IPC       | `CLONE_NEWIPC`    | System V IPC, POSIX message queues   |
| UTS       | `CLONE_NEWUTS`    | Hostname and NIS domain name         |
| User      | `CLONE_NEWUSER`   | User and group IDs                   |
| Cgroup    | `CLONE_NEWCGROUP` | Cgroup root directory                |
| Time      | `CLONE_NEWTIME`   | Boot and monotonic clocks            |

**cgroups decide what it can use.** `cgroups(7)`: a Linux kernel feature "which allow processes to be
organized into hierarchical groups whose usage of various types of resources can then be limited and
monitored." Docker's own framing is the honest one: they "help ensure that each container gets its
fair share of memory, CPU, disk I/O". This is accounting, not access. A memory limit stops one
tenant eating the host and stops nothing else.

**Capabilities and seccomp decide what it can ask the kernel for.** Docker "starts containers with a
restricted set of capabilities", and its default seccomp profile is an allowlist that "denies access
to system calls by default and then allows specific system calls", disabling "around 44 system calls
out of 300+".

Underneath all three there is one kernel, running your code and every container's code, and the
boundary is the system call interface. Denying 44 of 300-plus calls leaves a few hundred entry points
into the kernel that also runs everything else on the box, which is what makes a container a good
boundary against a mistake and a much weaker one against somebody trying. Docker states the limit in
its own security documentation: "One primary risk with running Docker containers is that the default
set of capabilities and mounts given to a container may provide incomplete isolation."

### The user namespace is the one that is usually off

Seven of the eight change what a process sees. The user namespace changes who it is, and it is the
one you have to ask for. `user_namespaces(7)` describes exactly the property: "A process can have a
normal unprivileged user ID outside a user namespace while at the same time having a user ID of 0
inside the namespace; in other words, the process has full privileges for operations inside the user
namespace, but is unprivileged for operations outside the namespace."

Without one there is no mapping to apply, so uid 0 in the container is uid 0 to the kernel, which is
the uid 0 that owns the host. The capability set and the seccomp filter are what stand between that
and a root shell.

## Worked example

The picture, with the boundary marked:

```text
  container A          container B          your shell
  (ns, cgroup)         (ns, cgroup)         (host ns)
       |                    |                    |
  ===================== system calls ======================  <- the boundary
       |                    |                    |
                     one host kernel
                            |
                        hardware
```

And the same thing as flags, each one taking a row off the table on the previous page:

```text
docker run \
  --user 1000:1000 \      # not root, so a bind-mounted write lands as that uid
  --read-only \           # the image's filesystem, minus writes
  --cap-drop=ALL \        # nothing left to ask the kernel to do as root
  --security-opt=no-new-privileges \
  --network=none \        # no egress, link-local included
  --memory=512m --pids-limit=128 \
  builder
```

What is not on that list is a second kernel, and there is no flag that adds one. That is
[the next page](./where-a-virtual-machine-draws-the-line.md).

## Traps

**The CI user cannot delete its own build output.** The build ran as root, no user namespace was in
play, and root in the container is root on the kernel, so the files in the bind mount are owned by
host root. `--user` fixes the symptom, `--userns-remap` fixes the property, and they are different
fixes: one changes who the process is, the other changes what root means.

**"Each tenant gets a container, so a compromised build cannot reach another."** Containers are
peers over one kernel. A kernel bug reachable through a system call the seccomp filter still permits
is an escape from any container to the host, and the host is every other tenant. That sentence is
true of virtual machines with a different word in it, and it is the reason the next page exists.

**`--privileged` because a tool needed one device.** It does not grant one device. Docker's own list
for the flag is every Linux capability enabled, the default seccomp profile disabled, the default
AppArmor profile disabled, all host devices granted, and `/sys` made read-write, with the conclusion
that such a container "is not a securely sandboxed process" and can "get a root shell on the host and
take control over the system". `--cap-add` with the one capability, or `--device` with the one
device, are the answers to the question that was actually asked.

**The Docker socket is bind-mounted so the container can start containers.** Anyone who can reach
that socket can ask the daemon to start a privileged container mounting `/`. Docker says as much:
"Only trusted users should be allowed to control your Docker daemon." A container with the socket is
not sandboxed at all, whatever else is set on it.

**The memory limit was treated as isolation.** cgroups bound consumption, not reach. A container
capped at 512 MB reads the same files and opens the same sockets as one that is not. Conversely,
namespaces bound reach and not consumption: without a limit, a fork bomb in the most thoroughly
namespaced container on the host still takes the host down.
