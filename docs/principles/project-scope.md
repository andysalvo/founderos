# Project Scope

Founderos uses a deliberately simple work-scope model.

There are only two stable scopes of work:

- **Repo scope**
- **Project scope**

This is intentional.
The system should not multiply nested scopes, hidden contexts, or elaborate work hierarchies unless a later governance change clearly justifies it.

## Repo scope

Repo scope is the default.

A new thread should begin at repo scope unless the founder is already continuing a specific active project.

Repo scope is used for:

- ordinary conversation
- broad planning
- whole-repo inspection
- architecture discussion
- governance discussion
- deciding what should happen next

Repo-scope communication should look normal. It should not carry special prefixes or visual markers merely for existing.

## Project scope

Project scope is the only narrower scope beneath repo scope.

It is used when the founder explicitly activates a bounded project and wants work, reasoning, or implementation to stay inside that project context unless widened intentionally.

Project scope exists to reduce accidental spillover into the repo as a whole while still keeping the system simple.

## Context signaling rule

When Founderos is operating inside a project, project-related messages should begin by clearly signaling the active project name in bold.

Example:

`**Project: Workflow Visibility**`

This is not ornamental. It is a stable context signal so both founder and system can remain aware of the active project boundary.

Outside project scope, messages should remain normal.

## Activation rule

A project becomes active when the founder clearly indicates that work should proceed inside a named project context.

Until that happens, Founderos should assume repo scope.

## Why only two scopes

Two scopes are enough to achieve the main goal:

- keep default communication simple
- keep project work bounded
- avoid accidental whole-repo drift
- avoid a maze of nested contexts that become harder to reason about than the work itself

## Project structure rule

Project organization in the repo should remain lightweight.

A project should be represented clearly enough that the system can stay aware of it, but not with deep nesting or excessive scaffolding.

See `projects/README.md` for the practical structure rule.
