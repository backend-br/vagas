import { canonicalNames, stacksInText } from './taxonomy.mjs'

export const FIELD_LABELS_BY_LANGUAGE = {
  pt: {
    company: 'Sobre a empresa',
    companyUrl: 'Site da empresa',
    description: 'Descrição da vaga',
    requirements: 'Requisitos',
    stack: 'Tecnologias',
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
    stack: 'Technologies',
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

export const REQUIRED_FIELDS = [
  'company',
  'companyUrl',
  'description',
  'requirements',
  'level',
  'contract',
  'workModel',
  'apply',
]

const MIN_DESCRIPTION_LENGTH = 80

function valuesByHeading(body) {
  const valueByHeading = {}
  const sections = (body ?? '')
    .replace(/\r\n/g, '\n')
    .split(/^###\s+/m)
    .slice(1)
  for (const section of sections) {
    const headingEnd = section.indexOf('\n')
    const heading = (headingEnd === -1 ? section : section.slice(0, headingEnd)).trim()
    const value = headingEnd === -1 ? '' : section.slice(headingEnd + 1).trim()
    valueByHeading[heading] = value === '_No response_' ? '' : value
  }
  return valueByHeading
}

function bestMatchingForm(valueByHeading) {
  let bestMatch = null
  for (const [language, fieldLabels] of Object.entries(FIELD_LABELS_BY_LANGUAGE)) {
    const fields = {}
    for (const [field, label] of Object.entries(fieldLabels)) {
      if (label in valueByHeading) fields[field] = valueByHeading[label]
    }
    const matchedFieldCount = Object.keys(fields).length
    if (!bestMatch || matchedFieldCount > bestMatch.matchedFieldCount)
      bestMatch = { language, fields, matchedFieldCount }
  }
  return bestMatch
}

function isFormComplete(fields) {
  const hasAllRequiredFields = REQUIRED_FIELDS.every((field) => fields[field])
  const hasDetailedDescription = (fields.description ?? '').length >= MIN_DESCRIPTION_LENGTH
  const hasAllConfirmationsChecked = !/- \[ \]/.test(fields.confirmations ?? '- [ ]')
  return hasAllRequiredFields && hasDetailedDescription && hasAllConfirmationsChecked
}

export function parseForm(body) {
  const bestMatch = bestMatchingForm(valuesByHeading(body))
  if (bestMatch.matchedFieldCount < REQUIRED_FIELDS.length / 2)
    return { language: null, fields: {}, problems: ['form'] }
  const { language, fields } = bestMatch
  return { language, fields, problems: isFormComplete(fields) ? [] : ['form'] }
}

export function repositoryLabelsFromForm(fields, taxonomy, title = '') {
  const stacks = fields.stack
    ? canonicalNames(taxonomy, 'stacks', fields.stack)
    : stacksInText(taxonomy, [title, fields.requirements, fields.description].filter(Boolean).join('\n'))
  return [
    ...canonicalNames(taxonomy, 'levels', fields.level),
    ...canonicalNames(taxonomy, 'contracts', fields.contract),
    ...canonicalNames(taxonomy, 'workModels', fields.workModel),
    ...stacks,
  ]
}
