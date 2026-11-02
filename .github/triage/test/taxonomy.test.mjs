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

test('maps a level alias to the label name', () => {
  // Given an alias of a level
  const alias = 'Staff/Principal'

  // When the name is looked up
  const name = canonicalName(taxonomy, 'levels', alias)

  // Then it is the label name
  assert.equal(name, 'Especialista')
})

test('maps a work model alias to the label name, whatever the case', () => {
  // Given an alias of a work model in lower case
  const alias = 'hybrid'

  // When the name is looked up
  const name = canonicalName(taxonomy, 'workModels', alias)

  // Then it is the label name
  assert.equal(name, 'Híbrido')
})

test('a name from another facet maps to nothing', () => {
  // Given a level used as a contract
  const alias = 'Estágio'

  // When the name is looked up
  const name = canonicalName(taxonomy, 'contracts', alias)

  // Then there is no match
  assert.equal(name, null)
})

test('maps a list of contracts to label names without repeating any', () => {
  // Given a list with an alias and a repeated name
  const text = 'CLT, Contractor, CLT'

  // When the names are looked up
  const names = canonicalNames(taxonomy, 'contracts', text)

  // Then each label comes once
  assert.deepEqual(names, ['CLT', 'Contrato'])
})

test('finds stacks by name and alias as whole terms', () => {
  // Given a text with a name and two aliases
  const text = 'Java, Kafka e Postgres'

  // When the stacks are found
  const stacks = stacksInText(taxonomy, text)

  // Then each one comes by its name
  assert.deepEqual(stacks, ['Apache Kafka', 'Java', 'PostgreSQL'])
})

test('a stack that contains another is not found inside it', () => {
  // Given a text with JavaScript and MySQL
  const text = 'JavaScript e MySQL'

  // When the stacks are found
  const stacks = stacksInText(taxonomy, text)

  // Then Java and SQL are not among them
  assert.deepEqual(stacks, ['JavaScript', 'MySQL'])
})

test('finds stacks whose names have symbols', () => {
  // Given a text with C# and .NET
  const text = 'C# com .NET'

  // When the stacks are found
  const stacks = stacksInText(taxonomy, text)

  // Then both are found
  assert.deepEqual(stacks, ['.NET', 'C#'])
})

test('finds a stack with a dot in its name', () => {
  // Given a text with Node.js
  const text = 'Node.js'

  // When the stacks are found
  const stacks = stacksInText(taxonomy, text)

  // Then only Node.js is found
  assert.deepEqual(stacks, ['Node.js'])
})

test('case sensitive stacks are found by their alias', () => {
  // Given a text with the common word and the alias of Go
  const text = "Let's go live with Golang"

  // When the stacks are found
  const stacks = stacksInText(taxonomy, text)

  // Then Go is found once
  assert.deepEqual(stacks, ['Go'])
})

test('case sensitive stacks ignore the common word', () => {
  // Given a text with only the common word
  const text = "let's go"

  // When the stacks are found
  const stacks = stacksInText(taxonomy, text)

  // Then no stack is found
  assert.deepEqual(stacks, [])
})

for (const form of FORMS) {
  test(`the stacks of ${form} are the shared taxonomy stacks`, { skip: !process.env.TAXONOMY_FILE }, () => {
    // Given the stacks of the shared taxonomy
    const names = loadTaxonomy().stacks.map((stack) => stack.name)

    // When the options of the form are read
    const options = dropdownOptions(form, 'stack')

    // Then they are the same stacks
    assert.deepEqual(options, names, form)
  })
}
