# Champion Audit #73: geocoder source selection and result ordering (`geocode.ts`)

Part of the Champion Audit program; master tracker #67. Measured offline against recorded
responses, then decided.

## What is under audit

The shipped routing rule: a query matching `/^\d{5}$/` goes only to Census TIGERweb
(`resolveZcta`, `precise: true`); anything else goes to Photon (`limit=8`, `lang=en`) filtered to
`countrycode === 'us'` when a code is present, then re-sorted postcode-features-first. A
ZIP-shaped query with no US record returns `notUsZip: true` instead of falling through.

Champion: TIGERweb-first / Photon-fallback / postcode-first. Comparator: identical routing with
Photon's own order left alone.

The issue's acceptance: a challenger qualifies only if corpus accuracy is at least the champion's,
precision@1 is at least 95%, and ZIP-path Photon calls are exactly 0.

## The harness

`tests/geocode-audit.test.ts`, plus the generator and recorder in `tools/geocode-audit.mjs`.

**One product change, behaviour-preserving, so the comparator is not a copy.** The mapping from
Photon's response to `ResolvedPlace` moved out of `resolveFreeText` into an exported
`mapPhotonFeatures(data, text)`; `resolveFreeText` now calls it and then sorts. The comparator in
the audit is that function's output unsorted, and a test asserts that the champion's output equals
the mapping re-sorted **on every free-text query in the corpus**. Reimplementing the mapping inside
the test would have measured the test.

## The corpus: 513 strings, generated from committed data

`node tools/geocode-audit.mjs --build` writes `tests/fixtures/geocode-corpus.json` from the
committed county and place indexes only - no network, no hand-written list of places:

| Kind | Count | What it is |
| --- | --- | --- |
| zip | 198 | real ZCTAs, stratified across the country |
| zip-territory | 21 | ZCTAs in PR, VI, GU, AS, MP, HI, AK |
| foreign-five-digit | 6 | real non-US five-digit postcodes (Berlin, Rome, Hamburg, Munich) |
| city | 240 | city names drawn from the place index |
| ambiguous | 36 | names occurring in 4+ states (Springfield, Houston, Columbus ...) |
| territory | 12 | place strings such as `San Juan, PR`, `Hagatna, GU`, `Pago Pago, AS` |

`node tools/geocode-audit.mjs --record` fetches each entry from the endpoints the product uses
and writes `tests/fixtures/geocode-responses.json` (774 KB, reduced to the fields the shipped
code reads). It is paced at 1.1 s with jitter - about 40 requests/minute - resumable, and it aborts
after three consecutive refusals. It recorded 513 of 513 with **zero non-200 responses and zero
backoffs**, in two sessions after a runner restart, because resumption is a property of the tool.

## Two defects found in the corpus builder before any number was believed

Both were caught by the numbers looking wrong, which is the only reason they are in this record.

1. **Off-by-one ZIP decoding.** The builder started its delta walk at 0; the shipped
   `parseCountyIndex` starts at -1, so the first ZCTA is `00601`, not `00602`. Every ZIP in the
   corpus was one greater than the real one. The measurement showed the ZIP path at 132/198 and
   looked like a Census coverage gap; the failing codes were re-queried live by both `ZCTA5` and
   `GEOID` and returned nothing, because they were not ZIP codes at all. Corrected, the ZIP path
   is 219/219.
2. **`CDP` left on the query string.** Five city entries asked for `Bethesda CDP`, `Metairie CDP`
   and similar - Census statistical-area markers the app never displays and no reader types. The
   builder now strips them, as the app's own name shortening does. That moved aggregate
   precision@1 from 93.9% to 96.2%.

A third guard, kept: every "foreign" candidate is checked against the committed index, and the
build prints the ones it drops. The first draft of that list was written from memory and four of
its twelve entries - `75001`, `10115`, `28001`, `10119` - are real US ZCTAs (Dallas, Manhattan,
North Carolina). With the shifted decoder they had looked absent.

## The measurement

`npx vitest run tests/geocode-audit.test.ts`, on 477 scoreable entries of 513 recorded
(36 ambiguous names are reported but not scored, because precision@1 is not well defined for a
name that legitimately resolves to several places):

| Kind | precision@1 |
| --- | --- |
| zip | 198/198 |
| zip-territory | 21/21 |
| city | 223/240 (92.9%) |
| territory | 11/12 |
| foreign five-digit | 6/6 correctly refused |
| **all scoreable** | **96.2%** |

- **ZIP-path Photon calls: 0.** The routing rule holds: no five-digit query reaches the gazetteer.
- **Foreign postcodes: 0 false positives.** Berlin, Rome, Hamburg and Munich codes are reported as
  `notUsZip` rather than resolved to an American place.
- **Comparator: 96.2%, identical to the champion.** It qualifies on the issue's gate and ships
  nothing, because a tie is not an improvement: it would remove the postcode-first ordering - a
  postcode is a better answer than a city centroid - in exchange for no measured gain.

**Decision: no change.** The champion stays. The 95% bar is cleared only because the ZIP path is
exact; free text alone is 92.9%.

## Findings recorded, not fixed

The city misses are two kinds, and only one is the champion's:

- **Gazetteer top-1 noise, a real defect:** `St. Clair Shores` returns *St. Clair Shores Dentist*
  first; `Macon-Bibb County` returns *Bibb County Courthouse*; `Athens-Clarke County` returns a
  facilities department; `Urban Honolulu` returns *Urban Garden Center*. These are named-entity
  collisions, not cities. A reader typing a city and getting a dentist's office is a visible
  failure, and some of these bonded city-county names are exactly the ones the plan cares about.
- **Spelling and duplicate-name variance, not a defect:** `Port St. Lucie` returns *Port Saint
  Lucie* (correct place, different spelling); `Suffolk` returns Suffolk, New York, which is a real
  ambiguity the corpus classified as unique because the place index carries it in one state only.

Neither is what the issue measures, so neither is shipped inside a no-change audit. The first is
worth its own item if the program continues.

## State

- Corpus: 513 entries, deterministic from committed data, committed.
- Responses: 513 recorded, frozen, committed; re-scoring needs no network.
- Tests: 5 pass (3 offline mechanism tests always run; 2 corpus tests, which skip rather than pass
  when the recording is absent).
- Product: `geocode.ts` changed only by extracting `mapPhotonFeatures`; routing, filter, sort,
  constants and behaviour untouched.
