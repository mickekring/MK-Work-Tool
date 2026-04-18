import { useCallback, useEffect, useState, useRef } from 'react'

interface ResizeHandleProps {
  side: 'left' | 'right'
  onResize: (width: number) => void
  minWidth?: number
  maxWidth?: number
  currentWidth: number
}

export function ResizeHandle({
  side,
  onResize,
  minWidth = 200,
  maxWidth = 400,
  currentWidth
}: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setIsDragging(true)
      startXRef.current = e.clientX
      startWidthRef.current = currentWidth
    },
    [currentWidth]
  )

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const delta = side === 'left'
        ? e.clientX - startXRef.current
        : startXRef.current - e.clientX

      const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidthRef.current + delta))
      onResize(newWidth)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, side, minWidth, maxWidth, onResize])

  return (
    <div
      className={`resize-handle ${isDragging ? 'dragging' : ''}`}
      onMouseDown={handleMouseDown}
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={currentWidth}
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
    />
  )
}
