import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseForm, repositoryLabelsFromForm } from '../form.mjs'
import { buildFormatComment, needsFormatting, normalizeTitle, proposeFormat } from '../format.mjs'

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

const legacyIssue = { title: '[REMOTO] Desenvolvedor Full-Stack Pleno  –  Igma', body: LEGACY_BODY, labels: [{ name: 'PJ' }, { name: 'Pleno' }, { name: 'Remoto' }, { name: 'Node.js' }] }

test('reorganizes a legacy post into the pt-BR form without dropping any text', () => {
  const proposal = proposeFormat(legacyIssue)
  assert.equal(proposal.language, 'pt')
  assert.equal(proposal.bodyChanged, true)

  const form = parseForm(proposal.body)
  assert.equal(form.language, 'pt')
  assert.match(form.fields.company, /A \*\*Igma\*\* cria produtos/)
  assert.match(form.fields.description, /\*\*Premissas culturais\*\*\n\n- Coragem/)
  assert.match(form.fields.requirements, /- Node\.js\n\n\*\*Etapas do processo\*\*\n\n1\. Entrevista/)
  assert.equal(form.fields.location, '100% Remoto')
  assert.equal(form.fields.apply, 'https://jobs.quickin.io/igma/jobs/1')
  assert.deepEqual(repositoryLabelsFromForm(form.fields), ['Pleno', 'PJ', 'Remoto'])
})

test('keeps the salary that came beside the contract, and drops the old list of labels and comments', () => {
  const { body } = proposeFormat(legacyIssue)
  assert.match(body, /\*\*Regime de contratação:\*\* PJ, R\$ 10\.000 a R\$ 12\.000/)
  assert.doesNotMatch(body, /#### Alocação|Por favor, poste/)
})

test('reports the required fields the post does not have and never checks the confirmations', () => {
  const proposal = proposeFormat(legacyIssue)
  assert.deepEqual(proposal.missing, ['Site da empresa'])
  assert.match(proposal.body, /- \[ \] Esta issue contém uma única vaga\./)
  assert.doesNotMatch(proposal.body, /- \[x\]/i)
})

test('a post with no known heading keeps all of its text as the description', () => {
  const proposal = proposeFormat({ title: 'Dev Backend', body: 'Vaga para Go.\n\n### Stack\n\nGo e Kafka', labels: [] })
  assert.equal(parseForm(proposal.body).fields.description, 'Vaga para Go.\n\n**Stack**\n\nGo e Kafka')
})

test('reads an English legacy post into the en-US form', () => {
  const body = '## About us\n\nWe build APIs.\n\n## Requirements\n\nGo\n\n## Type of contract\n\nContractor\n\n## Modality\n\nFully remote\n\n## How to apply\n\nhttps://company.com/jobs'
  const proposal = proposeFormat({ title: '(Full-remote) Senior Go Engineer - Jobsity', body, labels: [] })
  const form = parseForm(proposal.body)
  assert.equal(proposal.language, 'en')
  assert.equal(proposal.title, '[Remote] Senior Go Engineer - Jobsity')
  assert.equal(form.fields.contract, 'Contractor')
  assert.equal(form.fields.workModel, 'Remote')
})

test('leaves a post made with the form as it is', () => {
  const body = '### Sobre a empresa\n\nFintech.\n\n### Site da empresa\n\nhttps://empresa.com.br\n\n### Descrição da vaga\n\nAPIs.\n\n### Requisitos\n\nGo\n\n### Nível\n\nPleno\n\n### Regime de contratação\n\nCLT\n\n### Modelo de trabalho\n\nRemoto\n\n### Como se candidatar\n\nhttps://empresa.com.br/vagas'
  const proposal = proposeFormat({ title: '[Remoto] Back-end Pleno - Empresa', body, labels: [] })
  assert.equal(needsFormatting(proposal), false)
  assert.equal(proposal.body, body)
})

test('the title only changes where the change is certain', () => {
  assert.equal(normalizeTitle('[REMOTO] Back-end Developer JR - PORT LOUIS', [], 'pt'), '[Remoto] Back-end Developer JR - PORT LOUIS')
  assert.equal(normalizeTitle('[100% Remoto] Dev Go — Empresa', [], 'pt'), '[Remoto] Dev Go - Empresa')
  assert.equal(normalizeTitle('Dev Go - Empresa', ['Híbrido'], 'pt'), '[Híbrido] Dev Go - Empresa')
  assert.equal(normalizeTitle('Dev Go - Empresa', ['Remoto', 'Híbrido'], 'pt'), 'Dev Go - Empresa')
  assert.equal(normalizeTitle('[Híbrido-SP] Dev Cobol - Evertec', [], 'pt'), '[Híbrido-SP] Dev Cobol - Evertec')
  assert.equal(normalizeTitle('[Belo Horizonte, Brasil] Software Engineer na Google', ['Remoto'], 'pt'), '[Belo Horizonte, Brasil] Software Engineer na Google')
})

test('flags a title that kept the example text of the template', () => {
  assert.equal(proposeFormat({ title: '[Alocação] Back-end developer - NomeDaEmpresa', body: '', labels: [] }).placeholderTitle, true)
  assert.equal(proposeFormat(legacyIssue).placeholderTitle, false)
})

test('the suggestion comment fences the body so its own code blocks cannot break out', () => {
  const proposal = proposeFormat({ title: 'Dev', body: '## Requisitos\n\n````js\ncode\n````', labels: [] })
  const comment = buildFormatComment(proposal, 'aplicar-formato')
  assert.match(comment, /^<!-- job-format -->/)
  assert.match(comment, /`````markdown\n/)
  assert.match(comment, /`aplicar-formato`/)
})

test('the comment leaves out the title once it was fixed on the issue', () => {
  const proposal = proposeFormat({ title: '[REMOTO] Dev', body: '## Requisitos\n\nNode', labels: [] })
  assert.equal(proposal.titleChanged, true)
  assert.doesNotMatch(buildFormatComment({ ...proposal, titleChanged: false }, 'aplicar-formato'), /Título sugerido|Suggested title/)
})
