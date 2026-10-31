import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { canonicalName, canonicalNames, loadTaxonomy, stacksInText } from '../taxonomy.mjs'
import { taxonomy } from './taxonomy.fixture.mjs'

const FORMS = ['job-pt-br.yml', 'job-en-us.yml']

function dropdownOptions(form, id) {
  const lines = readFileSync(new URL(`../../ISSUE_TEMPLATE/${form}`, import.meta.url), 'utf8').split('\n')
  const start = lines.findIndex((line) => line.trim() === `id: ${id}`)
  const options = []
  let isInOptions = false
  for (const line of lines.slice(start + 1)) {
    if (/^\s+- type:/.test(line)) break
    if (line.trim() === 'options:') isInOptions = true
    else if (isInOptions && /^\s+- /.test(line))
      options.push(
        line
          .trim()
          .slice(2)
          .replace(/^"(.*)"$/, '$1'),
      )
    else if (isInOptions && !/^\s+- /.test(line)) isInOptions = false
  }
  return options
}

test('maps aliases of every facet to the label name', () => {
  assert.equal(canonicalName(taxonomy, 'levels', 'Staff/Principal'), 'Especialista')
  assert.equal(canonicalName(taxonomy, 'workModels', 'hybrid'), 'Híbrido')
  assert.equal(canonicalName(taxonomy, 'contracts', 'Estágio'), null)
  assert.deepEqual(canonicalNames(taxonomy, 'contracts', 'CLT, Contractor, CLT'), ['CLT', 'Contrato'])
})

test('finds stacks as whole terms only', () => {
  assert.deepEqual(stacksInText(taxonomy, 'Java, Kafka e Postgres'), ['Apache Kafka', 'Java', 'PostgreSQL'])
  assert.deepEqual(stacksInText(taxonomy, 'JavaScript e MySQL'), ['JavaScript', 'MySQL'])
  assert.deepEqual(stacksInText(taxonomy, 'C# com .NET'), ['.NET', 'C#'])
  assert.deepEqual(stacksInText(taxonomy, 'Node.js'), ['Node.js'])
})

test('case sensitive stacks ignore the common word', () => {
  assert.deepEqual(stacksInText(taxonomy, "Let's go live with Golang"), ['Go'])
  assert.deepEqual(stacksInText(taxonomy, "let's go"), [])
})

test('the stacks of the forms are the shared taxonomy stacks', { skip: !process.env.TAXONOMY_FILE }, () => {
  const names = loadTaxonomy().stacks.map((stack) => stack.name)
  for (const form of FORMS) assert.deepEqual(dropdownOptions(form, 'stack'), names, form)
})
