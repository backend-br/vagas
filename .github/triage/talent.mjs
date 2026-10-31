import { localize } from './language.mjs'
import { FACETS } from './taxonomy.mjs'

export const TALENT_COMMENT_MARKER = '<!-- talent-match -->'

const PROFILE_HEADINGS = {
  name: 'Nome completo',
  location: 'Localização',
  linkedin: 'LinkedIn',
  github: 'GitHub',
}
const LINKEDIN_PATTERN = /^https:\/\/(www\.)?linkedin\.com\/in\/[\w%-]+\/?$/i
const GITHUB_PATTERN = /^https:\/\/github\.com\/[a-z\d](?:[a-z\d-]{0,38})\/?$/i
const UF_CODES = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
]
const UF_BY_PLACE = [
  ['mato grosso do sul', 'MS'],
  ['mato grosso', 'MT'],
  ['rio grande do norte', 'RN'],
  ['rio grande do sul', 'RS'],
  ['rio de janeiro', 'RJ'],
  ['espirito santo', 'ES'],
  ['distrito federal', 'DF'],
  ['brasilia', 'DF'],
  ['minas gerais', 'MG'],
  ['belo horizonte', 'MG'],
  ['santa catarina', 'SC'],
  ['florianopolis', 'SC'],
  ['sao paulo', 'SP'],
  ['campinas', 'SP'],
  ['porto alegre', 'RS'],
  ['curitiba', 'PR'],
  ['parana', 'PR'],
  ['pernambuco', 'PE'],
  ['recife', 'PE'],
  ['bahia', 'BA'],
  ['salvador', 'BA'],
  ['ceara', 'CE'],
  ['fortaleza', 'CE'],
  ['goias', 'GO'],
  ['goiania', 'GO'],
  ['amazonas', 'AM'],
  ['manaus', 'AM'],
  ['paraiba', 'PB'],
  ['maranhao', 'MA'],
  ['piaui', 'PI'],
  ['alagoas', 'AL'],
  ['sergipe', 'SE'],
  ['tocantins', 'TO'],
  ['rondonia', 'RO'],
  ['roraima', 'RR'],
  ['amapa', 'AP'],
  ['acre', 'AC'],
]
const IN_PERSON_WORK_MODELS = ['Híbrido', 'Presencial']
const REMOTE_WORK_MODEL = 'Remoto'

function withoutAccents(text) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

export function ufsOf(text) {
  let rest = withoutAccents(text ?? '').toLowerCase()
  const ufs = new Set()
  for (const [place, uf] of UF_BY_PLACE) {
    const pattern = new RegExp(`(^|[^a-z])${place}($|[^a-z])`, 'g')
    if (pattern.test(rest)) {
      ufs.add(uf)
      rest = rest.replace(pattern, '$1 $2')
    }
  }
  for (const match of (text ?? '').matchAll(/(?<![A-Za-z])([A-Z]{2})(?![A-Za-z])/g)) {
    if (UF_CODES.includes(match[1])) ufs.add(match[1])
  }
  return [...ufs].sort()
}

function sectionsOf(body) {
  const valueByHeading = {}
  for (const section of (body ?? '')
    .replace(/\r\n/g, '\n')
    .split(/^###\s+/m)
    .slice(1)) {
    const headingEnd = section.indexOf('\n')
    const heading = (headingEnd === -1 ? section : section.slice(0, headingEnd)).trim()
    const value = headingEnd === -1 ? '' : section.slice(headingEnd + 1).trim()
    valueByHeading[heading] = value === '_No response_' ? '' : value
  }
  return valueByHeading
}

export function facetsOfLabels(labels, taxonomy) {
  const names = labels.map((label) => (typeof label === 'string' ? label : label.name))
  return Object.fromEntries(
    FACETS.map((facet) => [facet, taxonomy[facet].map((entry) => entry.name).filter((name) => names.includes(name))]),
  )
}

export function profileOf(issue, taxonomy) {
  const sections = sectionsOf(issue.body)
  const field = (key) => sections[PROFILE_HEADINGS[key]] ?? ''
  const linkedin = field('linkedin').trim()
  const github = field('github').trim()
  return {
    number: issue.number,
    updatedAt: issue.updated_at,
    name: field('name').trim() || issue.title.trim(),
    ufs: ufsOf(field('location')),
    linkedin: LINKEDIN_PATTERN.test(linkedin) ? linkedin : null,
    github: GITHUB_PATTERN.test(github) ? github : null,
    ...facetsOfLabels(issue.labels, taxonomy),
  }
}

function titlePrefix(title) {
  return /^\s*[[(]([^\])]+)[\])]/.exec(title ?? '')?.[1] ?? ''
}

export function jobOf(issue, form, taxonomy) {
  return {
    number: issue.number,
    ufs: ufsOf([form.fields?.location, titlePrefix(issue.title)].filter(Boolean).join('\n')),
    ...facetsOfLabels(issue.labels, taxonomy),
  }
}

function common(first, second) {
  return first.filter((value) => second.includes(value))
}

export function matchOf(job, profile, minCommonStacks) {
  if (!common(job.levels, profile.levels).length) return null
  if (!common(job.contracts, profile.contracts).length) return null
  const workModels = common(job.workModels, profile.workModels)
  if (!workModels.length) return null
  const needsSameState = !workModels.includes(REMOTE_WORK_MODEL)
  if (needsSameState && !common(job.ufs, profile.ufs).length) return null
  if (!job.stacks.length) return null
  const stacks = common(job.stacks, profile.stacks)
  if (stacks.length < Math.min(minCommonStacks, job.stacks.length)) return null
  return { profile, workModels, stacks }
}

export function rankedMatches(job, profiles, { maxProfiles, minCommonStacks }) {
  return profiles
    .map((profile) => matchOf(job, profile, minCommonStacks))
    .filter(Boolean)
    .sort(
      (first, second) =>
        second.stacks.length - first.stacks.length ||
        second.profile.updatedAt.localeCompare(first.profile.updatedAt) ||
        first.profile.number - second.profile.number,
    )
    .slice(0, maxProfiles)
}

export function isInPerson(workModels) {
  return workModels.some((workModel) => IN_PERSON_WORK_MODELS.includes(workModel))
}

function cellText(text) {
  return text
    .replace(/[\r\n|[\]<>*_`@#\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
}

const TEXT_BY_LANGUAGE = {
  pt: {
    title: 'Perfis compatíveis',
    intro: (profilesUrl) =>
      `Pessoas do [backend-br/me-contrata](${profilesUrl}) que pediram para divulgar o perfil em vagas compatíveis. A compatibilidade considera nível, regime, modelo de trabalho, localização e tecnologias, e esta lista é atualizada automaticamente.`,
    headers: ['Pessoa', 'Nível', 'Regime', 'Modelo', 'Tecnologias em comum', 'Contato'],
  },
  en: {
    title: 'Matching profiles',
    intro: (profilesUrl) =>
      `People from [backend-br/me-contrata](${profilesUrl}) who asked to share their profile on matching jobs. The match considers level, contract, work model, location and technologies, and this list is updated automatically.`,
    headers: ['Person', 'Level', 'Contract', 'Work model', 'Common technologies', 'Contact'],
  },
}

function rowOf({ profile, workModels, stacks }, siteUrl) {
  const contacts = [
    profile.linkedin && `[LinkedIn](${profile.linkedin})`,
    profile.github && `[GitHub](${profile.github})`,
  ].filter(Boolean)
  const place = isInPerson(workModels) && profile.ufs.length ? ` (${profile.ufs.join(', ')})` : ''
  return [
    `[${cellText(profile.name)}](${siteUrl}#perfil-${profile.number})`,
    profile.levels.join(', '),
    profile.contracts.join(', '),
    `${workModels.join(', ')}${place}`,
    stacks.join(', '),
    contacts.join(' · '),
  ]
}

export function buildTalentComment(language, matches, { siteUrl, profilesUrl }) {
  const section = localize(language, (current) => {
    const text = TEXT_BY_LANGUAGE[current]
    return [
      `**${text.title}**`,
      '',
      text.intro(profilesUrl),
      '',
      `| ${text.headers.join(' | ')} |`,
      `| ${text.headers.map(() => '---').join(' | ')} |`,
      ...matches.map((match) => `| ${rowOf(match, siteUrl).join(' | ')} |`),
    ].join('\n')
  })
  return [TALENT_COMMENT_MARKER, section].join('\n\n')
}
