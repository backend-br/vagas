import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseForm, repositoryLabelsFromForm } from '../form.mjs'
import { buildFormatComment, needsFormatting, normalizeTitle, proposeFormat } from '../format.mjs'
import { taxonomy } from './taxonomy.fixture.mjs'

const LEGACY_BODY = `<!-- Por favor, poste apenas vagas para backend. -->

## **Nossa empresa**

A **Igma** cria produtos digitais críticos.

## **Descrição da vaga**

Você será responsável por manter as APIs de pagamentos em Node.js, com PostgreSQL e filas no AWS SQS, junto ao time.

**Premissas culturais**

- Coragem

## Local

100% Remoto

## **Requisitos**

- Node.js

## Etapas do processo

1. Entrevista

## Contratação

PJ, R$ 10.000 a R$ 12.000

## Como se candidatar

https://jobs.quickin.io/igma/jobs/1

## Labels

#### Alocação
- Remoto
#### Nível
- Pleno`

const legacyIssue = {
  title: '[REMOTO] Desenvolvedor Full-Stack Pleno  –  Igma',
  body: LEGACY_BODY,
  labels: [{ name: 'PJ' }, { name: 'Pleno' }, { name: 'Remoto' }, { name: 'Node.js' }],
}

const FORM_POST_BODY =
  '### Sobre a empresa\n\nFintech.\n\n### Site da empresa\n\nhttps://empresa.com.br\n\n### Descrição da vaga\n\nAPIs.\n\n### Requisitos\n\nGo\n\n### Nível\n\nPleno\n\n### Regime de contratação\n\nCLT\n\n### Modelo de trabalho\n\nRemoto\n\n### Como se candidatar\n\nhttps://empresa.com.br/vagas'

const ENGLISH_LEGACY_BODY =
  '## About us\n\nWe build APIs.\n\n## Requirements\n\nGo\n\n## Type of contract\n\nContractor\n\n## Modality\n\nFully remote\n\n## How to apply\n\nhttps://company.com/jobs'

test('a legacy post is reorganized into the form of its language', () => {
  // Given a legacy post written in Portuguese
  const issue = legacyIssue

  // When the format is proposed
  const proposal = proposeFormat(issue)

  // Then the proposal is in Portuguese and changes the body
  assert.equal(proposal.language, 'pt')
  assert.equal(proposal.bodyChanged, true)
})

test('the pt-BR form of a legacy post keeps all of its text', () => {
  // Given the proposal for a legacy post
  const proposal = proposeFormat(legacyIssue)

  // When the proposed body is parsed as a form
  const form = parseForm(proposal.body)

  // Then every section lands in its field
  assert.equal(form.language, 'pt')
  assert.match(form.fields.company, /A \*\*Igma\*\* cria produtos/)
  assert.match(form.fields.description, /\*\*Premissas culturais\*\*\n\n- Coragem/)
  assert.match(form.fields.requirements, /- Node\.js\n\n\*\*Etapas do processo\*\*\n\n1\. Entrevista/)
  assert.equal(form.fields.location, '100% Remoto')
  assert.equal(form.fields.apply, 'https://jobs.quickin.io/igma/jobs/1')
})

test('the form of a legacy post maps to the repository labels', () => {
  // Given the form proposed for a legacy post
  const form = parseForm(proposeFormat(legacyIssue).body)

  // When the repository labels are read from it
  const labels = repositoryLabelsFromForm(form.fields, taxonomy)

  // Then they follow the taxonomy
  assert.deepEqual(labels, ['Pleno', 'PJ', 'Remoto', 'Node.js', 'PostgreSQL'])
})

test('keeps the salary that came beside the contract, and drops the old list of labels and comments', () => {
  // Given a legacy post with a salary, a list of labels and a comment
  const issue = legacyIssue

  // When the format is proposed
  const { body } = proposeFormat(issue)

  // Then the salary stays and the labels and the comment go
  assert.match(body, /\*\*Regime de contratação:\*\* PJ, R\$ 10\.000 a R\$ 12\.000/)
  assert.doesNotMatch(body, /#### Alocação|Por favor, poste/)
})

test('reports the required fields the post does not have and never checks the confirmations', () => {
  // Given a legacy post without the company site
  const issue = legacyIssue

  // When the format is proposed
  const proposal = proposeFormat(issue)

  // Then the site is missing and the confirmations stay unchecked
  assert.deepEqual(proposal.missing, ['Site da empresa'])
  assert.match(proposal.body, /- \[ \] Esta issue contém uma única vaga\./)
  assert.doesNotMatch(proposal.body, /- \[x\]/i)
})

test('a post with no known heading keeps all of its text as the description', () => {
  // Given the proposal for a post with no known heading
  const proposal = proposeFormat({ title: 'Dev Backend', body: 'Vaga para Go.\n\n### Stack\n\nGo e Kafka', labels: [] })

  // When the proposed body is parsed as a form
  const form = parseForm(proposal.body)

  // Then the whole text is the description
  assert.equal(form.fields.description, 'Vaga para Go.\n\n**Stack**\n\nGo e Kafka')
})

test('reads an English legacy post as English, with the title in the English style', () => {
  // Given an English legacy post
  const issue = { title: '(Full-remote) Senior Go Engineer - Jobsity', body: ENGLISH_LEGACY_BODY, labels: [] }

  // When the format is proposed
  const proposal = proposeFormat(issue)

  // Then the proposal is in English with the tag fixed
  assert.equal(proposal.language, 'en')
  assert.equal(proposal.title, '[Remote] Senior Go Engineer - Jobsity')
})

test('reads an English legacy post into the en-US form', () => {
  // Given the proposal for an English legacy post
  const proposal = proposeFormat({
    title: '(Full-remote) Senior Go Engineer - Jobsity',
    body: ENGLISH_LEGACY_BODY,
    labels: [],
  })

  // When the proposed body is parsed as a form
  const form = parseForm(proposal.body)

  // Then the contract and the work model are in their fields
  assert.equal(form.fields.contract, 'Contractor')
  assert.equal(form.fields.workModel, 'Remote')
})

test('a post made with the form needs no formatting', () => {
  // Given the proposal for a post made with the form
  const proposal = proposeFormat({ title: '[Remoto] Back-end Pleno - Empresa', body: FORM_POST_BODY, labels: [] })

  // When the need for formatting is checked
  const needs = needsFormatting(proposal)

  // Then it does not need any
  assert.equal(needs, false)
})

test('leaves a post made with the form as it is', () => {
  // Given a post made with the form
  const issue = { title: '[Remoto] Back-end Pleno - Empresa', body: FORM_POST_BODY, labels: [] }

  // When the format is proposed
  const proposal = proposeFormat(issue)

  // Then the body is the same
  assert.equal(proposal.body, FORM_POST_BODY)
})

test('an upper case tag of the work model is capitalized', () => {
  // Given a title with the tag in upper case
  const title = '[REMOTO] Back-end Developer JR - PORT LOUIS'

  // When the title is normalized
  const normalized = normalizeTitle(title, [], 'pt')

  // Then only the tag changes
  assert.equal(normalized, '[Remoto] Back-end Developer JR - PORT LOUIS')
})

test('a tag with the percentage and a long dash is rewritten', () => {
  // Given a title with a percentage in the tag and a long dash
  const title = '[100% Remoto] Dev Go — Empresa'

  // When the title is normalized
  const normalized = normalizeTitle(title, [], 'pt')

  // Then the tag is short and the dash is a hyphen
  assert.equal(normalized, '[Remoto] Dev Go - Empresa')
})

test('a title without a tag gets the one from the labels', () => {
  // Given a title without a tag and a hybrid label
  const title = 'Dev Go - Empresa'

  // When the title is normalized
  const normalized = normalizeTitle(title, ['Híbrido'], 'pt')

  // Then the tag is added
  assert.equal(normalized, '[Híbrido] Dev Go - Empresa')
})

test('a title without a tag stays as it is when the labels have two work models', () => {
  // Given a title without a tag and two work model labels
  const title = 'Dev Go - Empresa'

  // When the title is normalized
  const normalized = normalizeTitle(title, ['Remoto', 'Híbrido'], 'pt')

  // Then no tag is added
  assert.equal(normalized, 'Dev Go - Empresa')
})

test('a tag with a state is kept', () => {
  // Given a title with a hybrid tag that names the state
  const title = '[Híbrido-SP] Dev Cobol - Evertec'

  // When the title is normalized
  const normalized = normalizeTitle(title, [], 'pt')

  // Then the title does not change
  assert.equal(normalized, '[Híbrido-SP] Dev Cobol - Evertec')
})

test('a tag with a place is kept even when the labels say remote', () => {
  // Given a title with a place in the tag and a remote label
  const title = '[Belo Horizonte, Brasil] Software Engineer na Google'

  // When the title is normalized
  const normalized = normalizeTitle(title, ['Remoto'], 'pt')

  // Then the title does not change
  assert.equal(normalized, '[Belo Horizonte, Brasil] Software Engineer na Google')
})

test('flags a title that kept the example text of the template', () => {
  // Given a post whose title kept the example text
  const issue = { title: '[Alocação] Back-end developer - NomeDaEmpresa', body: '', labels: [] }

  // When the format is proposed
  const proposal = proposeFormat(issue)

  // Then the title is flagged
  assert.equal(proposal.placeholderTitle, true)
})

test('does not flag a title written by the author', () => {
  // Given a post with a real title
  const issue = legacyIssue

  // When the format is proposed
  const proposal = proposeFormat(issue)

  // Then the title is not flagged
  assert.equal(proposal.placeholderTitle, false)
})

test('the suggestion comment fences the body so its own code blocks cannot break out', () => {
  // Given a proposal whose body has a code block
  const proposal = proposeFormat({ title: 'Dev', body: '## Requisitos\n\n````js\ncode\n````', labels: [] })

  // When the comment is built
  const comment = buildFormatComment(proposal, 'aplicar-formato')

  // Then the body sits in a longer fence and the command is named
  assert.match(comment, /^<!-- job-format -->/)
  assert.match(comment, /`````markdown\n/)
  assert.match(comment, /`aplicar-formato`/)
})

test('the proposal marks the title as changed when it was fixed', () => {
  // Given a post with a title in upper case
  const issue = { title: '[REMOTO] Dev', body: '## Requisitos\n\nNode', labels: [] }

  // When the format is proposed
  const proposal = proposeFormat(issue)

  // Then the title is marked as changed
  assert.equal(proposal.titleChanged, true)
})

test('the comment leaves out the title once it was fixed on the issue', () => {
  // Given a proposal whose title was already fixed on the issue
  const proposal = proposeFormat({ title: '[REMOTO] Dev', body: '## Requisitos\n\nNode', labels: [] })

  // When the comment is built
  const comment = buildFormatComment({ ...proposal, titleChanged: false }, 'aplicar-formato')

  // Then it does not suggest a title
  assert.doesNotMatch(comment, /Título sugerido|Suggested title/)
})
