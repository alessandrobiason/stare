# Going public

What was prepared in the repository, and the two things that can only be done in
GitHub's settings.

## In the repository

- **`LICENSE`** — MIT. Chosen so the code can actually be reused; the README's
  "Licence and attribution" section records what the licence does *not* cover
  (the catalog, the photographs, the model), since none of those is vendored.
- **README "Licence and attribution"** — CelesTrak and the Space Force catalog,
  SkyWater-Seg, Wikimedia Commons, the libraries, and the expo-camera patch.
- **`testing/fixtures/README.md`** — says in full that `active.tle` is a
  snapshot dated 2026-08-23 rather than live data, where the elements come from,
  and how to refresh it.

## In GitHub's settings — still to do

Neither is reachable from a commit; both are two clicks.

### 1. Require approval for fork pull requests

**Settings → Actions → General → Fork pull request workflows from outside
collaborators.**

Once the repository is public, anyone can open a pull request from a fork. The
concern is a fork PR that edits a workflow to run something expensive or to
exfiltrate whatever the job can see. "Require approval for first-time
contributors" is GitHub's default for public repositories; **"Require approval
for all outside collaborators"** is the stricter setting and costs nothing on a
project with one committer.

Note what this does *not* currently protect. All three workflows here are
`workflow_dispatch` only — no `push`, `pull_request` or `schedule` trigger
exists — so today a fork PR cannot start a run at all, whatever the setting
says. The reason to set it anyway is the day someone adds a `pull_request`
trigger for CI: the protection should already be in place then, rather than
being remembered afterwards. If that day comes, note also that TestFlight and
OTA workflows read repository secrets, and that a `pull_request_target` trigger
would expose them to fork code — use `pull_request`, which does not.

### 2. Check the Actions billing change

Public repositories get free standard-runner minutes, which would remove the
constraint the workflows are currently designed around: `ios-build.yml` is
arranged in a Linux-first, dispatch-only, concurrency-cancelling shape
specifically to keep the 10x macOS multiplier from eating the 2,000-minute
private-repo allowance, and its header comment says so.

Confirm this against GitHub's current billing documentation before relaxing
anything — the policy is theirs to change, and the header comment in
`ios-build.yml` should be updated rather than left describing a budget that no
longer applies. The Linux prebuild gate is worth keeping regardless: it catches
a broken `app.json` in about a minute instead of failing forty minutes into a
macOS job.

## Deliberately not done

- **No secrets to purge.** The tree and the full history were checked for
  `.env`, `.p12`, `.p8`, `.pem`, `.mobileprovision` and key material: none has
  ever been committed, and `.secrets/` is gitignored. Every credential in the
  workflows is a `${{ secrets.* }}` reference. The identifiers that *are* in
  `app.json` — the EAS project id, the `u.expo.dev` updates URL, the bundle
  identifier — ship inside the IPA and are extractable from any install, so
  publishing them changes nothing; pushing an update still needs `EXPO_TOKEN`.
