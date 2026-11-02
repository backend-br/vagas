import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseForm, repositoryLabelsFromForm } from '../form.mjs'
import { buildComment } from '../messages.mjs'
import { contentReasons, decideVerdict } from '../rules.mjs'
import { evaluate } from '../triage.mjs'
import { taxonomy } from './taxonomy.fixture.mjs'

const config = {
  blockedDomains: ['micro1.ai'],
  reviewDomains: ['t.me'],
  lowEffort: { emojis: 15, hashtags: 5 },
  maxLinksPerSite: 4,
  terms: {
    aiTraining: ['anotacao de dados', 'rlhf'],
    crypto: ['web3'],
    unrelatedTitle: ['marketing', 'frontend'],
    backendTitle: ['backend', 'fullstack'],
  },
}
const DESCRIPTION =
  'Manter e evoluir as APIs de pagamentos em Node.js, com PostgreSQL e filas no AWS SQS, junto ao time de produto.'

function ptBody(overrides = {}) {
  const fields = {
    'Sobre a empresa': 'Fintech de pagamentos B2B.',
    'Site da empresa': 'https://empresa.com.br',
    'Descrição da vaga': DESCRIPTION,
    Requisitos: 'Node.js, PostgreSQL',
    Benefícios: '_No response_',
    'Faixa salarial': '_No response_',
    Nível: 'Pleno',
    'Regime de contratação': 'CLT, PJ',
    'Modelo de trabalho': 'Remoto',
    Localização: '_No response_',
    'Como se candidatar': 'https://empresa.com.br/vagas',
    Confirmações:
      '- [X] Esta issue contém uma única vaga.\n- [X] A vaga é para backend.\n- [X] Não é vaga de treinamento de IA.',
    ...overrides,
  }
  return Object.entries(fields)
    .map(([label, value]) => `### ${label}\n\n${value}`)
    .join('\n\n')
}

const enBody = [
  ['About the company', 'B2B payments fintech.'],
  ['Company website', 'https://company.com'],
  ['Job description', DESCRIPTION],
  ['Requirements', 'Go, PostgreSQL'],
  ['Level', 'Staff/Principal'],
  ['Contract type', 'Contractor'],
  ['Work model', 'Hybrid'],
  ['How to apply', 'https://company.com/jobs'],
  ['Confirmations', '- [X] One\n- [X] Two\n- [X] Three'],
]
  .map(([label, value]) => `### ${label}\n\n${value}`)
  .join('\n\n')

test('parses the pt-BR form', () => {
  // Given a post made with the pt-BR form
  const body = ptBody()

  // When the form is parsed
  const form = parseForm(body)

  // Then it is Portuguese and has no problems
  assert.equal(form.language, 'pt')
  assert.deepEqual(form.problems, [])
})

test('maps the pt-BR form to labels', () => {
  // Given the parsed pt-BR form
  const form = parseForm(ptBody())

  // When the labels are mapped
  const labels = repositoryLabelsFromForm(form.fields, taxonomy)

  // Then they follow the taxonomy
  assert.deepEqual(labels, ['Pleno', 'CLT', 'PJ', 'Remoto', 'Node.js', 'PostgreSQL'])
})

test('parses the en-US form', () => {
  // Given a post made with the en-US form
  const body = enBody

  // When the form is parsed
  const form = parseForm(body)

  // Then it is English and has no problems
  assert.equal(form.language, 'en')
  assert.deepEqual(form.problems, [])
})

test('maps the en-US form to the Portuguese labels', () => {
  // Given the parsed en-US form
  const form = parseForm(enBody)

  // When the labels are mapped
  const labels = repositoryLabelsFromForm(form.fields, taxonomy)

  // Then they are the Portuguese ones
  assert.deepEqual(labels, ['Especialista', 'Contrato', 'Híbrido', 'Go', 'Node.js', 'PostgreSQL'])
})

test('rejects a body written from the old template', () => {
  // Given a body from the old template
  const body = '## Nossa empresa\n\nInforme a descrição da empresa.'

  // When the form is parsed
  const form = parseForm(body)

  // Then the body is not a form
  assert.deepEqual(form.problems, ['form'])
})

test('rejects an empty body', () => {
  // Given an empty body
  const body = ''

  // When the form is parsed
  const form = parseForm(body)

  // Then the body is not a form
  assert.deepEqual(form.problems, ['form'])
})

test('rejects an empty required field', () => {
  // Given a form without the company site
  const body = ptBody({ 'Site da empresa': '_No response_' })

  // When the form is parsed
  const form = parseForm(body)

  // Then the form has a problem
  assert.deepEqual(form.problems, ['form'])
})

test('rejects a short description', () => {
  // Given a form with a one-line description
  const body = ptBody({ 'Descrição da vaga': 'Vaga backend.' })

  // When the form is parsed
  const form = parseForm(body)

  // Then the form has a problem
  assert.deepEqual(form.problems, ['form'])
})

test('rejects unchecked confirmations', () => {
  // Given a form with a confirmation left unchecked
  const body = ptBody({ Confirmações: '- [X] Um\n- [ ] Dois\n- [X] Três' })

  // When the form is parsed
  const form = parseForm(body)

  // Then the form has a problem
  assert.deepEqual(form.problems, ['form'])
})

test('hard content rule: an AI training domain', () => {
  // Given a post that links to an AI training domain
  const text = 'https://jobs.micro1.ai/post/1'

  // When the content is checked
  const reasons = contentReasons('Vaga', text, config)

  // Then it is AI training
  assert.deepEqual(reasons, ['ai_training'])
})

test('hard content rule: an AI training term', () => {
  // Given a post about data annotation for LLMs
  const text = 'Projeto de Anotação de Dados para LLMs'

  // When the content is checked
  const reasons = contentReasons('Vaga', text, config)

  // Then it is AI training
  assert.deepEqual(reasons, ['ai_training'])
})

test('hard content rule: a keycap list', () => {
  // Given a post with a list numbered by keycaps
  const text = '1️⃣ a 2️⃣ b 3️⃣ c'

  // When the content is checked
  const reasons = contentReasons('Vaga', text, config)

  // Then it has multiple jobs
  assert.deepEqual(reasons, ['multiple'])
})

test('hard content rule: more links to the same site than the limit', () => {
  // Given five different links to the same site
  const text = Array.from({ length: 5 }, (_, index) => `https://www.jobs.com/r/me?job=${index}`).join('\n')

  // When the content is checked
  const reasons = contentReasons('Vaga', text, config)

  // Then it has multiple jobs
  assert.deepEqual(reasons, ['multiple'])
})

test('hard content rule: a repeated link does not count twice', () => {
  // Given four different links to the same site and one repeated
  const links = Array.from({ length: 4 }, (_, index) => `https://www.jobs.com/r/me?job=${index}`).join('\n')
  const text = `${links} https://jobs.com/r/me?job=0`

  // When the content is checked
  const reasons = contentReasons('Vaga', text, config)

  // Then no reason is found
  assert.deepEqual(reasons, [])
})

test('hard content rule: a look-alike domain and term are not matched', () => {
  // Given a post with a look-alike domain and a term inside a word
  const text = 'https://notmicro1.ai https://empresa.com.br drlhf'

  // When the content is checked
  const reasons = contentReasons('Vaga', text, config)

  // Then no reason is found
  assert.deepEqual(reasons, [])
})

test('soft content rule: a telegram contact', () => {
  // Given a post with a Telegram link
  const text = 'fale em https://t.me/recruiter'

  // When the content is checked
  const reasons = contentReasons('Vaga', text, config)

  // Then the contact is suspicious
  assert.deepEqual(reasons, ['suspicious_contact'])
})

test('soft content rule: a crypto term', () => {
  // Given a post about Web3
  const text = 'Protocolo Web3'

  // When the content is checked
  const reasons = contentReasons('Vaga', text, config)

  // Then it is crypto
  assert.deepEqual(reasons, ['crypto'])
})

test('soft content rule: an unrelated title', () => {
  // Given a marketing title
  const title = '[Remoto] Analista de Marketing'

  // When the content is checked
  const reasons = contentReasons(title, '', config)

  // Then it is not backend
  assert.deepEqual(reasons, ['not_backend'])
})

test('soft content rule: a frontend title', () => {
  // Given a frontend title
  const title = '[Remoto] Dev Frontend'

  // When the content is checked
  const reasons = contentReasons(title, '', config)

  // Then it is not backend
  assert.deepEqual(reasons, ['not_backend'])
})

test('soft content rule: a fullstack title that also names backend', () => {
  // Given a fullstack title with backend in it
  const title = '[Remoto] Dev Fullstack (Frontend + Backend)'

  // When the content is checked
  const reasons = contentReasons(title, '', config)

  // Then no reason is found
  assert.deepEqual(reasons, [])
})

test('soft content rule: a wall of emojis', () => {
  // Given a post with fifteen emojis
  const text = '🚀'.repeat(15)

  // When the content is checked
  const reasons = contentReasons('Vaga', text, config)

  // Then it is low effort
  assert.deepEqual(reasons, ['low_effort'])
})

test('soft content rule: a wall of hashtags', () => {
  // Given a post with five hashtags
  const text = '#Vagas #Tecnologia #Java #Remoto #Dolar'

  // When the content is checked
  const reasons = contentReasons('Vaga', text, config)

  // Then it is low effort
  assert.deepEqual(reasons, ['low_effort'])
})

test('soft content rule: symbols that look like hashtags are not matched', () => {
  // Given a post with C#, F# and an issue number
  const text = 'C# e F# com .NET, issue #123'

  // When the content is checked
  const reasons = contentReasons('Vaga', text, config)

  // Then no reason is found
  assert.deepEqual(reasons, [])
})

test('verdict: no reason is verified', () => {
  // Given no reasons
  const reasons = []

  // When the verdict is decided
  const decision = decideVerdict(reasons)

  // Then the post is verified
  assert.deepEqual(decision, { verdict: 'verified', reasons: [] })
})

test('verdict: any hard reason rejects', () => {
  // Given a soft and a hard reason
  const reasons = ['crypto', 'multiple']

  // When the verdict is decided
  const decision = decideVerdict(reasons)

  // Then the post is rejected for the hard one
  assert.deepEqual(decision, { verdict: 'reject', reasons: ['multiple'] })
})

test('verdict: soft reasons send to review', () => {
  // Given a soft reason repeated
  const reasons = ['crypto', 'crypto']

  // When the verdict is decided
  const decision = decideVerdict(reasons)

  // Then the post goes to review
  assert.deepEqual(decision, { verdict: 'review', reasons: ['crypto'] })
})

function githubLookupsSpy(overrides = {}) {
  return {
    verifiedCount: async () => 0,
    ...overrides,
  }
}

const issue = { title: '[Remoto] Back-end Pleno - Empresa', body: ptBody(), created_at: '2026-10-22T12:00:00Z' }

test('evaluate: clean post is verified', async () => {
  // Given a clean post and an author without history
  const lookups = githubLookupsSpy()

  // When the post is evaluated
  const result = await evaluate(issue, lookups)

  // Then it is verified
  assert.equal(result.verdict, 'verified')
})

test('evaluate: hard rule failures skip the author lookups', async () => {
  // Given a post that is not a form and a lookup that fails if it is called
  const lookups = githubLookupsSpy({ verifiedCount: async () => assert.fail('lookup called') })

  // When the post is evaluated
  const result = await evaluate({ ...issue, body: 'texto solto' }, lookups)

  // Then the form reason comes without any lookup
  assert.deepEqual(result.reasons, ['form'])
})

test('evaluate: issues created before the forms existed skip the form check', async () => {
  // Given an issue without a form created before the forms existed
  const legacy = { ...issue, body: '## Nossa empresa\n\nFintech.', created_at: '2026-10-01T12:00:00Z' }

  // When the issue is evaluated
  const result = await evaluate(legacy, githubLookupsSpy())

  // Then it is verified
  assert.equal(result.verdict, 'verified')
})

test('evaluate: issues created before the forms existed still get the hard checks', async () => {
  // Given a legacy issue that links to an AI training domain
  const legacy = {
    ...issue,
    body: 'https://micro1.ai/job',
    created_at: '2026-10-01T12:00:00Z',
  }

  // When the issue is evaluated
  const result = await evaluate(legacy, githubLookupsSpy())

  // Then it is flagged as AI training
  assert.deepEqual(result.reasons, ['ai_training'])
})

test('evaluate: trusted authors skip soft checks', async () => {
  // Given an author with verified posts and a title with a soft reason
  const trusted = githubLookupsSpy({ verifiedCount: async () => 3 })
  const post = { ...issue, title: '[Remoto] Dev Web3 Backend' }

  // When the post is evaluated
  const result = await evaluate(post, trusted)

  // Then it is verified
  assert.equal(result.verdict, 'verified')
})

test('evaluate: trusted authors do not skip hard checks', async () => {
  // Given an author with verified posts and a body with a hard reason
  const trusted = githubLookupsSpy({ verifiedCount: async () => 3 })
  const post = { ...issue, body: `${issue.body}\nhttps://micro1.ai` }

  // When the post is evaluated
  const result = await evaluate(post, trusted)

  // Then it is flagged as AI training
  assert.deepEqual(result.reasons, ['ai_training'])
})

test('evaluate: soft reasons send to review', async () => {
  // Given a post with an unrelated title and an author without history
  const post = { ...issue, title: '[Remoto] Analista de Marketing' }

  // When the post is evaluated
  const result = await evaluate(post, githubLookupsSpy())

  // Then the title is not backend
  assert.deepEqual(result.reasons, ['not_backend'])
})

test('comment is bilingual when the language is unknown', () => {
  // Given a rejection with an unknown language
  const decision = { verdict: 'reject', reasons: ['form', 'multiple'] }

  // When the comment is built
  const text = buildComment(null, decision, 'backend-br/vagas')

  // Then it comes in both languages with the reasons
  assert.match(text, /fechada automaticamente/)
  assert.match(text, /closed automatically/)
  assert.match(text, /mais de uma vaga/)
})

test('comment of a review leaves out the rejection text', () => {
  // Given a review decision in English
  const decision = { verdict: 'review', reasons: ['crypto'] }

  // When the comment is built
  const text = buildComment('en', decision, 'r')

  // Then it does not say the post was rejected
  assert.doesNotMatch(text, /triagem\./)
})
