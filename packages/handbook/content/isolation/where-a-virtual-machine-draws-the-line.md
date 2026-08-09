---
title: Where a virtual machine draws the line
question: What does a VM contain that a container does not, and what does that cost?
order: 3
practise:
  - security-container-shared-kernel
  - security-sandbox-with-network
  - security-vm-boundary-and-its-cost
sources:
  - author: Firecracker
    title: 'Firecracker: secure and fast microVMs for serverless computing'
    url: https://firecracker-microvm.github.io/
  - author: Firecracker
    title: Firecracker design
    url: https://github.com/firecracker-microvm/firecracker/blob/main/docs/design.md
  - author: Docker
    title: Seccomp security profiles for Docker
    url: https://docs.docker.com/engine/security/seccomp/
  - author: Linux man-pages
    title: namespaces(7)
    url: https://man7.org/linux/man-pages/man7/namespaces.7.html
verified: 2026-08-09
---

## The model

The whole difference is what the untrusted code is allowed to talk to.

A container talks to your kernel, through system calls. Docker's default seccomp profile denies
"around 44 system calls out of 300+", so what is left is a few hundred entry points into the code
that also runs your database and every other tenant, and all of it has to be right.

A virtual machine gives the guest its own kernel. The guest's system calls are answered by the
guest's kernel, and what reaches your side is the hypervisor: a virtual CPU, a region of memory, and
a few emulated devices. Firecracker's number for that surface is five, "virtio-net, virtio-block,
virtio-vsock, serial console, and a minimal keyboard controller". The boundary did not get stronger
by being described differently. It got narrower, from a few hundred calls to a handful of devices.

### What it cost, and why that stopped being the answer

A second kernel is not free. It boots, and it holds memory whether or not the workload uses it, and
both are paid per instance. That is why virtual machines lived at the bottom of the stack for twenty
years, one per host or one per tenant per month, and nobody put one on a request path.

microVMs are what happens when you keep the hypervisor and delete the rest of the machine. Firecracker
reports "a reduced memory overhead of less than 5 MiB" per microVM, user space or application code "in
as little as 125 ms", and "microVM creation rates of up to 150 microVMs per second per host". It was
built for exactly the problem this section is about: to let AWS Lambda and Fargate improve utilisation
while providing "the security and isolation required of public cloud infrastructure", so that
"workloads from different end customers can run safely on the same machine".

That is why the people running other people's code ended up here. They were not choosing a boundary
on strength. The strong boundary was always available and unaffordable per request, and cutting the
device model is what made it affordable.

### Nobody who builds one treats it as sufficient

The most useful thing in Firecracker's design document is how little it trusts its own boundary. It
assumes "all vCPU threads are considered to be running malicious code as soon as they have been
started", nests trust zones "which increment from least trusted (guest vCPU threads) to most trusted
(host)", filters its own host system calls, and ships a jailer that "sets up system resources that
require elevated permissions (e.g., cgroup, chroot), drops privileges, and then `exec()`s into the
Firecracker binary, which then runs as an unprivileged process". The document says why in a phrase
worth keeping: the jailer is "a second line of defense in case the virtualization barrier is ever
compromised".

So the honest ordering is not container against VM. It is that a hypervisor is a much smaller thing
to get right than a kernel, and the people who wrote one put a container's worth of restrictions
behind it anyway.

## Worked example

Where the untrusted code stops in each design:

```text
   container per job                        microVM per job

  job A         job B                     job A          job B
    |             |                         |              |
  libc          libc                   guest kernel   guest kernel
    |             |                         |              |
  ==== hundreds of syscalls ====       ==== 5 devices + vCPU ====   <- boundary
    |             |                         |              |
       host kernel      <- boundary        Firecracker (unprivileged,
    |             |                         chroot, seccomp, cgroups)
                                                  |
                                             host kernel
    |             |                         |              |
       hardware                                 hardware        <- shared either way
```

Two things fall out of the picture. The VM stack is taller, which is the 125ms and the 5 MiB. And the
bottom row is identical, which is the part vendors do not put on the diagram: a side channel in the
processor does not know which boundary is above it, and both designs are still one machine.

## Traps

**"Each tenant gets a VM, so tenants are isolated."** The hypervisor is shared and is software, and
the hardware is shared and has published side channels. Firecracker's own answer to "what if the
virtualization barrier fails" is a second barrier, not a claim that it will not. Treat a VM as the
strongest boundary you can buy on one machine, and separate machines as the thing above it.

**"We will boot a VM per request."** Only with the device model cut down. 125ms is Firecracker's
number for a stripped microVM booting a minimal guest, and a general-purpose VM with a full device
model and a distribution's init is seconds. If a design assumes a VM starts like a container, check
which kind of VM the number came from.

**"A microVM is just a fast container."** It is a VM with almost all of the machine deleted. The
125ms and the 5 MiB are the price of the second kernel, paid down rather than removed, and what you
get for them is the thing a container cannot offer at any price: your kernel is no longer on the
other side of the interface.

**The sandbox had no credentials and still used the host's.** Choosing a boundary settles what the
code can do to the machine, and says nothing about what it can reach over the network. A microVM with
default networking on a cloud instance can still call the metadata service. Egress is a separate
subtraction and it is the one people skip; [the next page](./running-code-a-model-wrote.md) is where
it bites.

**Neither, because the workload is trusted.** Worth checking who "trusted" covers. Dependencies run
install scripts, a build reads a lockfile resolved from the internet, and an agent runs code shaped by
a page it fetched. The question is never "do I trust this person", it is "what is the worst this
input can do", and most answers to that arrive later than the design.
