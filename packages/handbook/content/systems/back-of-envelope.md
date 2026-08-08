---
title: Back-of-envelope estimation
question: Nobody expects the exact number. So what is the answer supposed to look like?
order: 14
practise:
  - sys-back-of-envelope
sources:
  - author: Donne Martin
    title: System Design Primer
    url: https://github.com/donnemartin/system-design-primer
  - author: Peter Norvig
    title: Teach Yourself Programming in Ten Years
    url: https://www.norvig.com/21-days.html
  - author: Colin Scott
    title: Latency Numbers Every Programmer Should Know
    url: https://colin-scott.github.io/personal_website/research/interactive_latency.html
  - author: NIST
    title: Prefixes for binary multiples
    url: https://physics.nist.gov/cuu/Units/binary.html
verified: 2026-08-01
---

## The model

The answer is a method, performed out loud. Four rules carry all of it.

- **State every assumption as an assumption.** "I am going to say 20 requests per user per day"
  invites a correction. A number that appears without a source cannot be corrected, so nobody can
  follow the rest.
- **Round to one significant figure.** 5 million, not 4.8 million. The inputs were guesses, and
  carrying digits they never had makes the arithmetic slower and the answer no better.
- **Work in powers of ten.** `10^7 x 20 = 2 x 10^8` is a step you can do while talking. The same
  sum written out in full is a step you get wrong while talking.
- **Check the result against something you already know.** A year of data that fits on one disk is a
  different conversation from one that needs a fleet, and you only find out which by asking.

What is worth memorising is short.

**Seconds in a day: 86,400.** Round it to 10^5 and every rate becomes a subtraction of exponents.

**Bytes, in decimal:** KB 10^3, MB 10^6, GB 10^9, TB 10^12. The binary units are the ones with the
`i` (NIST: 1 GiB is 2^30 = 1,073,741,824 bytes against a GB's 10^9), and the 7% gap at that scale is
smaller than the error in anything you are estimating. Use decimal and say so.

**The orders of magnitude between the places data lives.** Peter Norvig published this table in
2002; Colin Scott keeps an interactive version that scales the figures by year. Every row is an
order of magnitude, not a measurement:

```
memory read                   ~100 ns
SSD random read                ~10 us      ~100x a memory read
round trip, same datacentre   ~500 us
disk seek                      ~10 ms      ~1,000x an SSD read
round trip, across an ocean   ~150 ms
```

The shape is what you use. Memory is effectively free, an SSD is cheap, and the moment a request
leaves the building it costs more than the local work you were worried about. Most of the ocean
number is the speed of light through fibre, so tuning does not move it.

## Worked example

Storage and traffic for a service, from daily active users. Everything above the line is a guess,
said out loud so it can be argued with.

```
assumed
  daily active users              10,000,000   = 10^7
  requests per user per day               20
  peak hour vs the daily average          3x
  requests that store a row          1 in 10
  bytes per stored row                  1 KB   = 10^3

requests per second
  10^7 x 20                    = 2 x 10^8 requests a day
  seconds in a day             = 86,400, call it 10^5
  2 x 10^8 / 10^5              = 2,000 req/s   average
  x 3                          = 6,000 req/s   at peak

storage a year
  2 x 10^8 / 10                = 2 x 10^7 rows a day
  x 10^3 bytes                 = 2 x 10^10 bytes = 20 GB a day
  x 365, call it 400           = 8,000 GB = 8 TB a year
```

Two roundings, both worth naming as you make them: 86,400 up to 10^5 puts the rate about 14% low,
and 365 up to 400 puts the storage about 10% high. Both are far inside the error of "20 requests per
user per day", which was invented.

Now the step people skip. Is 8 TB large? A year of it fits on a couple of commodity SSDs, so storage
is a retention policy rather than an architecture, and there is nothing here to design. 6,000 req/s
at peak is the number still worth arguing about, because whether one machine serves that depends on
what a request costs, and nothing so far has said. The estimate earned its keep by telling you which
half of the problem to spend the conversation on.

## Traps

**The answer came out as 43.7 TB.** Three significant figures on inputs that were round guesses.
The precision is invented, and quoting it says you did not notice, which is the thing being marked.
Round the answer back to the precision the worst input had.

**The capacity worked out in the estimate and the service fell over at 8pm.** The average rate was
sized for and traffic is not flat across a day. Pick a peak-to-average multiplier, say it out loud
as an assumption, and size against the peak.

**A number was produced and the conversation moved on.** An estimate is only useful once compared
with something: a disk, a machine's requests per second, last month's bill. Finish with "so this is
small" or "so this needs sharding", because that sentence is what the estimate was for.

**The chain lost a factor and nobody caught it.** Skipped steps hide missing terms, like retention
days or the fact that a day has 1,440 minutes rather than 1,000. Write each multiplication on its
own line with its unit attached, and the missing one shows up as units that do not cancel.
