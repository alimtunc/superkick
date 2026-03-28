# Dashboard Home Structure

## Purpose

Define the exact information architecture of the Superkick home dashboard
before visual styling work starts.

This page should feel like a control center:

- what is running now
- what needs attention now
- what finished successfully
- how healthy the system is overall

## Core Product Goal

The home page should answer these questions in under 10 seconds:

1. Is Superkick working right now?
2. What needs my attention?
3. How many issues have finished?
4. Is throughput and reliability improving or degrading?

## Home Page Structure

The page should be organized in this order:

1. Top bar
2. Session rail
3. Executive summary band
4. KPI ribbon
5. Attention zone
6. Active runs board
7. Completed issues section
8. Reliability and performance section
9. Recent activity section

## Section Breakdown

### 1. Top Bar

Purpose: orientation and quick actions.

Content:

- product label: `Superkick`
- page title: `Control Center`
- last refresh timestamp
- primary actions:
  - `Refresh`
  - `Open latest blocked run` if one exists
- future:
  - repo switcher
  - date range selector
  - settings entry

Rules:

- keep it light and stable
- do not overload with analytics here
- this is navigation and status, not the hero

### 2. Session Rail

Purpose: let the user keep several live sessions visible in the same window and
switch focus instantly.

This should be a persistent horizontal rail directly below the top bar.

Recommended content per session chip or card:

- issue identifier
- repo
- current state
- current step
- age
- one attention signal if blocked or failed

Primary behavior:

- click a session to focus it
- focused session becomes the main detail context
- other sessions remain visible in the rail
- allow pinning 3 to 5 sessions max

Why this matters:

- avoids tab chaos
- gives a real mission-control feel
- makes multi-run supervision possible without opening multiple windows

Important rule:

- the rail is not a second run list
- it should show watched sessions only
- the main page still owns the big overview sections

Future expansion:

- split view for 2 focused sessions
- compare mode
- mini live indicators
- unread event counts

### 3. Executive Summary Band

Purpose: the fastest possible read of system state.

This is a high-importance strip with 3 to 4 large cards:

- `Completed Issues`
  - count of completed runs in the selected period
- `Active Runs`
  - count of non-terminal runs
- `Needs Attention`
  - count of blocked, failed, or waiting-human runs
- `Success Rate`
  - ratio of completed terminal runs vs failed or cancelled

Each card should include:

- a large number
- a short label
- a small context line
- optional trend delta later

Immediate data source:

- derivable from current `/runs` response

### 4. KPI Ribbon

Purpose: denser operating metrics directly under the summary band.

Recommended first KPI set:

- median run duration
- oldest active run age
- runs waiting human
- failed runs
- reviewing runs
- PR-opening runs

Future KPI set:

- review gate pass rate
- interrupt rate
- retry pressure
- command failure rate

Rules:

- 6 metrics max in the first row
- use compact cards
- this band should scan left to right in one line on desktop

### 5. Attention Zone

Purpose: show urgent items before the user reads the backlog.

This should be the first operational section on the page.

Subsections:

- `Blocked Now`
  - runs in `waiting_human`
  - runs with recent failure
- `Aging Runs`
  - active runs with long duration
- `Review Gate Failed`
  - runs where review swarm found problems

Each row should show:

- issue identifier
- repo slug
- current step
- state badge
- age
- one-line problem summary

Interaction:

- clicking any item opens the run detail

Current data support:

- `waiting_human` and `failed` are available now
- `review gate failed` can be inferred only if review output is fetched per run
- aging runs are available now from timestamps

### 6. Active Runs Board

Purpose: display all non-terminal work in a more legible format than a flat list.

Recommended layout:

- 3 columns on desktop
- grouped by high-level state

Column groups:

- `In Progress`
  - `preparing`
  - `planning`
  - `coding`
  - `running_commands`
  - `reviewing`
  - `opening_pr`
- `Needs Human`
  - `waiting_human`
- `Queued`
  - `queued`

Each run card should show:

- issue identifier
- repo
- current step
- started time
- elapsed duration
- branch if available
- one health signal:
  - stable
  - delayed
  - blocked

Why board over table:

- better visual chunking
- easier to spot stuck work
- more product-like than raw rows

### 7. Completed Issues Section

Purpose: give visible proof that Superkick is shipping work.

This section should feel rewarding, not just archival.

Recommended content:

- latest completed issues in reverse chronological order
- each item shows:
  - issue identifier
  - repo
  - completed at
  - total duration
  - branch name
  - terminal outcome

Future additions:

- PR link
- generated PR title
- review swarm pass summary

Recommended layout:

- compact horizontal cards on desktop
- stacked cards on mobile

Important rule:

- this section must be above deep analytics
- finished work is part of the product story

### 8. Reliability And Performance Section

Purpose: show whether the system is healthy over time.

This section can start small and grow later.

First iteration:

- `Runs by state` distribution
- `Terminal outcomes` distribution
- `Average duration` by terminal outcome

Second iteration:

- failure hotspots by step
- interrupt frequency over time
- review gate pass rate over time
- provider comparison

Design rule:

- the first release does not need complex charts
- clear bars, segmented rows, or mini-trend cards are enough

### 9. Recent Activity Section

Purpose: provide recency and motion without turning the home page into a log console.

Recommended content:

- 10 to 20 latest run-level events
- state changes
- run completions
- interrupt creation and resolution

Do not:

- stream the full event firehose here
- duplicate the run detail log panel

This section should answer:

- what just happened recently?

## Recommended Wireframe

```text
+----------------------------------------------------------------------------------+
| Superkick | Control Center                                Last sync 09:41  Refresh |
+----------------------------------------------------------------------------------+
| Watched Sessions: SK-214 waiting_human | SK-220 coding | SK-230 queued           |
+----------------------------------------------------------------------------------+
| Completed Issues | Active Runs | Needs Attention | Success Rate                  |
| 28               | 6           | 2               | 82%                           |
+----------------------------------------------------------------------------------+
| Median Duration | Oldest Active | Waiting Human | Failed | Reviewing | Opening PR |
+----------------------------------------------------------------------------------+
| Needs Attention                                                                  |
| - SK-214 waiting_human in review, 18m old                                        |
| - SK-209 failed in commands, 11m old                                             |
+---------------------------------------------------+------------------------------+
| Active Runs Board                                  | Completed Issues             |
| In Progress | Needs Human | Queued                 | SK-201  12m  completed       |
| SK-220 ...  | SK-214 ...  | SK-230 ...             | SK-198   9m  completed       |
| SK-218 ...  |             |                         | SK-193  17m  completed       |
+----------------------------------------------------------------------------------+
| Reliability And Performance                                                      |
| State distribution | Terminal outcomes | Avg duration                            |
+----------------------------------------------------------------------------------+
| Recent Activity                                                                   |
| completed SK-201 | interrupt created SK-214 | run started SK-230                |
+----------------------------------------------------------------------------------+
```

## What We Can Build Now

Using only current frontend data from `/runs`, we can already support:

- completed issues count
- active runs count
- failed runs count
- waiting-human count
- runs by state
- oldest active run age
- median or average duration from run timestamps
- completed issues list
- active runs board

## What Needs More Backend Support

These should be designed now but may need later API work:

- review pass rate across all runs
- failure hotspots by step
- interrupt rate over time
- retry pressure
- provider performance
- PR success metrics
- issue throughput trend by day

## Layout Principles

- attention before chronology
- watched sessions before deep overview
- finished work before deep analytics
- analytics before raw logs
- one glance for status, one scroll for context
- raw technical detail should move to run detail, not dominate home

## Decision For The Next Iteration

If this structure is accepted, the next step should be:

1. choose the exact visual direction
2. define component styles for each section
3. implement the overview page in the UI
