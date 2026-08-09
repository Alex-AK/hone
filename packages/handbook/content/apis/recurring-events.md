---
title: Recurring events
question: The meeting repeats every week. What goes in the row?
order: 6
practise:
  - dates-recurrence-month-end
  - dates-recurrence-nth-weekday
  - dates-nth-weekday-of-month
  - dates-recurrence-one-occurrence
  - dates-utc-storage
  - dates-dst-add-day
sources:
  - author: IETF
    title: 'RFC 5545: Internet Calendaring and Scheduling Core Object Specification (iCalendar)'
    url: https://www.rfc-editor.org/rfc/rfc5545.html
  - author: Google
    title: 'Calendar API: Events resource'
    url: https://developers.google.com/workspace/calendar/api/v3/reference/events
  - author: Google
    title: 'Calendar API: Recurring events'
    url: https://developers.google.com/workspace/calendar/api/guides/recurringevents
verified: 2026-08-08
---

## The model

A repeating meeting is one row, not many. The row holds a start, a zone and a rule; the occurrences
are computed when somebody asks for a date range.

That is forced rather than chosen. A rule with neither `COUNT` nor `UNTIL` repeats forever, so there
is no finite set to insert in the first place. And an expansion is a function of the timezone
database, which governments keep editing, so a set you did insert last year can be wrong this year
without anybody touching it.

The rule format is `RRULE`, from RFC 5545, which is what every calendar server and every calendar API
speaks:

```
DTSTART;TZID=Europe/Dublin:20260106T090000
RRULE:FREQ=WEEKLY;BYDAY=TU
```

`RRULE` carries no start of its own, and no time of day either. `DTSTART` is both, and it fills in
every field the rule leaves unspecified: "Information, not contained in the rule, necessary to
determine the various recurrence instance start time and dates are derived from the Start Time
('DTSTART') component attribute." `DTSTART` is also the first occurrence, which is why `COUNT=10`
means nine more after it.

`COUNT` and `UNTIL` are the two ways to end a series and they may not both appear. `UNTIL` has one
rule worth memorising, because breaking it moves the last occurrence rather than failing: once
`DTSTART` names a zone, `UNTIL` "MUST be specified as a date with UTC time".

```
stored once                              expanded per request
┌────────────────────────────────────┐
│ starts_at  2026-01-06 09:00        │   window: 2026-03-01 .. 2026-04-01
│ zone       Europe/Dublin           │
│ rule       FREQ=WEEKLY;BYDAY=TU    │ ─────▶  Tue 03 Mar 09:00  =  09:00Z
│ override   2026-03-17  cancelled   │         Tue 10 Mar 09:00  =  09:00Z
└────────────────────────────────────┘         (17 Mar excluded)
                                               Tue 24 Mar 09:00  =  09:00Z
                                               Tue 31 Mar 09:00  =  08:00Z
                                                                     ▲
                                       same 09:00, one hour earlier in UTC:
                                       Ireland moved to UTC+1 on 29 March
```

**Expand the simple rules yourself, and stop there.** `FREQ=DAILY` and `FREQ=WEEKLY;BYDAY=...` are an
afternoon's work, and the reps below ask for them, because output you cannot predict is output you
cannot debug. Full `RRULE` is a different proposition, and `WKST` is the cheapest demonstration: it
names the day the week starts on, defaults to `MO`, and matters "when a WEEKLY 'RRULE' has an
interval greater than 1, and a BYDAY rule part is specified". Here is the RFC's own pair, from a
`DTSTART` of 5 August 1997, differing in nothing else:

```
FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=MO  ==> August 5, 10, 19, 24
FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=SU  ==> August 5, 17, 19, 31
```

## Worked example

Two tables. The first is the series, the second is every way a single occurrence departs from it.

```sql
-- SQLite. In Postgres, starts_at is `timestamp` (without time zone) and zone stays `text`.
create table meeting (
  id           integer primary key,
  title        text    not null,
  starts_at    text    not null,  -- '2026-01-06T09:00', a wall clock with no offset
  zone         text    not null,  -- 'Europe/Dublin'
  duration_min integer not null,
  rule         text    not null   -- 'FREQ=WEEKLY;BYDAY=TU'
);

create table meeting_override (
  meeting_id integer not null references meeting(id),
  occurrence text    not null,  -- the local start this occurrence WOULD have had
  cancelled  integer not null default 0,
  starts_at  text,              -- set when this one occurrence moved
  primary key (meeting_id, occurrence)
);
```

The endpoint takes a window, not a page. There is no last page of an infinite series, so the caller
names two instants and gets what falls between them:

```ts
// GET /meetings?from=2026-03-01T00:00:00Z&to=2026-04-01T00:00:00Z
const overrides = new Map(rows.map((o) => [o.occurrence, o]));

const occurrences = expand(meeting.rule, meeting.starts_at, meeting.zone, from, to).flatMap(
  (local) => {
    const override = overrides.get(local); // keyed on the original start, not on an id
    if (override?.cancelled) return [];
    return [{ meetingId: meeting.id, startsAt: override?.starts_at ?? local, original: local }];
  }
);
```

`occurrence` is the column doing the real work. An occurrence has no id, because it has no row, so
the only stable name it has is the start the rule would have given it. RFC 5545 calls that
`RECURRENCE-ID`; the Google Calendar API returns it as `originalStartTime`, "the time at which this
event would start according to the recurrence data in the recurring event".

## Traps

**The month-end review skipped February.** `FREQ=MONTHLY;BYMONTHDAY=31` fires seven times in 2026,
not twelve: February, April, June, September and November have no 31st. The spec is explicit that
this is a skip rather than a nudge back to the 28th or the 30th, and that the skipped one is not
counted either: such instances "MUST be ignored and MUST NOT be counted as part of the recurrence
set". The RFC's own example shows the counting half, five occurrences of `BYMONTHDAY=15,30;COUNT=5`
starting 15 January 2007:

```
January 15, January 30, February 15, March 15, March 30
```

If you meant the last day of the month, say that instead: `BYMONTHDAY=-1` gives 31, 28, 31, 30 and
handles the leap year on your behalf.

**The standup moved to 10:00 after the clocks changed.** Somebody stored the occurrences as UTC
instants. A repeating meeting is a wall-clock time in a named zone, and only the zone knows when its
offset moves: RFC 5545 says `DTSTART` "should be specified as a date with local time and time zone
reference to make sure all the recurrence instances start at the same local time regardless of time
zone changes", and Google's API makes it mandatory, "For recurring events this field is required and
specifies the time zone in which the recurrence is expanded". Store `09:00` and `Europe/Dublin`, and
let the expansion produce the instant. A stored instant is a snapshot of an answer the timezone
database is still allowed to change.

**Moving one meeting moved all of them.** Somebody dragged next Thursday's standup an hour later and
the handler wrote the new time onto the rule. The rule describes the series, so editing it edits
every occurrence, including the ones that already happened. A single occurrence changing is an
override row keyed on the start it would have had, and deleting one is the same shape: RFC 5545 has
`EXDATE` for it, and what is listed there takes "precedence over" anything the rule generates. Give
the UI three buttons, because the user means one of exactly three things: this occurrence, this and
following, or the whole series. The middle one ends the old rule with an `UNTIL` and starts a new
series the next day.
