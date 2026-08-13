/** Settings and the native bridge (PRD FR-9, FR-10). */
import { useState } from 'react'
import { SETTINGS_RANGES, type NativeScanResult, type Settings } from '../../shared/types'
import { strings } from '../strings'
import { Button, Modal, Segmented, Slider, Toggle } from './primitives'

interface Props {
  settings: Settings
  readOnly: boolean
  cardCount: number
  onChange: (patch: Partial<Settings>) => void
  onScanNative: (scope: 'page' | 'file') => Promise<NativeScanResult>
  onImportNative: (scope: 'page' | 'file', deleteSource: boolean) => void
  onExportNative: (scope: 'page' | 'file') => void
  onClose: () => void
}

export function SettingsPanel(props: Props): JSX.Element {
  const { settings, readOnly } = props
  const [scope, setScope] = useState<'page' | 'file'>('page')
  const [deleteSource, setDeleteSource] = useState(false)
  const [scan, setScan] = useState<NativeScanResult | null>(null)
  const [confirm, setConfirm] = useState<null | { message: string; action: () => void }>(null)

  const guardedChange = (patch: Partial<Settings>, heavy: boolean): void => {
    if (heavy && props.cardCount > 50) {
      setConfirm({
        message: strings.settings.rerenderWarning(props.cardCount),
        action: () => props.onChange(patch),
      })
      return
    }
    props.onChange(patch)
  }

  if (confirm) {
    return (
      <Modal
        title={strings.settings.title}
        onClose={() => setConfirm(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              {strings.confirm.cancel}
            </Button>
            <Button
              variant="strong"
              onClick={() => {
                confirm.action()
                setConfirm(null)
              }}
            >
              {strings.confirm.confirm}
            </Button>
          </>
        }
      >
        <p>{confirm.message}</p>
      </Modal>
    )
  }

  return (
    <Modal
      title={strings.settings.title}
      onClose={props.onClose}
      footer={
        <Button variant="strong" onClick={props.onClose}>
          {strings.categories.done}
        </Button>
      }
    >
      <div className="stack">
        <label className="field">
          <span className="field__label">{strings.settings.cardWidth}</span>
          <Slider
            label={strings.settings.cardWidth}
            min={SETTINGS_RANGES.cardWidth.min}
            max={SETTINGS_RANGES.cardWidth.max}
            value={settings.cardWidth}
            disabled={readOnly}
            onChange={(cardWidth) => guardedChange({ cardWidth }, true)}
          />
        </label>

        <label className="field">
          <span className="field__label">{strings.settings.theme}</span>
          <Segmented
            ariaLabel={strings.settings.theme}
            value={settings.theme}
            disabled={readOnly}
            options={[
              { value: 'dark', label: strings.settings.dark },
              { value: 'light', label: strings.settings.light },
            ]}
            onChange={(theme) => guardedChange({ theme }, true)}
          />
        </label>

        <label className="field">
          <span className="field__label">{strings.settings.connectorStyle}</span>
          <Segmented
            ariaLabel={strings.settings.connectorStyle}
            value={settings.connectorStyle}
            disabled={readOnly}
            options={[
              { value: 'straight', label: strings.editor.straight },
              { value: 'elbow', label: strings.editor.elbow },
            ]}
            onChange={(connectorStyle) => props.onChange({ connectorStyle })}
          />
        </label>

        <label className="field">
          <span className="field__label">{strings.settings.cornerRadius}</span>
          <Slider
            label={strings.settings.cornerRadius}
            min={SETTINGS_RANGES.connectorCornerRadius.min}
            max={SETTINGS_RANGES.connectorCornerRadius.max}
            value={settings.connectorCornerRadius}
            disabled={readOnly}
            onChange={(connectorCornerRadius) => props.onChange({ connectorCornerRadius })}
          />
        </label>

        <Toggle
          label={strings.settings.connectorDashed}
          checked={settings.connectorDashed}
          disabled={readOnly}
          onChange={(connectorDashed) => props.onChange({ connectorDashed })}
        />
        <Toggle
          label={strings.settings.showEndpointDot}
          checked={settings.showEndpointDot}
          disabled={readOnly}
          onChange={(showEndpointDot) => props.onChange({ showEndpointDot })}
        />
        <Toggle
          label={strings.settings.snapWaypoints}
          checked={settings.snapWaypoints}
          disabled={readOnly}
          onChange={(snapWaypoints) => props.onChange({ snapWaypoints })}
        />
        <Toggle
          label={strings.settings.showPropertyValues}
          checked={settings.showPropertyValues}
          disabled={readOnly}
          onChange={(showPropertyValues) => guardedChange({ showPropertyValues }, true)}
        />
        <Toggle
          label={strings.settings.showCardLayerName}
          checked={settings.showCardLayerName}
          disabled={readOnly}
          onChange={(showCardLayerName) => guardedChange({ showCardLayerName }, true)}
        />
        <Toggle
          label={strings.settings.autoRefreshOnOpen}
          checked={settings.autoRefreshOnOpen}
          disabled={readOnly}
          onChange={(autoRefreshOnOpen) => props.onChange({ autoRefreshOnOpen })}
        />

        <label className="field">
          <span className="field__label">{strings.settings.arrangeGutter}</span>
          <Slider
            label={strings.settings.arrangeGutter}
            min={SETTINGS_RANGES.arrangeGutter.min}
            max={SETTINGS_RANGES.arrangeGutter.max}
            step={4}
            value={settings.arrangeGutter}
            disabled={readOnly}
            onChange={(arrangeGutter) => props.onChange({ arrangeGutter })}
          />
        </label>

        <label className="field">
          <span className="field__label">{strings.settings.arrangeSide}</span>
          <Segmented
            ariaLabel={strings.settings.arrangeSide}
            value={settings.arrangeSide}
            disabled={readOnly}
            options={[
              { value: 'left', label: strings.settings.left },
              { value: 'right', label: strings.settings.right },
            ]}
            onChange={(arrangeSide) => props.onChange({ arrangeSide })}
          />
        </label>

        <hr className="rule" />

        <div className="field">
          <span className="field__label">{strings.settings.nativeBridge}</span>
          <Segmented
            ariaLabel="Scope"
            value={scope}
            options={[
              { value: 'page', label: strings.settings.scopePage },
              { value: 'file', label: strings.settings.scopeFile },
            ]}
            onChange={(next) => {
              setScope(next)
              setScan(null)
            }}
          />
          <Toggle
            label={strings.settings.deleteSourceAfterImport}
            checked={deleteSource}
            disabled={readOnly}
            onChange={setDeleteSource}
          />
          {scan && (
            <p className="notice">
              Found {scan.annotationCount} native annotations on {scan.layerCount} layers
              {scope === 'file' ? ` across ${scan.pageCount} pages` : ''}.
            </p>
          )}
          <div className="row">
            <Button
              disabled={readOnly}
              onClick={() => {
                if (!scan) {
                  void props.onScanNative(scope).then(setScan)
                  return
                }
                props.onImportNative(scope, deleteSource)
                setScan(null)
              }}
            >
              {scan ? strings.confirm.confirm : strings.settings.importNative}
            </Button>
            <Button
              disabled={readOnly}
              onClick={() =>
                setConfirm({
                  message:
                    'This overwrites existing native annotations on the affected layers. Continue?',
                  action: () => props.onExportNative(scope),
                })
              }
            >
              {strings.settings.exportNative}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
