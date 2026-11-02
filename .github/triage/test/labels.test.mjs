import assert from 'node:assert/strict'
import { test } from 'node:test'
import { labelChanges } from '../labels.mjs'
import { taxonomy } from './taxonomy.fixture.mjs'

test('triage replaces the taxonomy labels of a form and keeps the others', () => {
  // Given an issue with taxonomy labels and a form with other values
  const issue = {
    title: 'Backend',
    body: '',
    labels: ['em-triagem', 'Sênior', 'Python', 'Stale', 'Remoto'].map((name) => ({ name })),
  }
  const form = { language: 'pt', fields: { level: 'Pleno', contract: 'PJ', workModel: 'Remoto', stack: 'Go' } }

  // When the label changes are computed
  const changes = labelChanges({
    issue,
    form,
    taxonomy,
    statusLabels: ['verificada', 'em-triagem', 'triagem-recusada'],
    verdictLabel: 'verificada',
    isRejected: false,
  })

  // Then the old taxonomy labels go and the new ones come in
  assert.deepEqual(changes.remove, ['em-triagem', 'Sênior', 'Python'])
  assert.deepEqual(changes.add, ['verificada', 'Pleno', 'PJ', 'Go'])
})

test('triage of a post without form only manages the stacks', () => {
  // Given an issue without a form that mentions Java and Postgres
  const issue = {
    title: 'Vaga Java',
    body: 'Experiência com Postgres.',
    labels: ['Sênior', 'Python'].map((name) => ({ name })),
  }
  const form = { language: null, fields: {} }

  // When the label changes are computed
  const changes = labelChanges({
    issue,
    form,
    taxonomy,
    statusLabels: ['verificada'],
    verdictLabel: 'verificada',
    isRejected: false,
  })

  // Then only the stack labels change
  assert.deepEqual(changes.remove, ['Python'])
  assert.deepEqual(changes.add, ['verificada', 'Java', 'PostgreSQL'])
})
