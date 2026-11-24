# Blast radius of the five standup commits on `main`, and the rehearsed revert

Written 2026-11-24. Every number below was read from `origin`, not from a working copy.
Nothing was pushed to `main` while writing this, and the revert is rehearsed but not
applied.

| Item | Value |
| --- | --- |
| base before | `0b59f724a8830a05f385f9cd8c1789ac0a2417d9` |
| `origin/main` now | `573557f5cd7200da70bd472df9208e7282f40b71` |
| move | fast-forward, 5 commits, no merge commit |
| commits | `1b5068d`, `f0692f6`, `756a9f2`, `b8f5c4a`, `573557f` |
| tree delta | 5 files added, 0 modified, 0 deleted, +763 / -0 |
| outside `docs/standup` | byte-identical to base |

## What actually changed

`git diff --name-status 0b59f72 573557f` returns five `A` rows and nothing else:

    A  docs/standup/2026-11-22-census.md
    A  docs/standup/2026-11-22-completion-gate-readings.md
    A  docs/standup/2026-11-22-deploy-blocked-prep.md
    A  docs/standup/2026-11-22-lane-state.md
    A  docs/standup/2026-11-22-pr66-landing-pack.md

`git diff --summary` shows five `create mode 100644` lines: no mode change, no rename, no
symlink, no executable bit, no deletion. `git ls-tree -r` at both commits, with
`docs/standup/` filtered out, diffs empty - so every other path in the repository is the
same blob in the same mode at the same path. That is the whole claim behind "nothing
outside `docs/standup` changed", and it is checkable in one command:

    diff <(git ls-tree -r 0b59f72 | grep -v 'docs/standup/') \
         <(git ls-tree -r 573557f | grep -v 'docs/standup/')

Four of the five files are byte-identical to the lane branch's copies. The fifth,
`2026-11-22-lane-state.md`, differs in one respect: `main`'s copy is the version from
`573557f`, so it does not carry the incident section this lane added afterwards in
`e55dfe6`.

## What could have broken, and did not

- **Build, unit tests, types, lint.** Not reachable: no file outside `docs/standup`
  differs, so every input to those checks is the same blob as at the base commit.
- **Completion gate.** Its only repo-wide walk is the mojibake/BOM scan, which does not
  exempt `docs/`; the five files add five files to that scan and pass it (`0 findings in
  5 scanned files`, run on the tree extracted from `573557f`, not the working copy). The
  emoji scan exempts `docs/`. The gate's doc-specific reads are named paths
  (`docs/original-request.txt`, `docs/governance.md`, `docs/privacy.md`, the roadmap) and
  none of them changed.
- **Repo tooling.** `grep -rn "docs/standup"` over `*.mjs`, `*.ts`, `*.json`, `*.yml`,
  `*.yaml` returns nothing: no generator, gate clause, test or workflow reads this
  directory.
- **Secrets.** A pattern scan of the five files at `573557f` for provider keys, private
  keys, bearer tokens, `api_key =`-style assignments and password assignments returns no
  matches. The failure here was branch discipline, not a credential leak.
- **Pull requests.** #32's base is `main`, whose recorded base sha is `3aa7e10d`; the
  advance adds only new files under `docs/standup/`, and #32 touches only
  `docs/full-muse-layer-plan.md`, so there is no path overlap to conflict on. #32 was not
  modified (`updated_at` is still 2026-10-26T03:56:44Z) and its mergeability is not yet
  computed by GitHub (`mergeable: null`). #66 is unaffected: its base is
  `contest/house-port`, not `main`, and it still reads `mergeable: true`,
  `mergeStateStatus: unstable`, head `30a29317`.

## The one reading still open

A push to `main` runs the whole `ci` workflow, because `.circleci/config.yml` has no
branch filter, and `completion-gate` on `main` sets `GATE_EXPECT_DEPLOYED=1` - it requires
production to already serve the build, which this push did not deploy.

Read from the API:

| rail | at base `0b59f72` | at `573557f` |
| --- | --- | --- |
| Actions `verify` | failure, 1 s | failure, 1 s |
| Actions `live-contracts` | failure, 1 s | failure, 2 s |
| Actions `completion-gate` | failure, 2 s | failure, 2 s |
| CircleCI `verify` | success | success |
| CircleCI `live-contracts` | success | success |
| CircleCI `completion-gate` | **failure** | **failure** |

So the Actions failures are not new: the same three check runs fail in one to two seconds
at the base commit, which is the known "runner never starts" signature, not a test result.
On the rail that actually runs, `verify` and `live-contracts` are green at both commits and
the gate is red at both. Nothing green at `0b59f72` is red at `573557f`. The gate finished
red at `573557f` after the push, and its failing clause cannot be read from this workspace:
the CircleCI v2 job endpoint answers `502`/`404` without credentials and there is no
`circleci` CLI here, so the failure text has to come from the dashboard.

What can be said without the log is why the five files cannot be the cause. The gate's
inputs are the whole tree; outside `docs/standup` the tree is byte-identical to the base,
so every clause reading source, tests, config or named docs sees exactly what it saw at
`0b59f72`, where the job also failed. The five new files are read by one clause only, the
directory-wide mojibake/BOM scan, and they pass it. A red at `573557f` is therefore
inherited from the base, not introduced by the push - consistent with the `main`-only
`GATE_EXPECT_DEPLOYED=1` rule, though that remains inference until the dashboard is read.

## The revert, rehearsed

Nothing in the repository depends on these files, so the inverse is a straight revert of
the range, which produces one commit and restores the base tree exactly.

Rehearsed locally at `573557f`, in a detached checkout, and not pushed:

    git revert --no-commit 0b59f72..573557f
    # commit: 0f1e13b (rehearsal only, dangling after the checkout was left)
    # resulting tree: 2a4eb9a060be27478e52e841748b0ed878f62a76
    # base tree:      2a4eb9a060be27478e52e841748b0ed878f62a76  -> identical
    # git diff 0b59f72 HEAD  -> 0 lines

The exact act, for the owner to authorise and run:

    git fetch origin
    git switch main                             # in a clone where main already exists
    git revert --no-commit 0b59f72..573557f
    git commit -m "Revert the five standup commits pushed to main by mistake"
    git push origin main

Post-conditions to check, in order:

1. `git rev-parse HEAD^{tree}` is `2a4eb9a060be27478e52e841748b0ed878f62a76`.
2. `git diff 0b59f72 HEAD` is empty.
3. `git rev-list --count 0b59f72..HEAD` is 6 (five commits plus the revert).

The alternative - `git reset --hard 0b59f72` and a force-push of `main` - restores the
history without a revert commit but rewrites the ref every clone and every open PR base
points at. It is recorded here so the choice is explicit; the revert commit is the
recommended act because it is non-destructive and leaves the mistake visible in the
history, which is what the record is for.

## What this lane did not do

It did not push to `main`, did not revert, did not force anything, did not touch #66 or
#32, and did not comment on any issue. The five files remain on `main` until the owner
authorises one of the two acts above.
