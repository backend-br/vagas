// Deterministic checks and the final verdict. Pure functions, no I/O.

// Hard reasons close the issue; soft reasons only send it to human review.
export const HARD = new Set(['form', 'multiple', 'ai_training', 'rate_limit'])

const URL = /https?:\/\/([a-z0-9.-]+)[^\s)\]>"']*/gi
const KEYCAP = /[0-9]️?⃣/g
const EMOJI = /\p{Extended_Pictographic}/gu
const HASHTAG = /(?<![\w&])#[\p{L}][\p{L}\d_]{2,}/gu

// Lowercase without accents, so terms match "anotação" and "anotacao" alike.
function normalize(text) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

function hosts(text) {
  return [...text.matchAll(URL)].map((match) => match[1].toLowerCase())
}

// Job digests link many openings of the same site; a single job rarely needs more than a few links there.
function maxLinksPerSite(text) {
  const perSite = {}
  const urls = new Set([...text.matchAll(URL)].map((match) => match[0].replace(/^https?:\/\/(www\.)?/i, '').toLowerCase()))
  for (const url of urls) {
    const host = url.split(/[/?#]/)[0]
    perSite[host] = (perSite[host] ?? 0) + 1
  }
  return Math.max(0, ...Object.values(perSite))
}

function matchesDomain(host, domain) {
  return host === domain || host.endsWith(`.${domain}`)
}

function includesTerm(text, terms) {
  return terms.some((term) => new RegExp(`(^|[^a-z0-9])${normalize(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(text))
}

// Checkbox lines are the form's own confirmations ("not an AI training gig") and must not trigger the term checks.
const CHECKBOX = /^\s*- \[[ xX]\] .*$/gm

export function contentReasons(title, body, config) {
  const raw = `${title}\n${(body ?? '').replace(CHECKBOX, '')}`
  const text = normalize(raw)
  const found = hosts(raw)
  const reasons = []

  if (found.some((host) => config.blockedDomains.some((domain) => matchesDomain(host, domain)))) reasons.push('ai_training')
  if (includesTerm(text, config.terms.aiTraining)) reasons.push('ai_training')
  if ((raw.match(KEYCAP) ?? []).length >= 3 || maxLinksPerSite(raw) > config.maxLinksPerSite) reasons.push('multiple')

  if (found.some((host) => config.reviewDomains.some((domain) => matchesDomain(host, domain)))) reasons.push('suspicious_contact')
  if (includesTerm(text, config.terms.crypto)) reasons.push('crypto')
  const normalizedTitle = normalize(title)
  if (includesTerm(normalizedTitle, config.terms.unrelatedTitle) && !includesTerm(normalizedTitle, config.terms.backendTitle)) reasons.push('not_backend')
  if ((raw.match(EMOJI) ?? []).length >= config.lowEffort.emojis || (raw.match(HASHTAG) ?? []).length >= config.lowEffort.hashtags) reasons.push('low_effort')

  return reasons
}

export function verdict(reasons) {
  const unique = [...new Set(reasons)]
  if (unique.some((reason) => HARD.has(reason))) return { verdict: 'reject', reasons: unique.filter((reason) => HARD.has(reason)) }
  if (unique.length) return { verdict: 'review', reasons: unique }
  return { verdict: 'verified', reasons: [] }
}
