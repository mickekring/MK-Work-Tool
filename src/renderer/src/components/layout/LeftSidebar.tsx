import { useState, useCallback } from 'react'
import type { FileNode } from '@shared/types/store'
import { InputModal } from '../modals/InputModal'
import { ConfirmModal } from '../modals/ConfirmModal'
import { ContextMenu, type ContextMenuItem } from '../ui/ContextMenu'

interface LeftSidebarProps {
  width: number
  isVisible: boolean
  vaultName: string | null
  vaultPath: string | null
  fileTree: FileNode[]
  onFileSelect?: (path: string) => void
  onNewFile?: (path: string) => void
  onNewFolder?: (path: string) => void
  onDeleteFile?: (path: string) => Promise<boolean>
  onDeleteFolder?: (path: string) => Promise<boolean>
  onRename?: (oldPath: string, newPath: string) => Promise<boolean>
  onMove?: (oldPath: string, newPath: string) => Promise<boolean>
  onRefresh?: () => void
  selectedFile?: string | null
  expandedFolders?: string[]
  onToggleFolderExpanded?: (folderId: string) => void
  onOpenSettings?: () => void
}

interface ContextMenuState {
  x: number
  y: number
  node: FileNode
}

export function LeftSidebar({
  width,
  isVisible,
  vaultName,
  vaultPath,
  fileTree,
  onFileSelect,
  onNewFile,
  onNewFolder,
  onDeleteFile,
  onDeleteFolder,
  onRename,
  onMove,
  onRefresh,
  selectedFile,
  expandedFolders,
  onToggleFolderExpanded,
  onOpenSettings
}: LeftSidebarProps) {
  const [showFolderModal, setShowFolderModal] = useState(false)
  const [folderModalTarget, setFolderModalTarget] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [renameModal, setRenameModal] = useState<{ node: FileNode; isOpen: boolean } | null>(null)
  const [deleteModal, setDeleteModal] = useState<{ node: FileNode; isOpen: boolean } | null>(null)
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null)

  const handleCreateFolder = (name: string) => {
    if (vaultPath && onNewFolder) {
      // Use the explicit target (from context menu) or the vault root.
      // Don't implicitly fall back to `selectedFolder` — that made the
      // bottom toolbar impossible to use for root-level creation.
      const basePath = folderModalTarget ?? vaultPath
      const folderPath = `${basePath}/${name}`
      onNewFolder(folderPath)
    }
    setShowFolderModal(false)
    setFolderModalTarget(null)
  }

  const handleCreateNote = (targetFolder?: string) => {
    if (vaultPath && onNewFile) {
      const basePath = targetFolder ?? vaultPath
      const timestamp = new Date().toISOString().split('T')[0]
      const filename = `Untitled-${timestamp}-${Date.now().toString(36)}.md`
      const filepath = `${basePath}/${filename}`
      onNewFile(filepath)
    }
  }

  const openNewFolderModal = (targetFolder?: string) => {
    setFolderModalTarget(targetFolder ?? null)
    setShowFolderModal(true)
  }

  const handleContextMenu = useCallback((e: React.MouseEvent, node: FileNode) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, node })
  }, [])

  // Early return goes AFTER all hooks so React's hook-count check
  // (rules of hooks) stays consistent across visibility toggles.
  if (!isVisible) return null

  const handleRename = async (newName: string) => {
    if (!renameModal?.node || !onRename) return

    const oldPath = renameModal.node.path
    const parentPath = oldPath.substring(0, oldPath.lastIndexOf('/'))
    const extension = renameModal.node.type === 'file' ? '.md' : ''
    const newPath = `${parentPath}/${newName}${extension}`

    const success = await onRename(oldPath, newPath)
    if (success) {
      onRefresh?.()
    }
    setRenameModal(null)
  }

  const handleDelete = async () => {
    if (!deleteModal?.node) return

    const isFolder = deleteModal.node.type === 'folder'
    const success = isFolder
      ? await onDeleteFolder?.(deleteModal.node.path)
      : await onDeleteFile?.(deleteModal.node.path)

    if (success) {
      onRefresh?.()
    }
    setDeleteModal(null)
  }

  const handleDrop = async (targetFolder: string, draggedPath: string) => {
    if (!onMove) return

    // Reject drops that would create a cycle: a folder can't be dropped
    // into itself or into one of its own descendants.
    if (
      targetFolder === draggedPath ||
      targetFolder.startsWith(`${draggedPath}/`)
    ) {
      setDragOverFolder(null)
      return
    }

    const fileName = draggedPath.substring(draggedPath.lastIndexOf('/') + 1)
    const newPath = `${targetFolder}/${fileName}`

    if (newPath !== draggedPath) {
      const success = await onMove(draggedPath, newPath)
      if (success) {
        onRefresh?.()
      }
    }
    setDragOverFolder(null)
  }

  const getContextMenuItems = (node: FileNode): ContextMenuItem[] => {
    const items: ContextMenuItem[] = []

    if (node.type === 'folder') {
      items.push(
        {
          label: 'New Note',
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <path d="M12 18v-6M9 15h6" />
            </svg>
          ),
          onClick: () => handleCreateNote(node.path)
        },
        {
          label: 'New Folder',
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              <path d="M12 11v6M9 14h6" />
            </svg>
          ),
          onClick: () => openNewFolderModal(node.path),
          divider: true
        }
      )
    }

    items.push(
      {
        label: 'Rename',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
          </svg>
        ),
        onClick: () => setRenameModal({ node, isOpen: true })
      },
      {
        label: 'Delete',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        ),
        onClick: () => setDeleteModal({ node, isOpen: true }),
        variant: 'destructive',
        divider: true
      }
    )

    return items
  }

  return (
    <>
      <aside
        className="flex flex-col bg-sidebar border-r border-border-subtle overflow-hidden"
        style={{ width }}
      >
        {/* Traffic light spacer + vault header */}
        <div className="pt-[52px] px-4 pb-3 titlebar-drag-region">
          <div className="titlebar-no-drag flex items-center justify-between">
            {vaultName ? (
              <h1 className="text-sm font-semibold text-foreground truncate">{vaultName}</h1>
            ) : (
              <span className="text-sm text-muted-foreground">No vault</span>
            )}
            <button
              className="p-1 rounded hover:bg-sidebar-hover text-muted-foreground hover:text-foreground transition-colors"
              onClick={onOpenSettings}
              title="Settings"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-border-subtle mx-3" />

        {/* File tree area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-2">
          {fileTree.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                {vaultName ? 'No files yet' : 'Select a vault to begin'}
              </p>
            </div>
          ) : (
            <>
              <FileTreeNodes
                nodes={fileTree.filter(
                  (n) => !(n.type === 'folder' && n.name === 'vault_media')
                )}
                depth={0}
                onSelect={onFileSelect}
                selectedFile={selectedFile}
                selectedFolder={selectedFolder}
                onSelectFolder={setSelectedFolder}
                onContextMenu={handleContextMenu}
                dragOverFolder={dragOverFolder}
                onDragOver={setDragOverFolder}
                onDrop={handleDrop}
                expandedFolders={expandedFolders}
                onToggleFolderExpanded={onToggleFolderExpanded}
              />
              {fileTree.some(
                (n) => n.type === 'folder' && n.name === 'vault_media'
              ) && (
                <>
                  <div className="h-px bg-border-subtle mx-3 my-2" />
                  <div className="px-4 pt-1 pb-1 text-xs uppercase tracking-wider text-muted-foreground/70 font-medium">
                    Media Vault
                  </div>
                  <FileTreeNodes
                    nodes={fileTree.filter(
                      (n) => n.type === 'folder' && n.name === 'vault_media'
                    )}
                    depth={0}
                    onSelect={onFileSelect}
                    selectedFile={selectedFile}
                    selectedFolder={selectedFolder}
                    onSelectFolder={setSelectedFolder}
                    onContextMenu={handleContextMenu}
                    dragOverFolder={dragOverFolder}
                    onDragOver={setDragOverFolder}
                    onDrop={handleDrop}
                    expandedFolders={expandedFolders}
                    onToggleFolderExpanded={onToggleFolderExpanded}
                  />
                </>
              )}
            </>
          )}
        </div>

        {/* Bottom actions */}
        <div className="p-2 border-t border-border-subtle flex gap-2">
          <button
            className="btn-ghost flex-1 flex items-center gap-1.5 justify-center text-xs titlebar-no-drag"
            disabled={!vaultPath}
            onClick={() => openNewFolderModal()}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              <path d="M12 11v6M9 14h6" />
            </svg>
            <span>Folder</span>
          </button>
          <button
            className="btn-ghost flex-1 flex items-center gap-1.5 justify-center text-xs titlebar-no-drag"
            disabled={!vaultPath}
            onClick={() => handleCreateNote()}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <path d="M12 18v-6M9 15h6" />
            </svg>
            <span>Note</span>
          </button>
        </div>
      </aside>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems(contextMenu.node)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Folder Creation Modal */}
      <InputModal
        isOpen={showFolderModal}
        title="New Folder"
        placeholder="Folder name"
        onConfirm={handleCreateFolder}
        onCancel={() => {
          setShowFolderModal(false)
          setFolderModalTarget(null)
        }}
      />

      {/* Rename Modal */}
      <InputModal
        isOpen={renameModal?.isOpen ?? false}
        title={`Rename ${renameModal?.node.type === 'folder' ? 'Folder' : 'File'}`}
        placeholder="New name"
        defaultValue={renameModal?.node.name.replace(/\.md$/, '') ?? ''}
        onConfirm={handleRename}
        onCancel={() => setRenameModal(null)}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteModal?.isOpen ?? false}
        title={`Delete ${deleteModal?.node.type === 'folder' ? 'Folder' : 'File'}`}
        message={`Are you sure you want to delete "${deleteModal?.node.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={handleDelete}
        onCancel={() => setDeleteModal(null)}
      />

    </>
  )
}

interface FileTreeNodesProps {
  nodes: FileNode[]
  depth: number
  onSelect?: (path: string) => void
  selectedFile?: string | null
  selectedFolder?: string | null
  onSelectFolder?: (path: string | null) => void
  onContextMenu?: (e: React.MouseEvent, node: FileNode) => void
  dragOverFolder?: string | null
  onDragOver?: (path: string | null) => void
  onDrop?: (targetFolder: string, draggedPath: string) => void
  expandedFolders?: string[]
  onToggleFolderExpanded?: (folderId: string) => void
}

function FileTreeNodes({
  nodes,
  depth,
  onSelect,
  selectedFile,
  selectedFolder,
  onSelectFolder,
  onContextMenu,
  dragOverFolder,
  onDragOver,
  onDrop,
  expandedFolders,
  onToggleFolderExpanded
}: FileTreeNodesProps) {
  return (
    <div className="sidebar-content">
      {nodes.map((node) => (
        <FileTreeItem
          key={node.id}
          node={node}
          depth={depth}
          onSelect={onSelect}
          selectedFile={selectedFile}
          selectedFolder={selectedFolder}
          onSelectFolder={onSelectFolder}
          onContextMenu={onContextMenu}
          dragOverFolder={dragOverFolder}
          onDragOver={onDragOver}
          onDrop={onDrop}
          expandedFolders={expandedFolders}
          onToggleFolderExpanded={onToggleFolderExpanded}
        />
      ))}
    </div>
  )
}

interface FileTreeItemProps {
  node: FileNode
  depth: number
  onSelect?: (path: string) => void
  selectedFile?: string | null
  selectedFolder?: string | null
  onSelectFolder?: (path: string | null) => void
  onContextMenu?: (e: React.MouseEvent, node: FileNode) => void
  dragOverFolder?: string | null
  onDragOver?: (path: string | null) => void
  onDrop?: (targetFolder: string, draggedPath: string) => void
  expandedFolders?: string[]
  onToggleFolderExpanded?: (folderId: string) => void
}

function FileTreeItem({
  node,
  depth,
  onSelect,
  selectedFile,
  selectedFolder,
  onSelectFolder,
  onContextMenu,
  dragOverFolder,
  onDragOver,
  onDrop,
  expandedFolders,
  onToggleFolderExpanded
}: FileTreeItemProps) {
  const isFolder = node.type === 'folder'
  const isExpanded = expandedFolders?.includes(node.id) ?? false
  const isActive = selectedFile === node.path
  const isFolderSelected = selectedFolder === node.path
  const isDragOver = dragOverFolder === node.path
  const paddingLeft = 12 + depth * 16

  // vault_media is a system folder: not renameable, deletable, draggable,
  // or right-clickable. We also show it with a friendlier display name.
  const isSystemFolder = isFolder && node.id === 'vault_media'
  const displayName = isSystemFolder
    ? 'Media Vault'
    : node.name.replace(/\.md$/, '')

  const handleClick = () => {
    if (isFolder) {
      onToggleFolderExpanded?.(node.id)
      onSelectFolder?.(node.path)
    } else {
      // When selecting a file, set its parent folder as selected
      const parentPath = node.path.substring(0, node.path.lastIndexOf('/'))
      onSelectFolder?.(parentPath)
      onSelect?.(node.path)
    }
  }

  const handleDragStart = (e: React.DragEvent) => {
    if (isSystemFolder) {
      e.preventDefault()
      return
    }
    e.stopPropagation()
    e.dataTransfer.setData('text/plain', node.path)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    if (!isFolder) return
    // Skip drags coming from the OS (file uploads handled by the editor)
    const types = Array.from(e.dataTransfer.types)
    if (types.includes('Files') && !types.includes('text/plain')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    onDragOver?.(node.path)
  }

  const handleDragLeave = () => {
    onDragOver?.(null)
  }

  const handleDropEvent = (e: React.DragEvent) => {
    if (!isFolder) return
    const draggedPath = e.dataTransfer.getData('text/plain')
    if (!draggedPath) return
    e.preventDefault()
    e.stopPropagation()
    if (draggedPath !== node.path) {
      onDrop?.(node.path, draggedPath)
    }
    onDragOver?.(null)
  }

  return (
    <>
      <button
        className={`file-tree-item w-full text-left flex items-center gap-2 py-1.5 pr-3 text-sm titlebar-no-drag ${
          isActive ? 'active' : ''
        } ${isFolderSelected && isFolder ? 'bg-muted/50' : ''} ${
          isDragOver ? 'bg-accent/20 border border-accent' : ''
        }`}
        style={{ paddingLeft }}
        onClick={handleClick}
        onContextMenu={(e) => {
          if (isSystemFolder) {
            e.preventDefault()
            return
          }
          onContextMenu?.(e, node)
        }}
        draggable={!isSystemFolder}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDropEvent}
      >
        {isFolder ? (
          <>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`text-muted-foreground flex-shrink-0 transition-transform ${
                isExpanded ? 'rotate-90' : ''
              }`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            {isExpanded ? (
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="flex-shrink-0 folder-icon"
              >
                <path d="M2 5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v1H2V5z" />
                <path
                  opacity="0.7"
                  d="M2 9h19.5a1.5 1.5 0 0 1 1.46 1.84l-1.84 8A1.5 1.5 0 0 1 19.66 20H4a2 2 0 0 1-2-2V9z"
                />
              </svg>
            ) : (
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="flex-shrink-0 folder-icon"
              >
                <path d="M4 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-9l-2-3H4z" />
              </svg>
            )}
          </>
        ) : (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-foreground/80 flex-shrink-0 ml-5"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        )}
        <span
          className={`truncate ${
            isFolder
              ? 'font-medium text-foreground'
              : isActive
                ? 'text-foreground'
                : 'text-foreground/90'
          }`}
        >
          {displayName}
        </span>
      </button>

      {isFolder && isExpanded && node.children && (
        <FileTreeNodes
          nodes={node.children}
          depth={depth + 1}
          onSelect={onSelect}
          selectedFile={selectedFile}
          selectedFolder={selectedFolder}
          onSelectFolder={onSelectFolder}
          onContextMenu={onContextMenu}
          dragOverFolder={dragOverFolder}
          onDragOver={onDragOver}
          onDrop={onDrop}
          expandedFolders={expandedFolders}
          onToggleFolderExpanded={onToggleFolderExpanded}
        />
      )}
    </>
  )
}
