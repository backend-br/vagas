// Parses the body GitHub renders from the issue forms in .github/ISSUE_TEMPLATE.
// Keys must match the field labels of vaga-pt-br.yml and job-en-us.yml.

export const FORMS = {
  pt: {
    company: 'Sobre a empresa',
    companyUrl: 'Site da empresa',
    description: 'Descrição da vaga',
    requirements: 'Requisitos',
    benefits: 'Benefícios',
    salary: 'Faixa salarial',
    level: 'Nível',
    contract: 'Regime de contratação',
    workModel: 'Modelo de trabalho',
    location: 'Localização',
    apply: 'Como se candidatar',
    confirmations: 'Confirmações',
  },
  en: {
    company: 'About the company',
    companyUrl: 'Company website',
    description: 'Job description',
    requirements: 'Requirements',
    benefits: 'Benefits',
    salary: 'Salary range',
    level: 'Level',
    contract: 'Contract type',
    workModel: 'Work model',
    location: 'Location',
    apply: 'How to apply',
    confirmations: 'Confirmations',
  },
}

export const REQUIRED = ['company', 'companyUrl', 'description', 'requirements', 'level', 'contract', 'workModel', 'apply']

// Dropdown values mapped to the labels that already exist in the repository.
const LABELS = {
  Estagiário: 'Estagiário', Intern: 'Estagiário',
  Júnior: 'Júnior', Junior: 'Júnior',
  Pleno: 'Pleno', 'Mid-level': 'Pleno',
  Sênior: 'Sênior', Senior: 'Sênior',
  Especialista: 'Especialista', 'Staff/Principal': 'Especialista',
  CLT: 'CLT', PJ: 'PJ', Contrato: 'Contrato', Contractor: 'Contrato', Freelance: 'Freelance',
  Remoto: 'Remoto', Remote: 'Remoto',
  Híbrido: 'Híbrido', Hybrid: 'Híbrido',
  Presencial: 'Presencial', 'On-site': 'Presencial',
}

const MIN_DESCRIPTION = 80

function sections(body) {
  const result = {}
  const parts = (body ?? '').replace(/\r\n/g, '\n').split(/^###\s+/m).slice(1)
  for (const part of parts) {
    const newline = part.indexOf('\n')
    const heading = (newline === -1 ? part : part.slice(0, newline)).trim()
    const value = newline === -1 ? '' : part.slice(newline + 1).trim()
    result[heading] = value === '_No response_' ? '' : value
  }
  return result
}

export function parseForm(body) {
  const found = sections(body)
  let best = null
  for (const [lang, labels] of Object.entries(FORMS)) {
    const fields = {}
    let matched = 0
    for (const [key, label] of Object.entries(labels)) {
      if (label in found) {
        fields[key] = found[label]
        matched++
      }
    }
    if (!best || matched > best.matched) best = { lang, fields, matched }
  }
  if (!best || best.matched < REQUIRED.length / 2) return { lang: null, fields: {}, problems: ['form'] }

  const { lang, fields } = best
  const problems = []
  const missing = REQUIRED.filter((key) => !fields[key])
  if (missing.length) problems.push('form')
  else if (fields.description.length < MIN_DESCRIPTION) problems.push('form')
  if (/- \[ \]/.test(fields.confirmations ?? '- [ ]')) problems.push('form')

  return { lang, fields, problems: [...new Set(problems)] }
}

export function formLabels(fields) {
  return [fields.level, fields.contract, fields.workModel]
    .flatMap((value) => (value ?? '').split(','))
    .map((value) => LABELS[value.trim()])
    .filter(Boolean)
}
