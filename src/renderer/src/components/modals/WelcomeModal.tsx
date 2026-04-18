import { useState } from 'react'

interface WelcomeModalProps {
  isOpen: boolean
  onSelectVault: () => Promise<string | null>
  onVaultSelected: (path: string) => Promise<void>
}

export function WelcomeModal({ isOpen, onSelectVault, onVaultSelected }: WelcomeModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSelectVault = async () => {
    setError(null)
    setIsLoading(true)

    try {
      const path = await onSelectVault()
      if (path) {
        await onVaultSelected(path)
      }
    } catch (err) {
      setError('Failed to open vault. Please try again.')
      console.error('Vault selection error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative bg-sidebar border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-fade-in">
        {/* Header decoration */}
        <div className="h-1 bg-gradient-to-r from-primary via-accent to-primary" />

        <div className="p-8">
          {/* Logo/Icon */}
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-muted flex items-center justify-center">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-primary"
            >
              <path d="M12 19l7-7 3 3-7 7-3-3z" />
              <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
              <path d="M2 2l7.586 7.586" />
              <circle cx="11" cy="11" r="2" />
            </svg>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-semibold text-center mb-2">
            Welcome to Rune
          </h1>

          <p className="text-muted-foreground text-center mb-8">
            Your personal workspace for notes, projects, and ideas.
            Select a folder to use as your vault.
          </p>

          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive text-center">
              {error}
            </div>
          )}

          {/* Action button */}
          <button
            onClick={handleSelectVault}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-accent-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <svg
                  className="animate-spin h-4 w-4"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span>Opening vault...</span>
              </>
            ) : (
              <>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <span>Select Vault Folder</span>
              </>
            )}
          </button>

          {/* Help text */}
          <p className="mt-6 text-xs text-muted-foreground text-center">
            A vault is a folder on your computer where all your notes are stored as plain markdown files.
          </p>
        </div>
      </div>
    </div>
  )
}
