import { useEffect, useMemo, useRef, useState } from 'react'
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum
} from 'd3-force'
import type { TagGraph, TagIndexSnapshot } from '@shared/types/tags'

interface TagConstellationProps {
  isOpen: boolean
  onClose: () => void
  /** Called when the user clicks a file in the selected-tag drawer. */
  onOpenFile: (path: string) => void
}

// Renderable node — extends d3's SimulationNodeDatum so d3-force can
// mutate x/y/vx/vy in place during the simulation.
interface Node extends SimulationNodeDatum {
  id: string
  tag: string
  count: number
  radius: number
}

interface Link extends SimulationLinkDatum<Node> {
  weight: number
  source: string | Node
  target: string | Node
}

const VIEW_W = 1100
const VIEW_H = 720

/**
 * "Tag Constellation" — a force-directed view of tag co-occurrence.
 *
 * Has two modes:
 *  - Overview: every tag in the vault; great for small vaults, but
 *    becomes a hairball once you have a few hundred tags.
 *  - Focus: search or click a tag and the graph filters to just that
 *    tag plus its direct co-occurrence neighbors, re-laid-out cleanly.
 *    This is where surprising relations surface — you can see at a
 *    glance what your focus tag actually touches.
 */
export function TagConstellation({
  isOpen,
  onClose,
  onOpenFile
}: TagConstellationProps) {
  const [graph, setGraph] = useState<TagGraph | null>(null)
  const [index, setIndex] = useState<TagIndexSnapshot | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [hovered, setHovered] = useState<string | null>(null)
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 })
  const svgRef = useRef<SVGSVGElement | null>(null)
  const simRef = useRef<Simulation<Node, Link> | null>(null)
  const [, forceRender] = useState(0)
  const nodesRef = useRef<Node[]>([])
  const linksRef = useRef<Link[]>([])
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  // Load graph + index when opened
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    ;(async () => {
      try {
        const [g, idx] = await Promise.all([
          window.api.invoke<TagGraph>('tags:get-graph'),
          window.api.invoke<TagIndexSnapshot>('tags:get-index')
        ])
        if (cancelled) return
        setGraph(g)
        setIndex(idx)
      } catch (err) {
        console.error('Failed to load tag graph:', err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen])

  // Escape handling: clear search first, close modal second.
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (searchQuery) {
        setSearchQuery('')
      } else {
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose, searchQuery])

  // Focus tag resolution — pick the best match for the current query.
  // Priority: exact (case-insensitive) → startsWith → includes. First
  // hit wins; if nothing matches, focus is null (show full graph).
  const focusTag = useMemo<string | null>(() => {
    if (!graph) return null
    const q = searchQuery.trim().replace(/^#+/, '').toLowerCase()
    if (!q) return null
    let exact: string | null = null
    let starts: string | null = null
    let contains: string | null = null
    for (const n of graph.nodes) {
      const lc = n.tag.toLowerCase()
      if (lc === q && !exact) exact = n.tag
      else if (lc.startsWith(q) && !starts) starts = n.tag
      else if (lc.includes(q) && !contains) contains = n.tag
      if (exact) break
    }
    return exact ?? starts ?? contains
  }, [graph, searchQuery])

  // The subgraph that actually gets laid out + rendered.
  // In focus mode this is `focus + every tag that co-occurs with it`
  // plus every edge between members of that set (so triangles show).
  // In overview mode it's the full graph.
  const visibleGraph = useMemo<TagGraph | null>(() => {
    if (!graph) return null
    if (!focusTag) return graph

    const visible = new Set<string>([focusTag])
    const focusEdges: typeof graph.edges = []
    for (const e of graph.edges) {
      if (e.source === focusTag) {
        visible.add(e.target)
        focusEdges.push(e)
      } else if (e.target === focusTag) {
        visible.add(e.source)
        focusEdges.push(e)
      }
    }

    // Include edges between two visible non-focus tags — these are
    // the "indirect" connections that reveal structure in the
    // neighborhood (e.g. two unrelated-seeming tags that both
    // co-occur with focus AND with each other).
    const indirectEdges = graph.edges.filter(
      (e) =>
        e.source !== focusTag &&
        e.target !== focusTag &&
        visible.has(e.source) &&
        visible.has(e.target)
    )

    return {
      nodes: graph.nodes.filter((n) => visible.has(n.tag)),
      edges: [...focusEdges, ...indirectEdges]
    }
  }, [graph, focusTag])

  // Precompute, for focus mode only, how many notes each neighbor
  // shares with the focus tag. Drives both node size and layout so
  // "bigger + closer = stronger relation" is the unambiguous reading.
  const sharedWithFocus = useMemo(() => {
    const map = new Map<string, number>()
    if (!focusTag || !graph) return map
    for (const e of graph.edges) {
      if (e.source === focusTag) map.set(e.target, e.weight)
      else if (e.target === focusTag) map.set(e.source, e.weight)
    }
    return map
  }, [focusTag, graph])

  // Build / rebuild force simulation whenever the visible subgraph
  // changes. We reset positions each time so filter transitions look
  // intentional — focus node lands at center, neighbors settle around.
  useEffect(() => {
    if (!visibleGraph) return

    const maxShared = focusTag
      ? Math.max(1, ...Array.from(sharedWithFocus.values()))
      : 1

    const nodes: Node[] = visibleGraph.nodes.map((n) => {
      const isFocus = n.tag === focusTag
      // Size rule:
      //  - overview mode: node size reflects vault-wide popularity
      //  - focus mode, focus tag: size by its own count (big anchor)
      //  - focus mode, neighbor: size by SHARED count with the focus
      //    so "big = strongly related to the focus", not "big =
      //    generally popular in the vault".
      let radius: number
      if (!focusTag) {
        radius = 10 + Math.log2(1 + n.count) * 6
      } else if (isFocus) {
        radius = 14 + Math.log2(1 + n.count) * 6
      } else {
        const shared = sharedWithFocus.get(n.tag) ?? 1
        radius = 10 + Math.log2(1 + shared) * 10
      }
      return {
        id: n.tag,
        tag: n.tag,
        count: n.count,
        radius,
        x: isFocus
          ? VIEW_W / 2
          : VIEW_W / 2 + (Math.random() - 0.5) * 300,
        y: isFocus
          ? VIEW_H / 2
          : VIEW_H / 2 + (Math.random() - 0.5) * 300,
        fx: isFocus ? VIEW_W / 2 : undefined,
        fy: isFocus ? VIEW_H / 2 : undefined
      }
    })

    const links: Link[] = visibleGraph.edges.map((e) => ({
      source: e.source,
      target: e.target,
      weight: e.weight
    }))

    nodesRef.current = nodes
    linksRef.current = links

    const sim = forceSimulation<Node>(nodes)
      .force(
        'link',
        forceLink<Node, Link>(links)
          .id((d) => d.id)
          // Distance rule amplified in focus mode: weight 1 edges are
          // much longer than weight 3 edges, so the weakest relations
          // visibly drift outward and can't hide behind strong ones.
          .distance((l) => {
            if (focusTag) {
              const ratio = l.weight / maxShared
              return 260 - ratio * 170 // 90 (strongest) → 260 (weakest)
            }
            return 140 - Math.min(100, l.weight * 7)
          })
          .strength((l) => {
            if (focusTag) {
              const ratio = l.weight / maxShared
              return 0.1 + ratio * 0.5
            }
            return 0.06 + Math.min(0.5, l.weight * 0.05)
          })
      )
      // Stronger repulsion in focus mode so the cluster breathes.
      .force('charge', forceManyBody().strength(focusTag ? -900 : -220))
      .force('center', forceCenter(VIEW_W / 2, VIEW_H / 2).strength(0.04))
      .force(
        'collide',
        forceCollide<Node>()
          .radius((d) => d.radius + (focusTag ? 14 : 6))
          .iterations(3)
      )
      .alpha(1)
      .alphaDecay(0.03)

    sim.on('tick', () => forceRender((v) => v + 1))

    simRef.current?.stop()
    simRef.current = sim

    // Settle small/filtered graphs quickly
    const maxTicks = focusTag ? 120 : 30
    for (let i = 0; i < maxTicks && sim.alpha() > sim.alphaMin(); i += 1) {
      sim.tick()
    }
    // After settling in focus mode, release the focus-pin so it can
    // drift if the user drags a neighbor.
    if (focusTag) {
      const n = nodes.find((x) => x.tag === focusTag)
      if (n) {
        n.fx = null
        n.fy = null
      }
    }
    forceRender((v) => v + 1)

    return () => {
      sim.stop()
    }
  }, [visibleGraph, focusTag])

  // Reset pan/zoom when focus changes so we don't land off-screen.
  useEffect(() => {
    setTransform({ x: 0, y: 0, k: 1 })
  }, [focusTag])

  // Autofocus the search input when the modal opens
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => searchInputRef.current?.focus())
    }
  }, [isOpen])

  // Pan + zoom
  const onWheel = (e: React.WheelEvent<SVGSVGElement>): void => {
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) {
      const k = Math.max(
        0.2,
        Math.min(3, transform.k * (1 - e.deltaY * 0.002))
      )
      setTransform((t) => ({ ...t, k }))
    } else {
      setTransform((t) => ({ ...t, x: t.x - e.deltaX, y: t.y - e.deltaY }))
    }
  }

  // Drag
  const draggingRef = useRef<Node | null>(null)
  const onNodeMouseDown = (e: React.MouseEvent, n: Node): void => {
    e.stopPropagation()
    draggingRef.current = n
    simRef.current?.alphaTarget(0.3).restart()
    n.fx = n.x
    n.fy = n.y
  }

  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>): void => {
    const d = draggingRef.current
    if (!d || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const svgX = ((e.clientX - rect.left) / rect.width) * VIEW_W
    const svgY = ((e.clientY - rect.top) / rect.height) * VIEW_H
    d.fx = (svgX - transform.x) / transform.k
    d.fy = (svgY - transform.y) / transform.k
  }

  const onMouseUp = (): void => {
    const d = draggingRef.current
    if (d) {
      simRef.current?.alphaTarget(0)
      d.fx = null
      d.fy = null
    }
    draggingRef.current = null
  }

  const neighborTags = useMemo(() => {
    const anchor = hovered ?? focusTag
    if (!anchor || !graph) return null
    const set = new Set<string>()
    set.add(anchor)
    for (const e of graph.edges) {
      if (e.source === anchor) set.add(e.target)
      else if (e.target === anchor) set.add(e.source)
    }
    return set
  }, [hovered, focusTag, graph])

  // Side drawer contents: files for the focus tag
  const focusFiles = useMemo(() => {
    if (!focusTag || !index) return []
    return index.filesByTag[focusTag] ?? []
  }, [focusTag, index])

  // For the drawer's "top shared neighbors" summary — rank neighbors
  // of the focus tag by edge weight so the strongest relations rise.
  const topNeighbors = useMemo(() => {
    if (!focusTag || !graph) return []
    const entries: Array<{ tag: string; weight: number }> = []
    for (const e of graph.edges) {
      if (e.source === focusTag) entries.push({ tag: e.target, weight: e.weight })
      else if (e.target === focusTag) entries.push({ tag: e.source, weight: e.weight })
    }
    entries.sort((a, b) => b.weight - a.weight || a.tag.localeCompare(b.tag))
    return entries
  }, [focusTag, graph])

  if (!isOpen) return null

  const totalTags = graph?.nodes.length ?? 0
  const totalConnections = graph?.edges.length ?? 0
  const shownTags = visibleGraph?.nodes.length ?? 0

  return (
    <div className="fixed inset-0 z-50 flex items-stretch">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="relative m-auto w-[95vw] h-[92vh] rounded-xl border border-border overflow-hidden flex shadow-2xl"
        style={{ background: 'var(--color-background)' }}
      >
        {/* Graph canvas */}
        <div className="relative flex-1 min-w-0 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border-subtle bg-[var(--color-background)]">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground whitespace-nowrap">
              Tag Constellation
            </h2>
            <div className="flex items-center gap-2 flex-1 min-w-0 max-w-md bg-muted rounded-md px-2.5 py-1 border border-border-subtle">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-muted-foreground flex-shrink-0"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Focus a tag (e.g. NIP)…"
                className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              {searchQuery && (
                <button
                  className="p-0.5 text-muted-foreground hover:text-foreground"
                  onClick={() => setSearchQuery('')}
                  title="Clear focus"
                  aria-label="Clear focus"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
              {focusTag
                ? `${shownTags} related · of ${totalTags} total`
                : `${totalTags} tags · ${totalConnections} connections`}
            </span>
            <button
              className="ml-auto p-1.5 rounded hover:bg-sidebar-hover text-muted-foreground hover:text-foreground"
              onClick={onClose}
              title="Close (Esc)"
              aria-label="Close"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="flex-1 min-h-0 relative">
            {searchQuery && !focusTag ? (
              <div className="h-full flex items-center justify-center text-center px-10">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    No tag matches "{searchQuery}".
                  </p>
                  <button
                    className="text-xs text-primary hover:underline"
                    onClick={() => setSearchQuery('')}
                  >
                    Clear and show all tags
                  </button>
                </div>
              </div>
            ) : !graph || graph.nodes.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center px-10">
                <p className="text-sm text-muted-foreground max-w-md">
                  No tags yet. Add <code>#tag</code> markers to your notes and
                  they'll appear here, connected by co-occurrence.
                </p>
              </div>
            ) : (
              <svg
                ref={svgRef}
                viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
                className="w-full h-full cursor-grab"
                onWheel={onWheel}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
              >
                <defs>
                  <radialGradient id="nodeGlow">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.9" />
                    <stop offset="70%" stopColor="var(--color-primary)" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
                  </radialGradient>
                </defs>

                <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
                  {/* Edges */}
                  {linksRef.current.map((l, i) => {
                    const s = typeof l.source === 'string' ? null : l.source
                    const t = typeof l.target === 'string' ? null : l.target
                    if (!s || !t) return null
                    const sId = s.id
                    const tId = t.id
                    const hoveredNeighbor = hovered ?? focusTag
                    const dimmed =
                      hoveredNeighbor !== null &&
                      sId !== hoveredNeighbor &&
                      tId !== hoveredNeighbor
                    // In focus mode, surface edge weight as a small
                    // label so weak-but-present connections (the
                    // "relations you didn't know existed") stand out.
                    const showLabel = focusTag !== null && shownTags <= 40 && l.weight >= 1
                    return (
                      <g key={i}>
                        <line
                          x1={s.x ?? 0}
                          y1={s.y ?? 0}
                          x2={t.x ?? 0}
                          y2={t.y ?? 0}
                          stroke="var(--color-foreground)"
                          strokeOpacity={dimmed ? 0.06 : 0.26}
                          strokeWidth={Math.min(5, 0.8 + Math.log2(l.weight + 1) * 1.1)}
                        />
                        {showLabel && !dimmed && (
                          <text
                            x={((s.x ?? 0) + (t.x ?? 0)) / 2}
                            y={((s.y ?? 0) + (t.y ?? 0)) / 2}
                            textAnchor="middle"
                            fill="var(--color-muted-foreground)"
                            fontSize={9}
                            style={{ userSelect: 'none', pointerEvents: 'none' }}
                          >
                            {l.weight}
                          </text>
                        )}
                      </g>
                    )
                  })}

                  {/* Nodes */}
                  {nodesRef.current.map((n) => {
                    const isFocus = n.id === focusTag
                    const isHovered = n.id === hovered
                    const anchor = hovered ?? focusTag
                    const isNeighbor =
                      !isFocus &&
                      !isHovered &&
                      neighborTags?.has(n.id) === true
                    const dimmed =
                      anchor !== null && !isFocus && !isHovered && !isNeighbor
                    return (
                      <g
                        key={n.id}
                        transform={`translate(${n.x ?? 0} ${n.y ?? 0})`}
                        className="cursor-pointer"
                        onMouseEnter={() => setHovered(n.id)}
                        onMouseLeave={() => setHovered(null)}
                        onMouseDown={(e) => onNodeMouseDown(e, n)}
                        onClick={(e) => {
                          e.stopPropagation()
                          // Click always focuses — picks up the tag
                          // in the search box and rebuilds the graph
                          // around this new anchor.
                          setSearchQuery(n.tag)
                        }}
                        style={{ opacity: dimmed ? 0.22 : 1, transition: 'opacity 150ms' }}
                      >
                        {isFocus && (
                          <circle r={n.radius * 2.4} fill="url(#nodeGlow)" pointerEvents="none" />
                        )}
                        <circle
                          r={n.radius}
                          fill={
                            isFocus
                              ? 'var(--color-primary)'
                              : 'color-mix(in srgb, var(--color-primary) 45%, var(--color-background))'
                          }
                          stroke={
                            isFocus
                              ? 'var(--color-primary)'
                              : 'color-mix(in srgb, var(--color-primary) 70%, transparent)'
                          }
                          strokeWidth={isFocus ? 3 : 1.5}
                        />
                        <text
                          y={n.radius + 14}
                          textAnchor="middle"
                          fill="var(--color-foreground)"
                          fontSize={12 + Math.min(3, Math.log2(n.count + 1))}
                          fontWeight={isFocus ? 600 : 500}
                          style={{ userSelect: 'none', pointerEvents: 'none' }}
                        >
                          #{n.tag}
                        </text>
                        <text
                          y={n.radius + 14 + 13}
                          textAnchor="middle"
                          fill="var(--color-muted-foreground)"
                          fontSize={10}
                          style={{ userSelect: 'none', pointerEvents: 'none' }}
                        >
                          {focusTag && !isFocus
                            ? `${sharedWithFocus.get(n.id) ?? 0} · ${n.count}`
                            : n.count}
                        </text>
                      </g>
                    )
                  })}
                </g>
              </svg>
            )}
          </div>

          <div className="px-4 py-1.5 border-t border-border-subtle text-[11px] text-muted-foreground flex items-center justify-between gap-4 bg-[var(--color-background)]">
            <span>
              {focusTag
                ? 'Click any tag to re-focus · Esc clears the filter'
                : 'Type to focus on a tag · scroll to pan · ⌘-scroll to zoom · drag to arrange'}
            </span>
            <span className="whitespace-nowrap">
              {focusTag ? (
                <>
                  Size + proximity ={' '}
                  <span className="text-foreground/80">shared notes with #{focusTag}</span>
                  {' · '}
                  labels show <span className="font-mono">shared · total</span>
                </>
              ) : (
                <>
                  Size = notes per tag · line thickness = shared notes
                </>
              )}
            </span>
          </div>
        </div>

        {/* Side drawer */}
        <aside
          className="w-[320px] border-l border-border flex flex-col"
          style={{ background: 'var(--color-sidebar-alt)' }}
        >
          {focusTag ? (
            <>
              <header className="px-4 py-3 border-b border-border-subtle">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                  Focus tag
                </div>
                <div
                  className="text-lg font-semibold truncate"
                  style={{ color: 'var(--color-primary)' }}
                >
                  #{focusTag}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {focusFiles.length}{' '}
                  {focusFiles.length === 1 ? 'note' : 'notes'} ·{' '}
                  {topNeighbors.length} related{' '}
                  {topNeighbors.length === 1 ? 'tag' : 'tags'}
                </div>
              </header>

              {topNeighbors.length > 0 && (
                <section className="border-b border-border-subtle">
                  <h3 className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wider text-muted-foreground/80 font-medium">
                    Strongest relations
                  </h3>
                  <ul className="pb-2">
                    {topNeighbors.slice(0, 10).map(({ tag, weight }) => (
                      <li key={tag}>
                        <button
                          className="w-full flex items-center justify-between px-4 py-1.5 hover:bg-sidebar-hover transition-colors text-sm"
                          onClick={() => setSearchQuery(tag)}
                          onMouseEnter={() => setHovered(tag)}
                          onMouseLeave={() => setHovered(null)}
                        >
                          <span
                            className="truncate"
                            style={{ color: 'var(--color-primary)' }}
                          >
                            #{tag}
                          </span>
                          <span className="text-xs text-muted-foreground font-mono tabular-nums ml-2">
                            {weight}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="flex-1 min-h-0 flex flex-col">
                <h3 className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wider text-muted-foreground/80 font-medium">
                  Notes with #{focusTag}
                </h3>
                <ul className="flex-1 overflow-y-auto">
                  {focusFiles.length === 0 ? (
                    <li className="px-4 py-4 text-xs text-muted-foreground">
                      No notes declare this tag explicitly.
                    </li>
                  ) : (
                    focusFiles.map((path) => {
                      const name = path.substring(path.lastIndexOf('/') + 1).replace(/\.md$/, '')
                      return (
                        <li key={path}>
                          <button
                            className="w-full text-left px-4 py-2 text-sm text-foreground/90 hover:text-foreground hover:bg-sidebar-hover border-b border-border-subtle/40 truncate"
                            onClick={() => {
                              onOpenFile(path)
                              onClose()
                            }}
                            title={path}
                          >
                            {name}
                          </button>
                        </li>
                      )
                    })
                  )}
                </ul>
              </section>
            </>
          ) : (
            <div className="p-4 text-sm text-muted-foreground space-y-3">
              <p className="font-medium text-foreground">Start exploring</p>
              <p>
                Type a tag in the search box above to focus on its
                neighborhood. You'll see the tag plus every other tag
                it co-occurs with, cleanly laid out — much easier than
                squinting at the full constellation.
              </p>
              <p>
                Click any circle in the graph to re-focus on that tag
                and follow a chain of associations. Relations you
                didn't know existed tend to surface this way.
              </p>
              <p className="text-xs text-muted-foreground/70 pt-2 border-t border-border-subtle">
                Tip: the number next to each node is how many notes
                use that tag. Edge numbers (shown in focus mode) are
                how many notes share both endpoints.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
