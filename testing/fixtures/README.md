# Test fixtures

## `active.tle`

**A dated snapshot, not live data.** 16,063 TLEs (48,189 lines, three per
object) downloaded from CelesTrak's `GROUP=active` set on **2026-08-23**. The
epochs in it are day 235 of 2026 and they do not move.

It exists so the suite and `npm run mock-celestrak` have a full-size catalog to
work against without touching the network or CelesTrak's rate limit. It is for
testing only. Anything propagated from it drifts further from the truth the
longer ago that date was — SGP4 accuracy degrades over days, not months, so
positions computed from this file are wrong by kilometres and getting worse, and
objects launched or decayed since are respectively missing and still present.
The app fetches its own catalog at runtime (`src/satellite/`, cached for two
hours); nothing in the shipped product reads this file.

Regenerate it by downloading the same endpoint the app uses:

```bash
curl -o testing/fixtures/active.tle \
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle'
```

and update the count and date above, and in the README's "Offline catalog"
section, when you do.

### Where it comes from, and what you may do with it

The orbital elements originate with the United States Space Force's 18th/19th
Space Defense Squadron and are published through Space-Track and CelesTrak. As a
work of the US federal government the underlying data carries no copyright in
the United States, which is why a snapshot can sit in a public repository at
all.

CelesTrak is a service run by Dr T.S. Kelso rather than a public utility, and it
asks users to say where the data came from and not to hammer the endpoint. Both
apply to this repo: the attribution is here and in the top-level README, and the
app honours the two-hour cache interval CelesTrak's rate limit implies. If you
fork this and point it at the live endpoint, keep that cache — the mock server
exists precisely so that development does not need the real one.

The format is the standard NORAD two-line element set, preceded by a 24-column
name line. Do not add comment or header lines to the file: `mock-celestrak-server.mjs`
reads it as text and serves it verbatim over a `gp.php`-compatible endpoint, so
anything extra reaches the app's parser as though CelesTrak had sent it.
