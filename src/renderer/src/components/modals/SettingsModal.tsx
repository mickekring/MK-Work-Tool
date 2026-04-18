import { useState, useEffect } from 'react'
import { useStore, useStoreActions, useFileOperations } from '@/hooks/useStore'
import { fontSizeLabels, type FontSize } from '@shared/types/store'

type SettingsSection = 'general' | 'appearance'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

// Preset accent colors
const ACCENT_COLORS = [
  { name: 'Lavender', value: '#7c8cff' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Pink', value: '#ec4899' }
]

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { settings } = useStore()
  const { setTheme, setFontSize, setAccentColor, setVaultPath } = useStoreActions()
  const { selectVault, openVault, initVault } = useFileOperations()
  const [activeSection, setActiveSection] = useState<SettingsSection>('general')

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleChangeVault = async () => {
    const path = await selectVault()
    if (path) {
      await initVault(path)
      await openVault(path)
    }
  }

  const menuItems: { id: SettingsSection; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'appearance', label: 'Appearance' }
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-background rounded-lg shadow-2xl w-[800px] h-[600px] max-w-[90vw] max-h-[85vh] flex overflow-hidden border border-border">
        {/* Left sidebar - Options menu */}
        <div className="w-[200px] bg-sidebar border-r border-border-subtle flex flex-col">
          <div className="px-4 py-3 border-b border-border-subtle">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Options
            </h2>
          </div>
          <nav className="flex-1 py-2">
            {menuItems.map((item) => (
              <button
                key={item.id}
                className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                  activeSection === item.id
                    ? 'bg-accent text-primary-foreground'
                    : 'text-foreground hover:bg-sidebar-hover'
                }`}
                onClick={() => setActiveSection(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Right content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
            <h1 className="text-lg font-semibold text-foreground">
              {activeSection === 'general' ? 'General' : 'Appearance'}
            </h1>
            <button
              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              onClick={onClose}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {activeSection === 'general' && (
              <GeneralSettings
                vaultPath={settings.vaultPath}
                onChangeVault={handleChangeVault}
              />
            )}
            {activeSection === 'appearance' && (
              <AppearanceSettings
                theme={settings.theme}
                accentColor={settings.accentColor}
                fontSize={settings.fontSize}
                onThemeChange={setTheme}
                onAccentColorChange={setAccentColor}
                onFontSizeChange={setFontSize}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

interface GeneralSettingsProps {
  vaultPath: string | null
  onChangeVault: () => void
}

function GeneralSettings({ vaultPath, onChangeVault }: GeneralSettingsProps) {
  return (
    <div className="space-y-6">
      {/* Vault section */}
      <section>
        <h3 className="text-sm font-medium text-foreground mb-4">Vault</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0 mr-4">
              <p className="text-sm text-foreground mb-1">Current vault</p>
              <p className="text-xs text-muted-foreground truncate" title={vaultPath ?? undefined}>
                {vaultPath || 'No vault selected'}
              </p>
            </div>
            <button
              className="px-3 py-1.5 text-sm bg-muted hover:bg-muted/80 text-foreground rounded transition-colors flex-shrink-0"
              onClick={onChangeVault}
            >
              Change vault
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

const FONT_SIZES: FontSize[] = ['xs', 'sm', 'md', 'lg', 'xl']

interface AppearanceSettingsProps {
  theme: 'dark' | 'light'
  accentColor: string
  fontSize: FontSize
  onThemeChange: (theme: 'dark' | 'light') => void
  onAccentColorChange: (color: string) => void
  onFontSizeChange: (size: FontSize) => void
}

function AppearanceSettings({
  theme,
  accentColor,
  fontSize,
  onThemeChange,
  onAccentColorChange,
  onFontSizeChange
}: AppearanceSettingsProps) {
  return (
    <div className="space-y-6">
      {/* Base color scheme */}
      <section>
        <h3 className="text-sm font-medium text-foreground mb-3">Base color scheme</h3>
        <div className="flex gap-2">
          <button
            className={`px-4 py-2 text-sm rounded transition-colors ${
              theme === 'dark'
                ? 'bg-accent text-primary-foreground'
                : 'bg-muted text-foreground hover:bg-muted/80'
            }`}
            onClick={() => onThemeChange('dark')}
          >
            Dark
          </button>
          <button
            className={`px-4 py-2 text-sm rounded transition-colors ${
              theme === 'light'
                ? 'bg-accent text-primary-foreground'
                : 'bg-muted text-foreground hover:bg-muted/80'
            }`}
            onClick={() => onThemeChange('light')}
          >
            Light
          </button>
        </div>
      </section>

      {/* Accent color */}
      <section>
        <h3 className="text-sm font-medium text-foreground mb-3">Accent color</h3>
        <div className="flex flex-wrap gap-2">
          {ACCENT_COLORS.map((color) => (
            <button
              key={color.value}
              className={`w-8 h-8 rounded-full transition-all ${
                accentColor === color.value
                  ? 'ring-2 ring-offset-2 ring-offset-background ring-foreground scale-110'
                  : 'hover:scale-105'
              }`}
              style={{ backgroundColor: color.value }}
              onClick={() => onAccentColorChange(color.value)}
              title={color.name}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Current: {ACCENT_COLORS.find((c) => c.value === accentColor)?.name || accentColor}
        </p>
      </section>

      {/* Font size */}
      <section>
        <h3 className="text-sm font-medium text-foreground mb-3">Font size</h3>
        <div className="flex flex-wrap gap-2">
          {FONT_SIZES.map((size) => (
            <button
              key={size}
              className={`px-3 py-1.5 text-sm rounded transition-colors ${
                fontSize === size
                  ? 'bg-accent text-primary-foreground'
                  : 'bg-muted text-foreground hover:bg-muted/80'
              }`}
              onClick={() => onFontSizeChange(size)}
            >
              {fontSizeLabels[size]}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Applies to all text in the app and documents
        </p>
      </section>
    </div>
  )
}
