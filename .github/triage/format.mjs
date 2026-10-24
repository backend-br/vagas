import { FIELD_LABELS_BY_LANGUAGE, REQUIRED_FIELDS, parseForm } from './form.mjs'

export const FORMAT_COMMENT_MARKER = '<!-- job-format -->'

const NO_RESPONSE = '_No response_'
const HEADING_PATTERN = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/
const HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->/g
const TITLE_PREFIX_PATTERN = /^\s*[[(]([^\])]+)[\])]\s*/
const TEMPLATE_PLACEHOLDERS = ['nomedaempresa', 'nome da empresa', 'companyname']

const CONFIRMATIONS_BY_LANGUAGE = {
  pt: [
    'Esta issue contém uma única vaga.',
    'A vaga é para backend (ou fullstack com foco em backend).',
    'Não é vaga de treinamento de IA, anotação de dados ou avaliação de modelos.',
  ],
  en: [
    'This issue contains a single job opening.',
    'The job is backend (or fullstack with a backend focus).',
    'This is not an AI training, data annotation or model evaluation gig.',
  ],
}

const HEADINGS_BY_FIELD = {
  company: {
    pt: ['sobre a empresa', 'nossa empresa', 'a empresa', 'empresa', 'sobre nos', 'quem somos'],
    en: ['about the company', 'about us', 'company', 'company team introduction', 'who we are'],
  },
  companyUrl: {
    pt: ['site da empresa', 'site'],
    en: ['company website', 'website'],
  },
  description: {
    pt: ['descricao da vaga', 'descricao', 'sobre a vaga', 'a vaga', 'sobre a oportunidade', 'a oportunidade', 'o desafio', 'desafio'],
    en: ['job description', 'description', 'about the role', 'about the job', 'job details', 'the role'],
  },
  requirements: {
    pt: ['requisitos', 'requisitos obrigatorios', 'requisitos minimos', 'requisitos tecnicos', 'o que voce precisa ter', 'qualificacoes'],
    en: ['requirements', 'qualifications', 'minimum qualifications', 'what you need', 'must have'],
  },
  benefits: {
    pt: ['beneficios', 'o que oferecemos', 'o que oferecemos para voce'],
    en: ['benefits', 'perks', 'perks and benefits', 'compensation and benefits', 'compensation benefits', 'what we offer'],
  },
  salary: {
    pt: ['faixa salarial', 'salario', 'remuneracao'],
    en: ['salary range', 'salary', 'compensation'],
  },
  level: {
    pt: ['nivel', 'senioridade'],
    en: ['level', 'seniority'],
  },
  contract: {
    pt: ['regime de contratacao', 'regime', 'contratacao', 'tipo de contratacao', 'modelo de contratacao'],
    en: ['contract type', 'type of contract', 'contract'],
  },
  workModel: {
    pt: ['modelo de trabalho', 'alocacao', 'modalidade', 'formato de trabalho'],
    en: ['work model', 'modality', 'workplace type'],
  },
  location: {
    pt: ['localizacao', 'local', 'local de trabalho', 'cidade'],
    en: ['location', 'office location'],
  },
  apply: {
    pt: ['como se candidatar', 'como aplicar', 'candidatura', 'como participar', 'para se candidatar'],
    en: ['how to apply', 'apply', 'application'],
  },
}

// Sections of the old Markdown template that only listed labels, and the form's own checkboxes.
const DISCARDED_HEADINGS = ['labels', 'categoria', 'confirmacoes', 'confirmations']

const OPTION_TERMS = {
  workModel: [
    ['Remoto', ['remoto', 'remota', '100 remoto', 'remote', 'fully remote', 'full remote', 'home office', 'anywhere']],
    ['Híbrido', ['hibrido', 'hibrida', 'hybrid']],
    ['Presencial', ['presencial', 'on site', 'onsite', 'alocado', 'alocada', 'escritorio']],
  ],
  level: [
    ['Estagiário', ['estagio', 'estagiario', 'estagiaria', 'intern', 'internship']],
    ['Júnior', ['junior', 'jr']],
    ['Pleno', ['pleno', 'mid level', 'mid']],
    ['Sênior', ['senior', 'sr']],
    ['Especialista', ['especialista', 'staff', 'principal']],
  ],
  contract: [
    ['CLT', ['clt']],
    ['PJ', ['pj']],
    ['Contrato', ['contrato', 'contractor']],
    ['Freelance', ['freelance', 'freela', 'freelancer']],
  ],
}

const OPTION_TRANSLATIONS = {
  Remoto: 'Remote', Híbrido: 'Hybrid', Presencial: 'On-site',
  Estagiário: 'Intern', Júnior: 'Junior', Pleno: 'Mid-level', Sênior: 'Senior', Especialista: 'Staff/Principal',
  CLT: 'CLT', PJ: 'PJ', Contrato: 'Contractor', Freelance: 'Freelance',
}

function normalized(text) {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function containsPhrase(normalizedText, phrase) {
  return ` ${normalizedText} `.includes(` ${phrase} `)
}

function headingText(line) {
  const match = HEADING_PATTERN.exec(line)
  return match ? match[2].replace(/[*_`]/g, '').trim() : null
}

export function fieldOfHeading(heading) {
  const key = normalized(heading)
  if (DISCARDED_HEADINGS.includes(key)) return { field: 'discarded', language: null }
  for (const [field, headingsByLanguage] of Object.entries(HEADINGS_BY_FIELD)) {
    for (const [language, headings] of Object.entries(headingsByLanguage)) {
      if (headings.includes(key)) return { field, language }
    }
  }
  return null
}

function splitIntoSections(body) {
  const sections = [{ heading: null, lines: [] }]
  let isFenced = false
  for (const line of body.replace(/\r\n/g, '\n').replace(HTML_COMMENT_PATTERN, '').split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) isFenced = !isFenced
    const heading = isFenced ? null : headingText(line)
    if (heading) sections.push({ heading, lines: [] })
    else sections.at(-1).lines.push(line)
  }
  return sections.map((section) => ({ ...section, text: section.lines.join('\n').trim() }))
}

function optionsIn(text, facet) {
  const key = normalized(text)
  return OPTION_TERMS[facet].filter(([, terms]) => terms.some((term) => containsPhrase(key, term))).map(([option]) => option)
}

const CONNECTORS = ['ou', 'e', 'or', 'and', 'a', 'de', 'com']

function saysOnlyOptions(text, facet) {
  let rest = ` ${normalized(text)} `
  for (const [, terms] of OPTION_TERMS[facet]) {
    for (const term of [...terms].sort((a, b) => b.length - a.length)) {
      while (rest.includes(` ${term} `)) rest = rest.replace(` ${term} `, ' ')
    }
  }
  return rest.split(' ').filter(Boolean).every((word) => CONNECTORS.includes(word))
}

function uniqueOptions(...lists) {
  return [...new Set(lists.flat())]
}

function titlePrefix(title) {
  return TITLE_PREFIX_PATTERN.exec(title)?.[1] ?? ''
}

// Reads the facets from the issue labels first, since the moderation sets them, then from the sections that name
// them, then from the prefix of the title. Free text is never read, where a word like "remoto" may be negated.
function optionsOf(facet, { labelNames, sectionTexts, title }) {
  const fromLabels = uniqueOptions(...labelNames.map((name) => optionsIn(name, facet)))
  if (fromLabels.length) return fromLabels
  const fromSections = uniqueOptions(...sectionTexts.map((text) => optionsIn(text, facet)))
  if (fromSections.length) return fromSections
  return optionsIn(titlePrefix(title), facet)
}

function readSections(body) {
  const textByField = {}
  const matchedLanguages = []
  let currentField = 'description'
  const append = (field, text) => {
    if (!text) return
    textByField[field] = textByField[field] ? `${textByField[field]}\n\n${text}` : text
  }
  const [preamble, ...sections] = splitIntoSections(body)
  append('description', preamble.text)
  for (const section of sections) {
    const match = fieldOfHeading(section.heading)
    if (match?.field === 'discarded') {
      currentField = 'discarded'
      continue
    }
    if (match) {
      matchedLanguages.push(match.language)
      currentField = match.field
      append(currentField, section.text)
      continue
    }
    if (currentField === 'discarded') continue
    // A heading the form does not know stays with the field it falls under, so no text is ever dropped.
    append(currentField, [`**${section.heading}**`, section.text].filter(Boolean).join('\n\n'))
  }
  return { textByField, matchedLanguages }
}

function languageOf(matchedLanguages) {
  const englishCount = matchedLanguages.filter((language) => language === 'en').length
  return englishCount > matchedLanguages.length - englishCount ? 'en' : 'pt'
}

function optionText(options, language) {
  return options.map((option) => (language === 'en' ? OPTION_TRANSLATIONS[option] : option)).join(', ')
}

function formBody(fields, language) {
  const fieldLabels = FIELD_LABELS_BY_LANGUAGE[language]
  const confirmations = CONFIRMATIONS_BY_LANGUAGE[language].map((label) => `- [ ] ${label}`).join('\n')
  return Object.entries(fieldLabels)
    .map(([field, label]) => `### ${label}\n\n${field === 'confirmations' ? confirmations : fields[field] || NO_RESPONSE}`)
    .join('\n\n')
}

function canonicalPrefix(prefix, workModels, language) {
  const options = optionsIn(prefix, 'workModel')
  const isOnlyAWorkModel = options.length === 1 && OPTION_TERMS.workModel
    .find(([option]) => option === options[0])[1]
    .includes(normalized(prefix))
  if (isOnlyAWorkModel) return optionText(options, language)
  if (!prefix && workModels.length === 1) return optionText(workModels, language)
  return prefix
}

export function normalizeTitle(title, workModels, language) {
  const prefix = titlePrefix(title)
  const rest = title.replace(TITLE_PREFIX_PATTERN, '')
  const newPrefix = canonicalPrefix(prefix.trim(), workModels, language)
  const tidyRest = rest
    .replace(/\s+[–—]\s+/g, ' - ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return newPrefix ? `[${newPrefix}] ${tidyRest}` : tidyRest
}

function usesTemplatePlaceholder(title) {
  const key = normalized(title)
  return TEMPLATE_PLACEHOLDERS.some((placeholder) => containsPhrase(key, normalized(placeholder))) || normalized(titlePrefix(title)) === 'alocacao'
}

// Proposes the title and the body of an issue in the shape of the issue forms, built only from what the issue
// already says. Nothing is invented: a field the issue does not fill is left empty and reported as missing.
export function proposeFormat(issue) {
  const labelNames = (issue.labels ?? []).map((label) => (typeof label === 'string' ? label : label.name))
  const body = issue.body ?? ''
  const form = parseForm(body)
  const isAlreadyAForm = form.language !== null
  const { textByField, matchedLanguages } = isAlreadyAForm ? { textByField: form.fields, matchedLanguages: [form.language] } : readSections(body)
  const language = isAlreadyAForm ? form.language : languageOf(matchedLanguages)

  const sectionTexts = [textByField.workModel, textByField.level, textByField.contract, textByField.location].filter(Boolean)
  const facets = { labelNames, sectionTexts, title: issue.title }
  const workModels = optionsOf('workModel', facets)
  const fields = { ...textByField }
  if (!isAlreadyAForm) {
    for (const facet of ['level', 'contract', 'workModel']) {
      const options = optionsOf(facet, facets)
      if (!options.length) continue
      const sectionText = textByField[facet] ?? ''
      // A section that said more than the option, such as the salary beside the contract, keeps its text.
      if (sectionText && !saysOnlyOptions(sectionText, facet)) {
        fields.description = [fields.description, `**${FIELD_LABELS_BY_LANGUAGE[language][facet]}:** ${sectionText}`].filter(Boolean).join('\n\n')
      }
      fields[facet] = optionText(options, language)
    }
  }

  const title = normalizeTitle(issue.title, workModels, language)
  const newBody = isAlreadyAForm ? body : formBody(fields, language)
  const missing = REQUIRED_FIELDS.filter((field) => !fields[field]).map((field) => FIELD_LABELS_BY_LANGUAGE[language][field])
  return {
    language,
    title,
    body: newBody,
    titleChanged: title !== issue.title.trim(),
    bodyChanged: !isAlreadyAForm,
    missing,
    placeholderTitle: usesTemplatePlaceholder(issue.title),
  }
}

function longestRun(text, character) {
  return Math.max(0, ...[...text.matchAll(new RegExp(`\\${character}+`, 'g'))].map((match) => match[0].length))
}

const TEXT_BY_LANGUAGE = {
  pt: {
    intro: 'Esta vaga está fora do padrão do formulário. Abaixo está a mesma vaga reorganizada no formato do formulário, com o texto original, sem nada inventado.',
    how: (applyLabel) => `O texto da vaga não foi alterado. Quem publicou pode editar a issue com o texto sugerido, ou uma pessoa mantenedora pode aplicar com a label \`${applyLabel}\`. O texto anterior continua no histórico de edições da issue.`,
    title: 'Título sugerido',
    body: 'Texto sugerido',
    missing: 'Faltam informações obrigatórias, que só quem publicou pode completar',
    placeholder: 'O título ainda usa o texto de exemplo do modelo. Troque pelo cargo e pela empresa.',
    confirm: 'As confirmações ficam desmarcadas: só quem publicou pode marcá-las.',
    applied: (user) => `Formato aplicado por @${user}. O texto anterior continua no histórico de edições da issue.`,
  },
  en: {
    intro: 'This job post does not follow the form. Below is the same post reorganized in the shape of the form, with its original text and nothing made up.',
    how: (applyLabel) => `The text of the post was not changed. The author can edit the issue with the suggested text, or a maintainer can apply it with the \`${applyLabel}\` label. The previous text stays in the edit history of the issue.`,
    title: 'Suggested title',
    body: 'Suggested text',
    missing: 'Required information is missing, which only the author can fill in',
    placeholder: 'The title still uses the example text of the template. Replace it with the role and the company.',
    confirm: 'The confirmations are left unchecked: only the author can check them.',
    applied: (user) => `Format applied by @${user}. The previous text stays in the edit history of the issue.`,
  },
}

export function buildFormatComment(proposal, applyLabel) {
  const text = TEXT_BY_LANGUAGE[proposal.language]
  const lines = [FORMAT_COMMENT_MARKER, text.intro, '', text.how(applyLabel)]
  if (proposal.titleChanged) lines.push('', `**${text.title}:** \`${proposal.title.replace(/`/g, "'")}\``)
  if (proposal.placeholderTitle) lines.push('', text.placeholder)
  if (proposal.missing.length) lines.push('', `**${text.missing}:** ${proposal.missing.join(', ')}.`)
  if (proposal.bodyChanged) {
    const fence = '`'.repeat(Math.max(3, longestRun(proposal.body, '`') + 1))
    lines.push('', text.confirm, '', `<details><summary>${text.body}</summary>`, '', `${fence}markdown`, proposal.body, fence, '', '</details>')
  }
  return lines.join('\n')
}

export function buildAppliedComment(language, user) {
  return [FORMAT_COMMENT_MARKER, TEXT_BY_LANGUAGE[language].applied(user)].join('\n')
}

export function needsFormatting(proposal) {
  return proposal.titleChanged || proposal.bodyChanged
}
