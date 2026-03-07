# First State of the Union

Status: operator-facing state snapshot

This document records the first clear state-of-the-union snapshot for Founderos as it exists right now.

It is not the master spec.
It is not the full live-state mirror.
It is a plain-language checkpoint of what Founderos has already become, what is working, what is still bounded, and what comes next.

The purpose of this file is to make it easy to answer one question:

**Where are we right now, really?**

## Founderos at this moment

Founderos is no longer just an idea, prompt pattern, or repo sketch.

It is now a real bounded system with:

- a live APS control plane
- a public GPT-facing contract
- a private async worker lane
- durable orchestration state
- durable witness logging
- governed GitHub write capability
- a documented architecture for bounded self-improvement

The system is still early, but it is real.

## What is live

The active runtime shape is:

```text
ChatGPT Custom GPT
  -> public APS on Vercel
    -> Supabase orchestration and witness state
    -> private OpenClaw worker on VM
    -> GitHub repo reads through GitHub App auth
```

The documented public APS base URL is:

- `https://founderos-alpha.vercel.app`

The documented private worker host is:

- `https://claw.asalvocreative.com`

## What Founderos can do now

Founderos can currently:

- expose a public GPT-facing action surface through APS
- validate authenticated access through the write-key boundary
- inspect an allowlisted GitHub repo through APS
- read repo trees and individual files
- produce proposal-only planning artifacts
- create async orchestration jobs
- let a private worker claim those jobs
- store durable orchestration events and artifacts
- return durable job status to the caller
- perform governed GitHub writes through the exact write-set path
- enforce protected-path and witness-before-write rules

This means Founderos already has the seed of a real operating system shape:
read, reason, plan, queue, inspect, report, and govern execution.

## What the current worker does

The current worker loop can:

- poll for queued jobs
- claim a job through worker auth
- inspect the repo through APS
- inspect the README and current activation docs
- post heartbeat updates
- return a structured self-state snapshot
- return a bounded next-improvement proposal

That is enough to prove the async lane is real.

## What Founderos does not do yet

Founderos does not yet fully close the self-improvement loop.

It does not yet reliably:

- generate exact write sets automatically from worker output
- open PRs autonomously through the async worker lane
- maintain a full durable cognitive memory kernel beyond orchestration history
- expose a live public memory read/write surface
- act as a broad autonomous platform outside its current governed boundary

So the system is not yet self-building in the strong sense.
It is self-inspecting and self-shaping inside a narrow controlled lane.

## The current durable state spine

The active durable tables described in the current docs are:

- `witness_events`
- `plan_artifacts`
- `orchestration_jobs`
- `orchestration_events`

These give Founderos a real memory of:

- what was requested
- what was planned
- what happened
- who acted
- what durable execution was witnessed

That is not yet a full cognitive memory system, but it is a real state spine.

## The boundary that matters most

Founderos is designed around one core truth:

**it may improve itself only through bounded, witnessable, governed execution**

That boundary currently means:

- APS is the authority layer
- secrets remain server-side
- protected control-plane paths stay blocked
- exact write sets are required for durable writes
- witness logging must happen before GitHub writes
- autonomous changes should end in reviewable PRs
- the system must not falsely claim that a write or PR happened when it did not

This is one of the strongest things about the system right now.
It is not trying to become powerful by becoming vague.
It is trying to become trustworthy by becoming governable.

## The real state of the union

The real state of the union is:

Founderos has crossed the line from concept to system seed.

It now has:

- a real public control plane
- a real private worker lane
- a real durable orchestration layer
- a real write boundary
- a real self-improvement direction

But it is still in the first serious phase of becoming.

The architecture is ahead of the implementation depth.
The boundary model is stronger than the autonomous execution layer.
The memory design is clearer than the live memory surface.
The operating model is coherent, but still incomplete.

That is not failure.
That is a strong first state.

## What comes next

The next major safe milestone is:

```text
inspect
-> choose one real bounded improvement
-> generate exact candidate write set
-> open governed PR
-> record the whole thing durably
```

That is the bridge from self-inspection to real bounded self-improvement.

The most important near-term work is likely:

- tightening worker recommendation quality
- improving regression coverage around worker behavior
- increasing exact write-set readiness
- keeping docs and live implementation in sync
- gradually building the durable memory kernel without weakening the boundary

## Closing statement

Founderos is now in its first real constitutional phase.

It has a body.
It has a boundary.
It has a memory spine.
It has a worker.
It has a path toward self-improvement.

What it does not yet have is full autonomous implementation depth.

So the first state of the union is this:

**Founderos is alive, bounded, and pointed in the right direction.**
**It is not finished.**
**It is now real enough to improve itself carefully.**
