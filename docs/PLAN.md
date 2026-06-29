# REMAINING IMPLEMENTATION PLAN + MANDATORY EXECUTION RULES

## CURRENT PROJECT STATUS

The backend foundation has been implemented:

* Process Engine
* Thread Manager
* Queue Manager
* Scheduler Engine
* Database Layer
* Preload Bridge
* IPC Layer
* Integration Nodes
* Redux Slice
* Node Catalog
* FlowCanvas
* PropertyPanel

The implementation is NOT complete.

The following work MUST be completed before the feature can be considered finished.

---

# PHASE 1 — COMPLETE REDUX INTEGRATION (CRITICAL)

## Redux Provider

Complete Provider wiring.

Current status:

* Provider import exists.
* Store import exists.

Required work:

* Wrap the entire React application with `<Provider store={store}>`.
* Verify every RPA page has access to Redux.
* Remove any duplicate store instances.

---

# PHASE 2 — CREATE ALL RPA PAGES

Create:

packages/renderer/src/pages/rpa/index.tsx

Functions

* Workflow List
* Search
* Delete
* Duplicate
* Export
* Import
* Open Builder
* Execute Workflow

Connect to

* RpaBridge.list()
* RpaBridge.create()
* RpaBridge.update()
* RpaBridge.delete()
* RpaBridge.duplicate()
* RpaBridge.export()
* RpaBridge.import()

---

Create

packages/renderer/src/pages/rpa/builder.tsx

Integrate

* FlowCanvas
* PropertyPanel
* NODE_CATALOG
* Redux
* Workflow Save
* Workflow Load
* Workflow Run

Connect

* RpaBridge.create()
* RpaBridge.update()
* RpaBridge.run()
* onRunEvent()

Implement

* Drag Drop
* Node Selection
* Node Editing
* Variable Editing
* Workflow Settings
* Save Status

---

Create

packages/renderer/src/pages/rpa/logs.tsx

Integrate

* Task Log
* Search
* Filter
* Clear
* Re-execute

Connect

* RpaBridge.logs()
* RpaBridge.clearLogs()

---

Create

packages/renderer/src/pages/rpa/scheduler.tsx

Implement

* Scheduler List
* Create
* Edit
* Delete
* Enable
* Disable

Connect all scheduler IPC methods.

---

# PHASE 3 — ROUTER INTEGRATION

Update

packages/renderer/src/routes/index.tsx

Register

Visible

/rpa

Invisible

/rpa/builder

/rpa/logs

/rpa/scheduler

Follow existing routing architecture.

Do not create another router.

---

# PHASE 4 — MENU INTEGRATION

Integrate RPA into existing application navigation.

Reuse existing sidebar.

Reuse existing icons.

Reuse existing permission checks.

Reuse existing layout.

---

# PHASE 5 — SETTINGS INTEGRATION

Integrate RPA settings into existing Settings.

Do NOT create another Settings page.

Include

* Thread Count
* Timeout
* Retry
* Default Browser
* Logging
* Scheduler

---

# PHASE 6 — PROFILE INTEGRATION

Reuse existing profile system.

Workflow

Profiles

↓

Select Profiles

↓

Run RPA

↓

Select Workflow

↓

Common

or

Scheduled

↓

Execute

Never duplicate profile management.

---

# PHASE 7 — BROWSER MANAGER INTEGRATION

Reuse existing Browser Manager.

Reuse

* Browser lifecycle
* Profile launcher
* Cookies
* Proxy
* Fingerprint
* Sessions

Do not create another browser manager.

---

# PHASE 8 — PERMISSION INTEGRATION

Extend existing permission system.

Add

View RPA

Create Workflow

Edit Workflow

Delete Workflow

Run Workflow

Manage Scheduler

View Logs

---

# PHASE 9 — TASK LOG INTEGRATION

Connect UI with backend.

Display

Waiting

Queued

Pending

Running

Completed

Cancelled

Retrying

Error

Insufficient Points

Support

Search

Sort

Filter

Re-execute

---

# PHASE 10 — VERIFY IPC

Verify every preload API is connected.

Verify every IPC handler is used.

Remove unused IPC channels.

No orphan handlers.

---

# PHASE 11 — VERIFY REDUX

Verify

All actions dispatch correctly.

Selectors update correctly.

No duplicated state.

No unused slice.

No orphan reducers.

---

# PHASE 12 — VERIFY NODE CATALOG

Verify

Every node

* has specification
* has renderer
* has property editor
* has runtime executor

No unreachable node.

---

# PHASE 13 — CLEANUP

Remove

Unused imports

Unused variables

Dead code

Duplicate code

Duplicate constants

Duplicate services

Duplicate managers

Duplicate IPC

Duplicate utilities

---

# PHASE 14 — FINAL TYPECHECK

Run

npm run typecheck

or

pnpm typecheck

Use the project's existing script.

If errors exist

Fix

↓

Run again

↓

Repeat

Until

Zero TypeScript errors.

Do NOT stop while typecheck reports errors.

---

# MANDATORY EXECUTION RULES

## Continuous Execution

Do NOT ask the user any questions.

Do NOT wait for confirmation.

Continue implementing automatically until every requested feature has been completed.

---

## Existing Project Integration

This is an existing production codebase.

Never create a parallel implementation.

Always integrate into the existing architecture.

Reuse existing modules whenever possible.

---

## Repository Analysis

Before writing code

Search the repository.

Identify reusable modules.

Understand architecture.

Locate integration points.

Only then implement.

---

## Reuse First

Before creating

* Component
* Service
* Hook
* Store
* Utility
* Manager
* IPC
* API

Search the project first.

Reuse existing implementations whenever possible.

---

## Integration Rule

Every feature must include

UI

↓

Redux

↓

IPC

↓

Backend

↓

Database

↓

Settings

↓

Permissions

↓

Logging

↓

Navigation

↓

Profile System

↓

Browser Manager

↓

Scheduler

No feature may remain partially connected.

---

## No Duplicate Rule

Never create

Second Browser Manager

Second Scheduler

Second Database Layer

Second Router

Second Store

Second Logger

Second Profile Manager

Second Settings System

Second Permission System

---

# COMPLETION GATE (MANDATORY)

Implementation is NOT complete if any of the following exists:

* Remaining Work
* Next Step
* TODO
* FIXME
* Placeholder
* Stub
* Mock implementation
* Partial integration
* Manual integration step
* Unregistered route
* Missing Redux Provider
* Missing page registration
* Missing menu integration
* Missing settings integration
* Missing permissions integration
* Missing preload connection
* Missing IPC connection

Continue implementation until none of the above remain.

---

# SELF REPAIR RULE

If any issue is discovered during implementation:

* Automatically fix it.
* Continue implementation.
* Re-run verification.
* Repeat until resolved.

Never stop after merely reporting the issue.

The default behavior is self-repair, not early termination.

---

# SELF VERIFICATION (MANDATORY)

Before finishing, verify:

✓ All imports resolve.

✓ All files exist.

✓ All pages are registered.

✓ All routes are reachable.

✓ Redux Provider is mounted.

✓ Redux store works.

✓ All preload APIs are connected.

✓ All IPC handlers are connected.

✓ Browser Manager integration is complete.

✓ Scheduler integration is complete.

✓ Settings integration is complete.

✓ Profile integration is complete.

✓ Permission integration is complete.

✓ Task Log integration is complete.

✓ No duplicate implementation exists.

✓ No unused imports remain.

✓ No dead code remains.

✓ TypeScript typecheck passes.

---

# TYPECHECK POLICY

Run the project's TypeScript typecheck.

If any error exists:

Fix the error.

Run typecheck again.

Repeat until zero errors remain.

Do NOT finish while typecheck fails.

---

# BUILD POLICY

Do NOT run production build.

Do NOT package Electron.

Do NOT create installers.

TypeScript typecheck is sufficient validation for this implementation.

---

# FINAL SUCCESS CRITERIA

The task is complete only when:

* Every requested feature is implemented.
* Every feature is reachable from the UI.
* Every integration point is connected.
* No remaining work exists.
* No TODO/FIXME/Placeholder exists.
* TypeScript typecheck completes with zero errors.
* The Browser RPA behaves as a native part of the existing application rather than a standalone module.
