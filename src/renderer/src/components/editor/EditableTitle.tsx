import { useState, useCallback, useRef, useEffect } from 'react'

interface EditableTitleProps {
  value: string
  onChange: (newValue: string) => void
}

export function EditableTitle({ value, onChange }: EditableTitleProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync local state when value prop changes
  useEffect(() => {
    setEditValue(value)
  }, [value])

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleDoubleClick = useCallback(() => {
    setIsEditing(true)
    setEditValue(value)
  }, [value])

  const handleBlur = useCallback(() => {
    setIsEditing(false)
    const trimmedValue = editValue.trim()
    if (trimmedValue && trimmedValue !== value) {
      // Sanitize filename: remove invalid characters
      const sanitized = trimmedValue.replace(/[<>:"/\\|?*]/g, '-')
      onChange(sanitized)
    } else {
      setEditValue(value)
    }
  }, [editValue, value, onChange])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        inputRef.current?.blur()
      } else if (e.key === 'Escape') {
        setEditValue(value)
        setIsEditing(false)
      }
    },
    [value]
  )

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="w-full text-3xl font-bold bg-transparent border-none outline-none text-foreground py-4 focus:ring-0"
        placeholder="Untitled"
      />
    )
  }

  return (
    <h1
      className="text-3xl font-bold text-foreground py-4 cursor-text hover:text-foreground/80 transition-colors truncate"
      onDoubleClick={handleDoubleClick}
      title="Double-click to rename"
    >
      {value || 'Untitled'}
    </h1>
  )
}
