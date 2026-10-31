import { readFileSync } from 'node:fs'

export const FACETS = ['levels', 'contracts', 'workModels', 'stacks']

const BEFORE_TERM = '(?<![\\p{L}\\p{N}_])'
const AFTER_TERM = '(?![\\p{L}\\p{N}_])'

export function loadTaxonomy(file = process.env.TAXONOMY_FILE) {
  if (!file) throw new Error('TAXONOMY_FILE is not set.')
  return JSON.parse(readFileSync(file))
}

function termsOf(entry) {
  return [entry.name, ...entry.aliases]
}

function escaped(term) {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function canonicalName(taxonomy, facet, value) {
  const key = (value ?? '').trim().toLowerCase()
  if (!key) return null
  return taxonomy[facet].find((entry) => termsOf(entry).some((term) => term.toLowerCase() === key))?.name ?? null
}

export function canonicalNames(taxonomy, facet, text) {
  const names = (text ?? '').split(',').map((value) => canonicalName(taxonomy, facet, value))
  return [...new Set(names.filter(Boolean))]
}

export function stacksInText(taxonomy, text) {
  const plainText = text ?? ''
  return taxonomy.stacks
    .filter((entry) =>
      termsOf(entry).some((term) =>
        new RegExp(`${BEFORE_TERM}${escaped(term)}${AFTER_TERM}`, entry.caseSensitive ? 'u' : 'iu').test(plainText),
      ),
    )
    .map((entry) => entry.name)
}

export function taxonomyLabelNames(taxonomy) {
  return new Set(FACETS.flatMap((facet) => taxonomy[facet].map((entry) => entry.name)))
}
