/**
 * Card renderer (PRD FR-2) — a reconciler, not a generator (PRD C-10, FR-12).
 *
 * Children are located by their `role` plugin data, never by index or name, so
 * user edits on the canvas survive. Which side wins per field is defined by the
 * matrix in FR-12 and implemented via `RenderSource`:
 *
 * - `create` / `theme` → styling and layout are (re)applied
 * - `plugin`           → text may be overwritten, styling is left alone
 * - `sync`             → canvas text is the truth for the label; protected
 *                        fields are reset
 */
import { formatNumber } from '../shared/format/properties'
import { CARD_METRICS, CARD_THEMES, CATEGORY_HEX, hexToRgb, type CardTheme } from '../shared/tokens'
import type { Figtation, FigtationCategory, ProbedProperty, Settings } from '../shared/types'
import { fonts, ensureLoaded } from './fonts'
import { KEYS, get, markChild, roleOf, set, type ChildRole } from './store'

export type RenderSource = 'create' | 'plugin' | 'sync' | 'theme'

export interface RenderInput {
  figtation: Figtation
  category: FigtationCategory | null
  /** Live values, already in display order. */
  properties: ProbedProperty[]
  settings: Settings
  /** Target is gone → dashed warning stroke plus badge (PRD FR-7). */
  detached: boolean
  source: RenderSource
}

export interface RenderReport {
  /** Property rows the user deleted and the renderer had to restore. */
  restoredRows: number
  /** Label text taken from the canvas (reverse sync, PRD FR-12). */
  labelFromCanvas: string | null
  /** A protected text field had been edited on the canvas and was reset. */
  resetProtected: boolean
}

function solid(hex: string, opacity = 1): SolidPaint {
  return { type: 'SOLID', color: hexToRgb(hex), opacity }
}

function themeOf(settings: Settings): CardTheme {
  return CARD_THEMES[settings.theme]
}

function childrenWithRole(frame: FrameNode, role: ChildRole): SceneNode[] {
  return frame.children.filter((child) => roleOf(child) === role)
}

function childWithRole(frame: FrameNode, role: ChildRole): SceneNode | null {
  return childrenWithRole(frame, role)[0] ?? null
}

function removeRole(frame: FrameNode, role: ChildRole): void {
  for (const child of childrenWithRole(frame, role)) child.remove()
}

/** Nodes the user added themselves — they carry no role and are never touched. */
function userChildren(frame: FrameNode): SceneNode[] {
  return frame.children.filter((child) => roleOf(child) === '')
}

function setMinHeight(frame: FrameNode, value: number): void {
  // minHeight is not present in every API version.
  const record = frame as unknown as Record<string, unknown>
  if ('minHeight' in record) record['minHeight'] = value
}

async function textNode(
  characters: string,
  font: FontName,
  size: number,
  lineHeight: number,
  color: string
): Promise<TextNode> {
  await figma.loadFontAsync(font)
  const node = figma.createText()
  node.fontName = font
  node.fontSize = size
  node.lineHeight = { unit: 'PIXELS', value: lineHeight }
  node.characters = characters
  node.fills = [solid(color)]
  return node
}

/** Writes text only when it differs; returns true when it actually changed. */
async function setCharacters(node: TextNode, characters: string): Promise<boolean> {
  if (node.characters === characters) return false
  await ensureLoaded(node.fontName)
  node.characters = characters
  return true
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

async function renderHeader(card: FrameNode, input: RenderInput): Promise<boolean> {
  const needsHeader = input.category !== null || input.detached
  if (!needsHeader) {
    removeRole(card, 'header')
    return false
  }

  const theme = themeOf(input.settings)
  const font = await fonts()
  let header = childWithRole(card, 'header') as FrameNode | null
  if (!header || header.type !== 'FRAME') {
    removeRole(card, 'header')
    header = figma.createFrame()
    markChild(header, 'header')
    header.name = 'header'
    header.fills = []
    header.layoutMode = 'HORIZONTAL'
    header.primaryAxisSizingMode = 'AUTO'
    header.counterAxisSizingMode = 'AUTO'
    header.itemSpacing = CARD_METRICS.headerGap
    header.counterAxisAlignItems = 'CENTER'
    card.appendChild(header)
  }

  // Category pill
  if (input.category) {
    let pill = childWithRole(header, 'pill') as FrameNode | null
    if (!pill || pill.type !== 'FRAME') {
      removeRole(header, 'pill')
      pill = figma.createFrame()
      markChild(pill, 'pill')
      pill.name = 'category-pill'
      pill.layoutMode = 'HORIZONTAL'
      pill.primaryAxisSizingMode = 'AUTO'
      pill.counterAxisSizingMode = 'AUTO'
      pill.cornerRadius = CARD_METRICS.pillCornerRadius
      pill.paddingTop = CARD_METRICS.pillPaddingVertical
      pill.paddingBottom = CARD_METRICS.pillPaddingVertical
      pill.paddingLeft = CARD_METRICS.pillPaddingHorizontal
      pill.paddingRight = CARD_METRICS.pillPaddingHorizontal
      header.appendChild(pill)
    }
    // Colour is derived from the register — plugin always wins (FR-12).
    pill.fills = [solid(CATEGORY_HEX[input.category.color])]

    let pillText = childWithRole(pill, 'pill-text') as TextNode | null
    if (!pillText || pillText.type !== 'TEXT') {
      removeRole(pill, 'pill-text')
      pillText = await textNode(
        input.category.label,
        font.semibold,
        CARD_METRICS.pillFontSize,
        CARD_METRICS.pillLineHeight,
        theme.pillText
      )
      markChild(pillText, 'pill-text')
      pillText.name = 'category-label'
      pill.appendChild(pillText)
    } else {
      const changed = await setCharacters(pillText, input.category.label)
      if (changed && input.source === 'sync') return true
    }
  } else {
    removeRole(header, 'pill')
  }

  // Detached badge
  if (input.detached) {
    let badge = childWithRole(header, 'badge') as TextNode | null
    if (!badge || badge.type !== 'TEXT') {
      removeRole(header, 'badge')
      badge = await textNode(
        '⚠ Detached',
        font.medium,
        CARD_METRICS.pillFontSize,
        CARD_METRICS.pillLineHeight,
        theme.detachedStroke
      )
      markChild(badge, 'badge')
      badge.name = 'detached-badge'
      header.appendChild(badge)
    }
  } else {
    removeRole(header, 'badge')
  }

  return false
}

async function renderLabel(
  card: FrameNode,
  input: RenderInput
): Promise<{ labelFromCanvas: string | null; present: boolean }> {
  const existing = childWithRole(card, 'label') as TextNode | null

  if (input.source === 'sync') {
    // Canvas wins for free text (PRD FR-12).
    if (existing && existing.type === 'TEXT') {
      const canvasText = existing.characters
      if (canvasText === '') {
        existing.remove()
        return { labelFromCanvas: '', present: false }
      }
      if (canvasText !== input.figtation.label) {
        return { labelFromCanvas: canvasText, present: true }
      }
      return { labelFromCanvas: null, present: true }
    }
    // Deleting the whole text node counts as clearing the label, not as damage
    // to be repaired (PRD FR-12, "Label vollständig gelöscht (Node oder Inhalt)").
    if (input.figtation.label !== '') {
      return { labelFromCanvas: '', present: false }
    }
  }

  if (input.figtation.label === '') {
    removeRole(card, 'label')
    return { labelFromCanvas: null, present: false }
  }

  const theme = themeOf(input.settings)
  const font = await fonts()
  let label = existing
  if (!label || label.type !== 'TEXT') {
    removeRole(card, 'label')
    label = await textNode(
      input.figtation.label,
      font.regular,
      CARD_METRICS.labelFontSize,
      CARD_METRICS.labelLineHeight,
      theme.labelText
    )
    markChild(label, 'label')
    label.name = 'label'
    label.textAutoResize = 'HEIGHT'
    card.appendChild(label)
    label.layoutSizingHorizontal = 'FILL'
  } else {
    await setCharacters(label, input.figtation.label)
  }
  return { labelFromCanvas: null, present: true }
}

/**
 * Turns a value into a clickable jump to another node, the equivalent of Figma's
 * own "Go to main component" (DECISIONS.md D-026). A NODE hyperlink is the only
 * way to make canvas content clickable — a plugin cannot attach handlers to a
 * node. Underlined, because a link nobody can see is not a link.
 */
async function applyLink(text: TextNode, nodeId: string | undefined): Promise<void> {
  const current = text.hyperlink
  if (nodeId === undefined) {
    if (current !== null) {
      await ensureLoaded(text.fontName)
      text.hyperlink = null
    }
    if (text.textDecoration !== 'NONE') {
      await ensureLoaded(text.fontName)
      text.textDecoration = 'NONE'
    }
    return
  }
  const target: HyperlinkTarget = { type: 'NODE', value: nodeId }
  const same =
    current !== null &&
    current !== figma.mixed &&
    current.type === target.type &&
    current.value === target.value
  if (!same) {
    await ensureLoaded(text.fontName)
    text.hyperlink = target
  }
  if (text.textDecoration !== 'UNDERLINE') {
    await ensureLoaded(text.fontName)
    text.textDecoration = 'UNDERLINE'
  }
}

async function renderValue(
  row: FrameNode,
  probed: ProbedProperty,
  input: RenderInput
): Promise<boolean> {
  const theme = themeOf(input.settings)
  const font = await fonts()
  let value = childWithRole(row, 'value') as FrameNode | null
  if (!value || value.type !== 'FRAME') {
    removeRole(row, 'value')
    value = figma.createFrame()
    markChild(value, 'value')
    value.name = 'value'
    value.fills = []
    value.layoutMode = 'HORIZONTAL'
    value.primaryAxisSizingMode = 'AUTO'
    value.counterAxisSizingMode = 'AUTO'
    value.counterAxisAlignItems = 'CENTER'
    value.itemSpacing = CARD_METRICS.valueGap
    row.appendChild(value)
  }

  // Swatch (fills / strokes only)
  if (probed.swatch) {
    let swatch = childWithRole(value, 'swatch') as RectangleNode | null
    if (!swatch || swatch.type !== 'RECTANGLE') {
      removeRole(value, 'swatch')
      swatch = figma.createRectangle()
      markChild(swatch, 'swatch')
      swatch.name = 'swatch'
      swatch.resize(CARD_METRICS.swatchSize, CARD_METRICS.swatchSize)
      swatch.cornerRadius = CARD_METRICS.swatchCornerRadius
      swatch.strokeWeight = 1
      value.insertChild(0, swatch)
    }
    swatch.fills = [solid(probed.swatch)]
    swatch.strokes = [solid(theme.swatchStroke, theme.swatchStrokeOpacity)]
  } else {
    removeRole(value, 'swatch')
  }

  const wantsChip = probed.variable !== undefined
  let chip = childWithRole(value, 'token-chip') as FrameNode | null
  if (wantsChip && (!chip || chip.type !== 'FRAME')) {
    removeRole(value, 'token-chip')
    chip = figma.createFrame()
    markChild(chip, 'token-chip')
    chip.name = 'token-chip'
    chip.layoutMode = 'HORIZONTAL'
    chip.primaryAxisSizingMode = 'AUTO'
    chip.counterAxisSizingMode = 'AUTO'
    chip.cornerRadius = CARD_METRICS.tokenChipCornerRadius
    chip.paddingTop = CARD_METRICS.tokenChipPaddingVertical
    chip.paddingBottom = CARD_METRICS.tokenChipPaddingVertical
    chip.paddingLeft = CARD_METRICS.tokenChipPaddingHorizontal
    chip.paddingRight = CARD_METRICS.tokenChipPaddingHorizontal
    chip.fills = [solid(theme.tokenChipFill, theme.tokenChipFillOpacity)]
    value.appendChild(chip)
  }
  if (!wantsChip) {
    // Move the text out of the chip before dropping it.
    const inChip = chip ? (childWithRole(chip, 'row-value') as TextNode | null) : null
    if (inChip) value.appendChild(inChip)
    removeRole(value, 'token-chip')
    chip = null
  }

  const container = chip ?? value
  let text = (childWithRole(container, 'row-value') ??
    childWithRole(value, 'row-value')) as TextNode | null
  if (!text || text.type !== 'TEXT') {
    text = await textNode(
      probed.value,
      font.regular,
      CARD_METRICS.rowFontSize,
      CARD_METRICS.labelLineHeight,
      wantsChip ? theme.tokenChipText : theme.propertyValueText
    )
    markChild(text, 'row-value')
    text.name = 'value-text'
    text.textAlignHorizontal = 'RIGHT'
    container.appendChild(text)
    await applyLink(text, probed.link)
    return false
  }

  if (text.parent !== container) container.appendChild(text)
  text.fills = [solid(wantsChip ? theme.tokenChipText : theme.propertyValueText)]
  await applyLink(text, probed.link)
  const changed = await setCharacters(text, probed.value)
  return changed && input.source === 'sync'
}

async function renderProperties(
  card: FrameNode,
  input: RenderInput
): Promise<{ present: boolean; restoredRows: number; resetProtected: boolean }> {
  const visible = input.settings.showPropertyValues ? input.properties : []
  if (visible.length === 0) {
    removeRole(card, 'properties')
    return { present: false, restoredRows: 0, resetProtected: false }
  }

  const theme = themeOf(input.settings)
  const font = await fonts()
  let container = childWithRole(card, 'properties') as FrameNode | null
  if (!container || container.type !== 'FRAME') {
    removeRole(card, 'properties')
    container = figma.createFrame()
    markChild(container, 'properties')
    container.name = 'properties'
    container.fills = []
    container.layoutMode = 'VERTICAL'
    container.primaryAxisSizingMode = 'AUTO'
    container.counterAxisSizingMode = 'FIXED'
    container.itemSpacing = CARD_METRICS.rowGap
    card.appendChild(container)
    container.layoutSizingHorizontal = 'FILL'
  }

  const existingRows = new Map<string, FrameNode>()
  for (const child of childrenWithRole(container, 'row')) {
    if (child.type !== 'FRAME') {
      child.remove()
      continue
    }
    const prop = get(child, KEYS.prop)
    if (prop === '' || existingRows.has(prop)) {
      child.remove()
      continue
    }
    existingRows.set(prop, child)
  }

  let restoredRows = 0
  let resetProtected = false
  const ordered: FrameNode[] = []

  for (const probed of visible) {
    let row = existingRows.get(probed.type) ?? null
    existingRows.delete(probed.type)
    if (!row) {
      row = figma.createFrame()
      markChild(row, 'row', probed.type)
      row.name = probed.type
      row.fills = []
      row.layoutMode = 'HORIZONTAL'
      row.primaryAxisSizingMode = 'FIXED'
      row.counterAxisSizingMode = 'AUTO'
      row.primaryAxisAlignItems = 'SPACE_BETWEEN'
      row.counterAxisAlignItems = 'CENTER'
      row.itemSpacing = CARD_METRICS.rowInnerGap
      setMinHeight(row, CARD_METRICS.rowMinHeight)
      container.appendChild(row)
      row.layoutSizingHorizontal = 'FILL'
      // A row the user deleted by hand is restored, never silently (FR-12 #4).
      if (input.source === 'sync') restoredRows += 1
    }

    let key = childWithRole(row, 'row-key') as TextNode | null
    if (!key || key.type !== 'TEXT') {
      removeRole(row, 'row-key')
      key = await textNode(
        probed.key,
        font.regular,
        CARD_METRICS.rowFontSize,
        CARD_METRICS.labelLineHeight,
        theme.propertyKeyText
      )
      markChild(key, 'row-key')
      key.name = 'key'
      row.insertChild(0, key)
    } else {
      const changed = await setCharacters(key, probed.key)
      if (changed && input.source === 'sync') resetProtected = true
      key.fills = [solid(theme.propertyKeyText)]
    }

    if (await renderValue(row, probed, input)) resetProtected = true
    ordered.push(row)
  }

  // Rows for properties that are no longer selected.
  for (const row of existingRows.values()) row.remove()

  ordered.forEach((row, index) => {
    if (container.children[index] !== row) container.insertChild(index, row)
  })

  return { present: true, restoredRows, resetProtected }
}

function renderDivider(card: FrameNode, input: RenderInput, needed: boolean): void {
  if (!needed) {
    removeRole(card, 'divider')
    return
  }
  const theme = themeOf(input.settings)
  let divider = childWithRole(card, 'divider') as FrameNode | null
  if (!divider || divider.type !== 'FRAME') {
    removeRole(card, 'divider')
    divider = figma.createFrame()
    markChild(divider, 'divider')
    divider.name = 'divider'
    divider.layoutMode = 'HORIZONTAL'
    divider.primaryAxisSizingMode = 'FIXED'
    divider.counterAxisSizingMode = 'FIXED'
    card.appendChild(divider)
    divider.resize(divider.width, 1)
    divider.layoutSizingHorizontal = 'FILL'
    divider.layoutSizingVertical = 'FIXED'
  }
  divider.fills = [solid(theme.dividerColor)]
}

// ---------------------------------------------------------------------------
// Card shell
// ---------------------------------------------------------------------------

function applyShellStyling(card: FrameNode, input: RenderInput): void {
  const theme = themeOf(input.settings)
  card.fills = [solid(theme.cardFill)]
  card.cornerRadius = CARD_METRICS.cornerRadius
  card.strokes = [solid(theme.cardStroke)]
  card.strokeWeight = theme.cardStrokeWeight
  card.strokeAlign = 'INSIDE'
  card.effects = [
    {
      type: 'DROP_SHADOW',
      color: { ...theme.shadowColor, a: theme.shadowOpacity },
      offset: { x: 0, y: theme.shadowOffsetY },
      radius: theme.shadowBlur,
      spread: 0,
      visible: true,
      blendMode: 'NORMAL',
    },
  ]
  card.paddingTop = CARD_METRICS.padding
  card.paddingBottom = CARD_METRICS.padding
  card.paddingLeft = CARD_METRICS.padding
  card.paddingRight = CARD_METRICS.padding
  card.itemSpacing = CARD_METRICS.gap
}

function applyDetachedStroke(card: FrameNode, input: RenderInput): void {
  const theme = themeOf(input.settings)
  if (input.detached) {
    card.strokes = [solid(theme.detachedStroke)]
    card.strokeWeight = 1
    card.dashPattern = [4, 4]
  } else if (card.dashPattern.length > 0) {
    card.dashPattern = []
    card.strokes = [solid(theme.cardStroke)]
    card.strokeWeight = theme.cardStrokeWeight
  }
}

/**
 * Figma paints the layer name above every top-level frame, so the card's name is
 * visible on the canvas and in exports. `showCardLayerName: false` therefore
 * needs a name that renders as nothing.
 *
 * Figma does not keep an empty string — it falls back to a default — so a
 * zero-width space is used instead. It is the shortest name that draws no glyph.
 */
const BLANK_NAME = '\u200B'

const NAME_PREFIX = 'Figtation'

function cardName(input: RenderInput): string {
  if (!input.settings.showCardLayerName) return BLANK_NAME
  const label = input.figtation.label.trim().split('\n')[0] ?? ''
  const suffix = label !== '' ? label : (input.category?.label ?? 'Annotation')
  return `${NAME_PREFIX} — ${suffix.slice(0, 40)}`
}

/** True while the name is still one the plugin wrote itself. */
function isPluginName(name: string): boolean {
  return name === BLANK_NAME || name === NAME_PREFIX || name.startsWith(`${NAME_PREFIX} — `)
}

/** Creates the empty card shell. Content is filled in by `renderCard`. */
export function createCardShell(settings: Settings): FrameNode {
  const card = figma.createFrame()
  card.name = 'Figtation'
  // Size first, auto layout second: resizing an auto-layout frame forces both
  // sizing modes to FIXED and would cost the card its hug height.
  card.resize(settings.cardWidth, 1)
  card.layoutMode = 'VERTICAL'
  card.primaryAxisSizingMode = 'AUTO'
  card.counterAxisSizingMode = 'FIXED'
  card.clipsContent = false
  card.locked = false
  card.expanded = false
  return card
}

/**
 * Idempotent render. Creates missing pieces, updates changed ones, and never
 * rebuilds the card from scratch — the node ids stay stable across renders.
 */
export async function renderCard(card: FrameNode, input: RenderInput): Promise<RenderReport> {
  const report: RenderReport = { restoredRows: 0, labelFromCanvas: null, resetProtected: false }

  const width = input.figtation.widthOverride ?? input.settings.cardWidth
  if (Math.abs(card.width - width) > 0.5) card.resize(width, card.height)
  // Height is always hug — a manual vertical resize is reverted (FR-12).
  if (card.layoutMode !== 'VERTICAL') card.layoutMode = 'VERTICAL'
  if (card.primaryAxisSizingMode !== 'AUTO') card.primaryAxisSizingMode = 'AUTO'
  if (card.counterAxisSizingMode !== 'FIXED') card.counterAxisSizingMode = 'FIXED'

  if (input.source === 'create' || input.source === 'theme') applyShellStyling(card, input)
  applyDetachedStroke(card, input)

  if (await renderHeader(card, input)) report.resetProtected = true
  const label = await renderLabel(card, input)
  report.labelFromCanvas = label.labelFromCanvas
  const properties = await renderProperties(card, input)
  report.restoredRows = properties.restoredRows
  if (properties.resetProtected) report.resetProtected = true
  renderDivider(card, input, label.present && properties.present)

  // Canonical order: header, label, divider, properties, then user additions.
  const managed: SceneNode[] = []
  const header = childWithRole(card, 'header')
  if (header) managed.push(header)
  const labelNode = childWithRole(card, 'label')
  if (labelNode) managed.push(labelNode)
  const divider = childWithRole(card, 'divider')
  if (divider) managed.push(divider)
  const props = childWithRole(card, 'properties')
  if (props) managed.push(props)
  const ordered = [...managed, ...userChildren(card)]
  ordered.forEach((child, index) => {
    if (card.children[index] !== child) card.insertChild(index, child)
  })

  // The layer name is visible on the canvas, so renaming a card by hand is a
  // legitimate edit and a background sync must not undo it. A name the plugin
  // wrote itself is still ours to update — otherwise cards created before a
  // settings change would keep the old name forever.
  if (input.source !== 'sync' || isPluginName(card.name)) card.name = cardName(input)
  set(card, KEYS.rev, formatNumber(input.figtation.rev + 1))
  // The relaunch button is a convenience, not part of the card. It needs a
  // manifest id, which an unpublished plugin may not have — so a failure here
  // must never abort the render and with it the caller's positioning logic.
  try {
    card.setRelaunchData({ edit: 'Edit this annotation' })
  } catch {
    // No relaunch button on this card; everything else is intact.
  }

  return report
}
