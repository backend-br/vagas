export const REJECTION_REASONS = new Set(['form', 'multiple', 'ai_training', 'rate_limit'])

const URL_PATTERN = /https?:\/\/([a-z0-9.-]+)[^\s)\]>"']*/gi
const NUMBERED_EMOJI_PATTERN = /[0-9]️?⃣/g
const EMOJI_PATTERN = /\p{Extended_Pictographic}/gu
const HASHTAG_PATTERN = /(?<![\w&])#[\p{L}][\p{L}\d_]{2,}/gu
const FORM_CONFIRMATION_LINE_PATTERN = /^\s*- \[[ xX]\] .*$/gm
const MIN_NUMBERED_EMOJIS_IN_JOB_LIST = 3

function toLowercaseWithoutAccents(text) {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

function linkedHosts(text) {
  return [...text.matchAll(URL_PATTERN)].map((match) => match[1].toLowerCase())
}

function highestLinkCountOnSameSite(text) {
  const linkCountBySite = {}
  const distinctUrls = new Set(
    [...text.matchAll(URL_PATTERN)].map((match) => match[0].replace(/^https?:\/\/(www\.)?/i, '').toLowerCase()),
  )
  for (const url of distinctUrls) {
    const site = url.split(/[/?#]/)[0]
    linkCountBySite[site] = (linkCountBySite[site] ?? 0) + 1
  }
  return Math.max(0, ...Object.values(linkCountBySite))
}

function isHostOfDomain(host, domain) {
  return host === domain || host.endsWith(`.${domain}`)
}

function linksToAnyDomain(hosts, domains) {
  return hosts.some((host) => domains.some((domain) => isHostOfDomain(host, domain)))
}

function containsAnyTerm(normalizedText, terms) {
  return terms.some((term) => {
    const escapedTerm = toLowercaseWithoutAccents(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(^|[^a-z0-9])${escapedTerm}($|[^a-z0-9])`).test(normalizedText)
  })
}

function countMatches(text, pattern) {
  return (text.match(pattern) ?? []).length
}

export function contentReasons(title, body, config) {
  const textWithoutFormConfirmations = `${title}\n${(body ?? '').replace(FORM_CONFIRMATION_LINE_PATTERN, '')}`
  const normalizedText = toLowercaseWithoutAccents(textWithoutFormConfirmations)
  const normalizedTitle = toLowercaseWithoutAccents(title)
  const hosts = linkedHosts(textWithoutFormConfirmations)
  const reasons = []

  if (linksToAnyDomain(hosts, config.blockedDomains)) reasons.push('ai_training')
  if (containsAnyTerm(normalizedText, config.terms.aiTraining)) reasons.push('ai_training')
  const looksLikeJobList =
    countMatches(textWithoutFormConfirmations, NUMBERED_EMOJI_PATTERN) >= MIN_NUMBERED_EMOJIS_IN_JOB_LIST ||
    highestLinkCountOnSameSite(textWithoutFormConfirmations) > config.maxLinksPerSite
  if (looksLikeJobList) reasons.push('multiple')

  if (linksToAnyDomain(hosts, config.reviewDomains)) reasons.push('suspicious_contact')
  if (containsAnyTerm(normalizedText, config.terms.crypto)) reasons.push('crypto')
  if (
    containsAnyTerm(normalizedTitle, config.terms.unrelatedTitle) &&
    !containsAnyTerm(normalizedTitle, config.terms.backendTitle)
  )
    reasons.push('not_backend')
  const hasTooManyEmojis = countMatches(textWithoutFormConfirmations, EMOJI_PATTERN) >= config.lowEffort.emojis
  const hasTooManyHashtags = countMatches(textWithoutFormConfirmations, HASHTAG_PATTERN) >= config.lowEffort.hashtags
  if (hasTooManyEmojis || hasTooManyHashtags) reasons.push('low_effort')

  return reasons
}

export function decideVerdict(reasons) {
  const distinctReasons = [...new Set(reasons)]
  const rejectionReasons = distinctReasons.filter((reason) => REJECTION_REASONS.has(reason))
  if (rejectionReasons.length) return { verdict: 'reject', reasons: rejectionReasons }
  if (distinctReasons.length) return { verdict: 'review', reasons: distinctReasons }
  return { verdict: 'verified', reasons: [] }
}
