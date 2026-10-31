import { parseForm } from './form.mjs'
import { fieldOfHeading } from './format.mjs'
import { localize } from './language.mjs'

export const LINK_COMMENT_MARKER = '<!-- link-check -->'

const URL_PATTERN = /https?:\/\/[^\s<>"'`)\]]+/gi
const TRAILING_PUNCTUATION_PATTERN = /[.,;:!?*_]+$/
const HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->/g
const SINCE_PATTERN = /<!-- link-check-since: (\d{4}-\d{2}-\d{2}) -->/
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

function isHostOfDomain(host, domain) {
  return host === domain || host.endsWith(`.${domain}`)
}

export function linksOf(text, skipDomains = []) {
  const urls = [...(text ?? '').replace(HTML_COMMENT_PATTERN, '').matchAll(URL_PATTERN)].map((match) =>
    match[0].replace(TRAILING_PUNCTUATION_PATTERN, ''),
  )
  return [...new Set(urls)].filter((url) => {
    const host = hostOf(url)
    return host && !skipDomains.some((domain) => isHostOfDomain(host, domain))
  })
}

// Only answers that say the page is gone count as broken. Blocks, rate limits, timeouts and server errors say
// nothing about the job, so they are unknown and never act on an issue.
export function classifyAnswer(answer, brokenStatuses) {
  if (typeof answer === 'number' && brokenStatuses.includes(answer)) return 'broken'
  if (typeof answer === 'number' && answer < 400) return 'ok'
  return 'unknown'
}

// The links someone applies through: those of the "how to apply" field, or every link of the post when it has none.
export function applyLinksOf(body, skipDomains = []) {
  const form = parseForm(body)
  if (form.language !== null) return linksOf(form.fields.apply, skipDomains)
  const applySections = []
  let isInApplySection = false
  for (const line of (body ?? '').replace(/\r\n/g, '\n').split('\n')) {
    const heading = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)?.[1]?.replace(/[*_`]/g, '')
    if (heading) isInApplySection = fieldOfHeading(heading)?.field === 'apply'
    else if (isInApplySection) applySections.push(line)
  }
  const applyLinks = linksOf(applySections.join('\n'), skipDomains)
  return applyLinks.length ? applyLinks : linksOf(body, skipDomains)
}

export function sinceOf(commentBody) {
  return SINCE_PATTERN.exec(commentBody ?? '')?.[1] ?? null
}

// Decides what to do with an issue from the state of its links. An issue is only closed when every link to apply
// has been gone for the whole grace period, so a site that is down for a day never closes a job.
export function decideLinkAction({ brokenLinks, applyLinks, since, today, closeAfterDays }) {
  if (!brokenLinks.length) return { action: since ? 'recovered' : 'none', since: null }
  const firstSeen = since ?? today
  const hasNoWorkingApplyLink = applyLinks.length > 0 && applyLinks.every((link) => brokenLinks.includes(link))
  const daysBroken = Math.floor((new Date(today).getTime() - new Date(firstSeen).getTime()) / MILLISECONDS_PER_DAY)
  if (hasNoWorkingApplyLink && daysBroken >= closeAfterDays) return { action: 'close', since: firstSeen }
  return { action: 'warn', since: firstSeen }
}

const TEXT_BY_LANGUAGE = {
  pt: {
    warn: 'Alguns links desta vaga não existem mais (a página respondeu que foi removida):',
    fix: (days) =>
      `Edite a issue com o link atualizado. Se a vaga foi encerrada, feche a issue. Se nenhum link para se candidatar voltar a funcionar em ${days} dias, a issue será fechada automaticamente.`,
    closed:
      'Esta vaga foi fechada porque os links para se candidatar não existem mais. Se ela continua aberta, edite a issue com o link novo e comente aqui.',
  },
  en: {
    warn: 'Some links of this job post no longer exist (the page answered that it was removed):',
    fix: (days) =>
      `Edit the issue with the updated link. If the job was filled, close the issue. If no link to apply works again within ${days} days, the issue will be closed automatically.`,
    closed:
      'This job post was closed because its links to apply no longer exist. If the job is still open, edit the issue with the new link and comment here.',
  },
}

export function buildLinkComment({ action, since }, brokenLinks, language, closeAfterDays) {
  const section = localize(language, (current) => {
    const text = TEXT_BY_LANGUAGE[current]
    if (action === 'close') return text.closed
    return [text.warn, '', ...brokenLinks.map((link) => `- ${link}`), '', text.fix(closeAfterDays)].join('\n')
  })
  return [LINK_COMMENT_MARKER, `<!-- link-check-since: ${since} -->`, section].join('\n\n')
}
