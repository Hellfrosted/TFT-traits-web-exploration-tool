# Context

## Glossary

### Board Search Plan

A board search plan is the engine-owned description of one normalized board search after data, query constraints, pruning state, scoring, progress tracking, and result collection have been prepared.

It is an internal engine concept. The public caller-facing behaviour remains board search and board count through the existing engine entry points.

### Board Resolution

Board resolution is the engine-owned process that turns a selected set of units into one evaluated board by applying variant selection, conditional profiles, conditional effects, exact slot occupancy, trait counts, and final scoring inputs.

Depth belongs behind this concept because DFS should enumerate candidate unit selections, while board resolution owns the rules that decide what those selections mean.

### Unit Override Resolution

Unit override resolution is the data-engine process that turns base unit traits and roles plus set override payloads and trait-clone facts into the final parsed unit shape used by board search.

Set override files stay declarative. Unit override resolution owns merge precedence, added and removed traits, trait contribution overrides, slot cost, selection groups, variants, conditional effects, and conditional profiles.

### Raw Snapshot Acquisition

Raw snapshot acquisition is the data-engine process that obtains normalized Community Dragon source data before parsing. It decides whether to reuse a fresh fallback snapshot, fetch current remote data, write a new fallback snapshot, or fail because no fresh raw data is available.

Parsing consumes an acquired raw snapshot. Acquisition owns source URLs, freshness policy, network retry behaviour, fallback reads and writes, and provenance such as `fetchedAt` and whether cached data was used.

### Search Job Lifecycle

Search job lifecycle is the main-process ownership of one board search request from accepted normalized params through cache lookup, worker execution, progress forwarding, cancellation, result persistence, cleanup, and final response.

The search service decides whether a job may start and exposes stable search and cancellation operations. The job lifecycle owns mutable worker state and completion ordering.

### Renderer Board Search Session

A renderer board search session is the UI-side state machine for loading data, editing query constraints, requesting estimates, running board searches, tracking progress, cancelling work, managing recent searches, and selecting/sorting results.

The session owns bridge-driven workflow state. Rendering modules consume session state and send user intents back to the session.
