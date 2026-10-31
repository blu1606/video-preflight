import assert from 'node:assert/strict'
import { test } from 'node:test'

import { DEFAULT_OPTIONS, optionsFromSearch, optionsToSearch, paidSelected } from './analysis-options.js'

test('defaults produce an empty query and parse back to defaults', () => {
  assert.deepEqual(optionsToSearch(DEFAULT_OPTIONS), {})
  assert.deepEqual(optionsFromSearch(new URLSearchParams()), DEFAULT_OPTIONS)
  assert.deepEqual(paidSelected(DEFAULT_OPTIONS).map((p) => p.key), ['policy_llm', 'insights'])
  assert.equal(DEFAULT_OPTIONS.music, true)
  // a link can turn the default-on summary off, and that survives the round-trip
  const off = { ...DEFAULT_OPTIONS, insights: false }
  assert.deepEqual(optionsToSearch(off), { insights: '0' })
  assert.deepEqual(optionsFromSearch(new URLSearchParams(optionsToSearch(off))), off)
})

test('non-default options round-trip; invalid values fall back', () => {
  const opts = { ...DEFAULT_OPTIONS, rubric: 'v1', localize: true, extract: 'force' }
  const q = new URLSearchParams(optionsToSearch(opts))
  assert.deepEqual(optionsFromSearch(q), opts)
  assert.deepEqual(paidSelected(opts).map((p) => p.key), ['extract', 'localize', 'policy_llm', 'insights'])
  assert.deepEqual(optionsToSearch({ ...DEFAULT_OPTIONS, music: false }), { music: '0' })
  assert.equal(optionsFromSearch(new URLSearchParams('extract=x')).extract, DEFAULT_OPTIONS.extract)
  assert.equal('mode' in optionsFromSearch(new URLSearchParams('mode=evidence')), false)
})
