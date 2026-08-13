/**
 * Native bridge (PRD FR-9). Figtations uses the same property-type enum as
 * Figma (PRD C-5), so the round trip is lossless for labels, properties and
 * categories.
 */
import {
  isPropertyType,
  type FigtationDraft,
  type NativeScanResult,
  type PropertyType,
} from '../shared/types'
import { upsertByLabelAndColor, byId, nativeIdFor } from './categories'
import { refreshIndex } from './registry'
import { readFigtation } from './store'
import { createFigtations, withWriteGuard } from './sync'

/** Node types that can carry native annotations (PRD C-5). */
const ANNOTATABLE = new Set<string>([
  'FRAME',
  'COMPONENT',
  'COMPONENT_SET',
  'INSTANCE',
  'TEXT',
  'RECTANGLE',
  'ELLIPSE',
  'LINE',
  'POLYGON',
  'STAR',
  'VECTOR',
])

interface AnnotatedNode {
  node: SceneNode & { annotations: readonly Annotation[] }
  page: PageNode
}

async function pagesFor(scope: 'page' | 'file'): Promise<PageNode[]> {
  if (scope === 'page') return [figma.currentPage]
  await figma.loadAllPagesAsync()
  return [...figma.root.children]
}

function annotationsOf(node: SceneNode): readonly Annotation[] {
  const record = node as unknown as { annotations?: readonly Annotation[] }
  return record.annotations ?? []
}

async function collect(scope: 'page' | 'file'): Promise<AnnotatedNode[]> {
  const result: AnnotatedNode[] = []
  for (const page of await pagesFor(scope)) {
    for (const node of page.findAll((candidate) => ANNOTATABLE.has(candidate.type))) {
      if (annotationsOf(node).length === 0) continue
      result.push({ node: node as AnnotatedNode['node'], page })
    }
  }
  return result
}

/** Strips markdown to plain text — markdown rendering is a non-goal (PRD §12). */
export function stripMarkdown(input: string): string {
  return input
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/`{1,3}([^`]*)`{1,3}/g, '$1')
    .replace(/~~(.*?)~~/g, '$1')
    .trim()
}

export async function scanNative(scope: 'page' | 'file'): Promise<NativeScanResult> {
  const collected = await collect(scope)
  const annotationCount = collected.reduce(
    (total, entry) => total + annotationsOf(entry.node).length,
    0
  )
  const pages = new Set(collected.map((entry) => entry.page.id))
  return { annotationCount, layerCount: collected.length, pageCount: pages.size }
}

export interface ImportResult {
  imported: number
  skipped: number
}

export async function importNative(
  scope: 'page' | 'file',
  deleteSource: boolean
): Promise<ImportResult> {
  const collected = await collect(scope)
  const nativeCategories = await figma.annotations.getAnnotationCategoriesAsync().catch(() => [])
  const nativeById = new Map(nativeCategories.map((category) => [category.id, category]))

  let imported = 0
  let skipped = 0

  for (const entry of collected) {
    // Figtations lives on the current page; cross-page import switches pages.
    if (entry.page.id !== figma.currentPage.id) {
      await figma.setCurrentPageAsync(entry.page)
    }
    for (const annotation of annotationsOf(entry.node)) {
      const label = annotation.label ?? stripMarkdown(annotation.labelMarkdown ?? '')
      const props: PropertyType[] = (annotation.properties ?? [])
        .map((property) => property.type as string)
        .filter(isPropertyType)
      if (label === '' && props.length === 0) {
        skipped += 1
        continue
      }
      let categoryId = ''
      if (annotation.categoryId) {
        const native = nativeById.get(annotation.categoryId)
        if (native) {
          const own = upsertByLabelAndColor(native.label, native.color)
          categoryId = own.id
        }
      }
      const draft: FigtationDraft = { categoryId, label, props }
      const ids = await createFigtations([entry.node.id], draft)
      imported += ids.length
    }
    if (deleteSource) {
      await withWriteGuard(async () => {
        entry.node.annotations = []
      })
    }
  }

  return { imported, skipped }
}

export interface ExportResult {
  exported: number
  skipped: number
}

export async function exportNative(scope: 'page' | 'file'): Promise<ExportResult> {
  const pages = await pagesFor(scope)
  let exported = 0
  let skipped = 0

  for (const page of pages) {
    const index = refreshIndex(page)
    // `annotations` is set as a whole, so all Figtations of one node are
    // collected first (PRD FR-9, "Merge ist nicht möglich").
    const byTarget = new Map<string, Annotation[]>()

    for (const card of index.cards) {
      const figtation = readFigtation(card)
      if (!figtation) continue
      if (figtation.targetId === '') {
        skipped += 1
        continue
      }
      const target = await figma.getNodeByIdAsync(figtation.targetId).catch(() => null)
      if (!target || target.removed || !ANNOTATABLE.has(target.type)) {
        skipped += 1
        continue
      }
      const category = byId(figtation.categoryId)
      const annotation: Annotation = {
        properties: figtation.props.map((type) => ({ type: type as AnnotationPropertyType })),
      }
      if (figtation.label !== '') {
        Object.assign(annotation, { label: figtation.label })
      }
      if (category) {
        const nativeId = await nativeIdFor(category)
        if (nativeId) Object.assign(annotation, { categoryId: nativeId })
      }
      const list = byTarget.get(target.id)
      if (list) list.push(annotation)
      else byTarget.set(target.id, [annotation])
    }

    await withWriteGuard(async () => {
      for (const [targetId, annotations] of byTarget) {
        const target = await figma.getNodeByIdAsync(targetId).catch(() => null)
        if (!target || target.removed) continue
        const record = target as unknown as { annotations: readonly Annotation[] }
        record.annotations = annotations
        exported += annotations.length
      }
    })
  }

  return { exported, skipped }
}

/** How many layers would be overwritten by an export — for the warning dialog. */
export async function exportImpact(scope: 'page' | 'file'): Promise<number> {
  const pages = await pagesFor(scope)
  let layers = 0
  for (const page of pages) {
    const index = refreshIndex(page)
    const targets = new Set<string>()
    for (const card of index.cards) {
      const figtation = readFigtation(card)
      if (!figtation || figtation.targetId === '') continue
      targets.add(figtation.targetId)
    }
    layers += targets.size
  }
  return layers
}
