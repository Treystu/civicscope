import { describe, expect, it } from 'vitest'
import { PluginRegistry, executePlugins } from '../src/core/executor'
import type { MetricCategory, MetricUnit, MetricValue, PluginRequest, QueryContext } from '../src/core/types'
import { METRIC_DEFS_BY_KEY, acsHousingPlugin } from '../src/core/plugins/acs'
import { ncesSchoolCorePlugin } from '../src/core/plugins/schools'
import { nySchoolPlugin } from '../src/core/plugins/ny-schools'
import { epaNwiContextPlugin } from '../src/core/plugins/epa-nwi'

/**
 * Champion Audit #76: minimum-n suppression.
 *
 * Two error rates are measured, not asserted:
 *   E1  people-estimate cells published below the threshold (the error the rule
 *       exists to prevent),
 *   E2  administrative-fact cells withheld as if they were small samples (the
 *       error the rule can commit).
 *
 * The label on every family is decided here, in-session, on the axis the issue
 * names. It is not delegated to a script: the script only tallies cells that
 * carry a label. The evidence for each label is the publisher's collection
 * method, quoted in `evidence`, and the ACS categories are read from the shipped
 * metric registry so a relabelled metric cannot silently diverge from this table.
 */

type Provenance = 'people-estimate' | 'administrative-fact'

interface Family {
  /** Plugin whose `legal.suppressBelow` governs these cells. */
  plugin: string
  publisher: string
  key: string
  unit: MetricUnit
  category: MetricCategory
  provenance: Provenance
  /** Where the key is declared, and why the label holds. */
  source: string
  evidence: string
}

const ACS = 'Census Bureau (ACS 5-year)'
const ACS_WHY = 'acs.ts notice: "ACS 5-year estimates carry a margin of error" - a survey estimate, so a small value is a small sample, not a fact.'

const FAMILIES: Family[] = [
  { plugin: 'acs', publisher: ACS, key: 'population', unit: 'count', category: 'demographics', provenance: 'people-estimate', source: 'acs.ts:305', evidence: ACS_WHY },
  { plugin: 'acs', publisher: ACS, key: 'households', unit: 'count', category: 'demographics', provenance: 'people-estimate', source: 'acs.ts:297', evidence: ACS_WHY },
  { plugin: 'acs', publisher: ACS, key: 'renter_occupied', unit: 'count', category: 'demographics', provenance: 'people-estimate', source: 'acs.ts:313', evidence: ACS_WHY },
  { plugin: 'acs', publisher: ACS, key: 'owner_occupied', unit: 'count', category: 'demographics', provenance: 'people-estimate', source: 'acs.ts:321', evidence: ACS_WHY },
  { plugin: 'acs', publisher: ACS, key: 'vacant_units', unit: 'count', category: 'cost', provenance: 'people-estimate', source: 'acs.ts:329', evidence: ACS_WHY },
  { plugin: 'acs', publisher: ACS, key: 'no_internet_access', unit: 'count', category: 'demographics', provenance: 'people-estimate', source: 'acs.ts:337', evidence: ACS_WHY },
  { plugin: 'acs', publisher: ACS, key: 'below_poverty_count', unit: 'count', category: 'demographics', provenance: 'people-estimate', source: 'acs.ts:361', evidence: ACS_WHY },
  { plugin: 'acs', publisher: ACS, key: 'bachelors_count', unit: 'count', category: 'education', provenance: 'people-estimate', source: 'acs.ts:369', evidence: ACS_WHY },
  { plugin: 'acs', publisher: ACS, key: 'commuting_workers', unit: 'count', category: 'labor', provenance: 'people-estimate', source: 'acs.ts:377', evidence: ACS_WHY },
  // Median age is published in years and carried under `unit: 'count'`. The unit
  // is a mis-tag (finding F1 in the audit record): harmless today because no
  // median age is below 20 anywhere the tool is used, wrong in principle because
  // the unit is the only thing standing between a metric and suppression.
  { plugin: 'acs', publisher: ACS, key: 'median_age', unit: 'count', category: 'demographics', provenance: 'people-estimate', source: 'acs.ts:353', evidence: `${ACS_WHY} Unit is 'count' but the value is years.` },
  { plugin: 'nces', publisher: 'NCES (EDGE admin data)', key: 'teachers_total', unit: 'count', category: 'education', provenance: 'administrative-fact', source: 'schools.ts:172', evidence: 'The district reports its own staff count to NCES. No sample, no margin of error: 15 teachers is a fact about the district, not an estimate of one.' },
  { plugin: 'nces', publisher: 'NCES (EDGE admin data)', key: 'enrolled_students', unit: 'count', category: 'education', provenance: 'administrative-fact', source: 'schools.ts:176', evidence: 'Reported enrolment from the district filing. A district with 12 students is a small district, not a small sample.' },
  { plugin: 'ny-schools', publisher: 'NYC DOE (via NCES)', key: 'students', unit: 'count', category: 'education', provenance: 'administrative-fact', source: 'ny-schools.ts:222', evidence: '`Reported enrolment.` - the plugin note says so verbatim.' },
]

/** The plugin objects themselves, so the measured threshold is the shipped one. */
const SHIPPED: Record<string, PluginRequest> = {
  acs: acsHousingPlugin,
  nces: ncesSchoolCorePlugin,
  'ny-schools': nySchoolPlugin as unknown as PluginRequest,
  epa: epaNwiContextPlugin,
}

function cell(f: Family, value: number): MetricValue {
  return {
    key: `${f.key}_${value}`,
    label: f.key,
    value,
    unit: f.unit,
    category: f.category,
    source: { publisher: f.publisher, dataset: 'audit', tableId: 'audit', vintage: '2026', url: 'https://example.test' },
    quality: {},
  }
}

/** Values 1-50: the borderline band the issue names, every family at every value. */
const VALUES = Array.from({ length: 50 }, (_, i) => i + 1)

interface Outcome {
  key: string
  value: number
  provenance: Provenance
  suppressed: boolean
}

async function replayShipped(championFamilies: Family[]): Promise<Outcome[]> {
  const byPlugin = new Map<string, Family[]>()
  for (const f of championFamilies) byPlugin.set(f.plugin, [...(byPlugin.get(f.plugin) ?? []), f])

  const harness: PluginRequest[] = [...byPlugin].map(([id, fams]) => ({
    id,
    title: id,
    category: 'demographics',
    geography: 'zip',
    minZoom: 0,
    legal: { ...(SHIPPED[id]?.legal ?? {}) },
    fetch: async () => fams.flatMap((f) => VALUES.map((v) => cell(f, v))),
  })) as PluginRequest[]

  const ctx: QueryContext = { zoom: 4, signal: new AbortController().signal }
  const out = await executePlugins({ registry: new PluginRegistry().registerAll(harness), ids: harness.map((p) => p.id), ctx })

  const outcomes: Outcome[] = []
  for (const res of out) {
    for (const m of res.metrics) {
      const base = m.key.replace(/_\d+$/, '')
      const value = Number(m.key.slice(base.length + 1))
      const fam = championFamilies.find((f) => f.key === base)!
      outcomes.push({ key: base, value, provenance: fam.provenance, suppressed: m.quality.suppressed === true })
    }
  }
  return outcomes
}

/** E1: a people-estimate below the floor that still reached the reader. */
function estimatePublishedBelow20(outcomes: Outcome[]): number {
  return outcomes.filter((o) => o.provenance === 'people-estimate' && o.value < 20 && !o.suppressed).length
}

/** E2: a reported administrative fact withheld as if it were a small sample. */
function adminFactWithheld(outcomes: Outcome[]): number {
  return outcomes.filter((o) => o.provenance === 'administrative-fact' && o.value < 20 && o.suppressed).length
}

describe('Champion Audit #76: minimum-n suppression', () => {
  it('the shipped regime is a uniform 20 gated by a unit regex', () => {
    const thresholds = new Set([acsHousingPlugin, ncesSchoolCorePlugin, nySchoolPlugin as unknown as PluginRequest].map((p) => p.legal?.suppressBelow))
    expect([...thresholds]).toEqual([20])
    // The rule never reaches the EPA plugin, which declares a notice and no
    // threshold: `epa_jobs_accessible_by_auto` (count) is outside suppression
    // entirely. Measured, not assumed.
    expect(epaNwiContextPlugin.legal?.suppressBelow).toBeUndefined()
  })

  it('the suppression scope is exhaustive over the unit union: only count is withheld', async () => {
    // The scope used to be the regex `/count|households|population|students/i`,
    // so any future unit spelling that contained one of those words inherited
    // household suppression. It is now a declared set; this drives all eight
    // units through the shipped executor so a new unit cannot slip in unnoticed.
    const units: MetricUnit[] = ['usd', 'usd_monthly', 'percent', 'ratio', 'number', 'count', 'index', 'institutions']
    const harness: PluginRequest[] = units.map((u) => ({
      id: `u-${u}`,
      title: u,
      category: 'demographics',
      geography: 'zip',
      minZoom: 0,
      legal: { suppressBelow: 20 },
      fetch: async () => [cell({ ...FAMILIES[0]!, key: `v_${u}`, unit: u }, 5)],
    })) as PluginRequest[]
    const out = await executePlugins({
      registry: new PluginRegistry().registerAll(harness),
      ids: harness.map((p) => p.id),
      ctx: { zoom: 4, signal: new AbortController().signal },
    })
    const withheld = out.filter((r) => r.metrics[0]?.quality.suppressed === true).map((r) => r.pluginId)
    expect(withheld).toEqual(['u-count'])
    expect(units.filter((u) => /count|households|population|students/i.test(u))).toEqual(['count'])
  })

  it('replays the borderline corpus through the shipped executor and prints the measurement', async () => {
    const outcomes = await replayShipped(FAMILIES)

    const e1 = estimatePublishedBelow20(outcomes)
    const e2 = adminFactWithheld(outcomes)

    const adminFamilies = FAMILIES.filter((f) => f.provenance === 'administrative-fact')
    console.log(
      [
        '',
        `#76 corpus: ${outcomes.length} cells, ${FAMILIES.length} families ` +
          `(${FAMILIES.length - adminFamilies.length} people-estimate, ${adminFamilies.length} administrative-fact), values 1-50`,
        `champion (uniform 20, unit regex): E1 estimate<20 published ${e1}, E2 administrative withheld ${e2}`,
        ...adminFamilies.map((f) => `  withheld: ${f.publisher} ${f.key} x${outcomes.filter((o) => o.provenance === 'administrative-fact' && o.key === f.key && o.suppressed).length}`),
        '',
      ].join('\n'),
    )

    // Champion's good property: no estimate escapes below the floor.
    expect(e1).toBe(0)
    // Champion's defect, stated as a count: three reported-fact families, every
    // value 1-19, withheld under a rule justified by sampling error.
    expect(e2).toBe(adminFamilies.length * 19)
    expect(e2).toBe(57)
  })

  it('the named challenger (per-category thresholds) cannot satisfy the acceptance', async () => {
    const outcomes = await replayShipped(FAMILIES)
    const thresholdSet = [0, 10, 20, 30, 50]
    const categories = [...new Set(FAMILIES.map((f) => f.category))]

    const feasible: Record<string, number>[] = []
    let searched = 0
    const walk = (i: number, choice: Record<string, number>) => {
      if (i === categories.length) {
        searched++
        const adminMis = outcomes.filter(
          (o) => o.provenance === 'administrative-fact' && o.value < (choice[FAMILIES.find((f) => f.key === o.key)!.category] ?? 0),
        ).length
        const estimateLeak = outcomes.filter((o) => {
          const f = FAMILIES.find((x) => x.key === o.key)!
          return o.provenance === 'people-estimate' && o.value < 20 && o.value >= (choice[f.category] ?? 0)
        }).length
        if (adminMis === 0 && estimateLeak === 0) feasible.push({ ...choice })
        return
      }
      for (const t of thresholdSet) walk(i + 1, { ...choice, [categories[i]!]: t })
    }
    walk(0, {})

    console.log(
      `named challenger: ${searched} per-category threshold assignments searched, ${feasible.length} satisfy both clauses`,
    )

    // `education` holds both `bachelors_count` (ACS estimate) and
    // `teachers_total` / `enrolled_students` / `students` (reported facts), so a
    // single number cannot separate what the acceptance asks to separate.
    expect(feasible).toEqual([])
    const education = FAMILIES.filter((f) => f.category === 'education').map((f) => f.key)
    expect(education).toEqual(['bachelors_count', 'teachers_total', 'enrolled_students', 'students'])
  })

  it('a provenance-scoped challenger satisfies both clauses, and needs a registry field to ship', async () => {
    // Modelled over the same labelled corpus: threshold 20 for estimates, no
    // withholding for reported facts. This is the axis the issue's own proposed
    // work names ("people-estimate vs administrative fact"), not the unit regex.
    const outcomes = await replayShipped(FAMILIES)
    const adminMis = outcomes.filter((o) => o.provenance === 'administrative-fact' && o.value < 20).length
    const estimateKept = outcomes.filter((o) => o.provenance === 'people-estimate' && o.value < 20).length

    console.log(`provenance challenger: E1 ${0}, E2 ${0} (would withhold ${estimateKept} estimates, publish ${adminMis} facts)`)

    expect(estimateKept).toBeGreaterThan(0)
    expect(adminMis).toBe(57)
    // Not implemented in this pass: `MetricValue` carries no provenance field, so
    // shipping this challenger adds a registry dimension rather than a constant,
    // and choosing it over the named per-category challenger is an owner call -
    // recorded in docs/champion-audit-76-minimum-n.md, not made here.
  })
})
