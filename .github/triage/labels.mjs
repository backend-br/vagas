import { repositoryLabelsFromForm } from './form.mjs'
import { stacksInText, taxonomyLabelNames } from './taxonomy.mjs'

function isForm(form) {
  return form.language !== null
}

export function taxonomyLabelsOf(issue, form, taxonomy) {
  if (isForm(form)) return repositoryLabelsFromForm(form.fields, taxonomy, issue.title)
  return stacksInText(taxonomy, `${issue.title}\n${issue.body ?? ''}`)
}

function managedLabelNames(form, taxonomy) {
  if (isForm(form)) return taxonomyLabelNames(taxonomy)
  return new Set(taxonomy.stacks.map((stack) => stack.name))
}

export function labelChanges({ issue, form, taxonomy, statusLabels, verdictLabel, isRejected }) {
  const current = issue.labels.map((label) => label.name)
  const wanted = isRejected ? [] : taxonomyLabelsOf(issue, form, taxonomy)
  const managed = managedLabelNames(form, taxonomy)
  const remove = current.filter(
    (name) => (statusLabels.includes(name) && name !== verdictLabel) || (managed.has(name) && !wanted.includes(name)),
  )
  const add = [verdictLabel, ...wanted].filter((name) => !current.includes(name))
  return { remove, add }
}
