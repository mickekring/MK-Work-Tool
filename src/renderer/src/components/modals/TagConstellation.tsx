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
 * Each node is a tag, sized by how many notes declare it. Two tags
 * are connected when at least one note declares both; edge thickness
 * reflects how many notes are shared.
 *
 * Designed to answer "what themes in my vault connect to what?" — a
 * question a per-file graph hairball can't.
 */
export function TagConstellation({
  isOpen,
  onClose,
  onOpenFile
}: TagConstellationProps) {
  const [graph, setGraph] = useState<TagGraph | null>(null)
  const [index, setIndex] = useState<TagIndexSnapshot | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 })
  const svgRef = useRef<SVGSVGElement | null>(null)
  const simRef = useRef<Simulation<Node, Link> | null>(null)
  const [, forceRender] = useState(0)
  const nodesRef = useRef<Node[]>([])
  const linksRef = useRef<Link[]>([])

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

  // Escape to close
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  // Build force simulation whenever the graph data changes.
  useEffect(() => {
    if (!graph) return

    const nodes: Node[] = graph.nodes.map((n) => ({
      id: n.tag,
      tag: n.tag,
      count: n.count,
      // Radius 10–30 px, scales with ln(count)
      radius: 10 + Math.log2(1 + n.count) * 6,
      x: VIEW_W / 2 + (Math.random() - 0.5) * 100,
      y: VIEW_H / 2 + (Math.random() - 0.5) * 100
    }))

    const links: Link[] = graph.edges.map((e) => ({
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
          // Shorter link for heavier edges — tags that co-occur often
          // want to cluster tighter.
          .distance((l) => 120 - Math.min(80, l.weight * 6))
          .strength((l) => 0.05 + Math.min(0.4, l.weight * 0.05))
      )
      .force('charge', forceManyBody().strength(-220))
      .force('center', forceCenter(VIEW_W / 2, VIEW_H / 2).strength(0.04))
      .force(
        'collide',
        forceCollide<Node>().radius((d) => d.radius + 6).iterations(2)
      )
      .alpha(1)
      .alphaDecay(0.03)

    sim.on('tick', () => forceRender((v) => v + 1))

    // Let it settle
    simRef.current?.stop()
    simRef.current = sim
    // Manually step to settle quickly if the graph is small
    for (let i = 0; i < 30 && sim.alpha() > sim.alphaMin(); i += 1) {
      sim.tick()
    }
    forceRender((v) => v + 1)

    return () => {
      sim.stop()
    }
  }, [graph])

  // Pan + zoom (wheel / trackpad)
  const onWheel = (e: React.WheelEvent<SVGSVGElement>): void => {
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) {
      // Pinch / ctrl-wheel = zoom
      const k = Math.max(
        0.2,
        Math.min(3, transform.k * (1 - e.deltaY * 0.002))
      )
      setTransform((t) => ({ ...t, k }))
    } else {
      setTransform((t) => ({ ...t, x: t.x - e.deltaX, y: t.y - e.deltaY }))
    }
  }

  // Drag a node around (pin it)
  const draggingRef = useRef<Node | null>(null)
  const onNodeMouseDown = (e: React.MouseEvent, n: Node): void => {
    e.stopPropagation()
    draggingRef.current = n
    simRef.current?.alphaTarget(0.3).restart()
    // Pin at current position
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
      // Release pin so the node floats back into the simulation
      d.fx = null
      d.fy = null
    }
    draggingRef.current = null
  }

  // Compute which nodes/edges to highlight based on hover/selection
  const focus = hovered ?? selected
  const neighborTags = useMemo(() => {
    if (!focus || !graph) return null
    const set = new Set<string>()
    set.add(focus)
    for (const e of graph.edges) {
      if (e.source === focus) set.add(e.target)
      else if (e.target === focus) set.add(e.source)
    }
    return set
  }, [focus, graph])

  // Selected tag's file list
  const selectedFiles = useMemo(() => {
    if (!selected || !index) return []
    const paths = index.filesByTag[selected] ?? []
    return paths
  }, [selected, index])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-stretch">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal frame */}
      <div className="relative m-auto w-[95vw] h-[92vh] rounded-xl border border-border overflow-hidden flex shadow-2xl"
        style={{ background: 'var(--color-background)' }}
      >
        {/* Graph canvas */}
        <div className="relative flex-1 min-w-0 overflow-hidden">
          <div className="absolute top-3 left-4 z-10 flex items-center gap-2 pointer-events-none">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
              Tag Constellation
            </h2>
            <span className="text-xs text-muted-foreground">
              {graph ? `${graph.nodes.length} tags · ${graph.edges.length} connections` : ''}
            </span>
          </div>
          <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">
              scroll to pan · ⌘-scroll to zoom · drag to arrange
            </span>
            <button
              className="p-1.5 rounded hover:bg-sidebar-hover text-muted-foreground hover:text-foreground"
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

          {!graph || graph.nodes.length === 0 ? (
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

              <g
                transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}
              >
                {/* Edges */}
                {linksRef.current.map((l, i) => {
                  const s = typeof l.source === 'string' ? null : l.source
                  const t = typeof l.target === 'string' ? null : l.target
                  if (!s || !t) return null
                  const sId = s.id
                  const tId = t.id
                  const dimmed =
                    focus !== null &&
                    sId !== focus &&
                    tId !== focus
                  return (
                    <line
                      key={i}
                      x1={s.x ?? 0}
                      y1={s.y ?? 0}
                      x2={t.x ?? 0}
                      y2={t.y ?? 0}
                      stroke="var(--color-foreground)"
                      strokeOpacity={dimmed ? 0.04 : 0.22}
                      strokeWidth={Math.min(4, 0.8 + Math.log2(l.weight + 1) * 0.9)}
                    />
                  )
                })}

                {/* Nodes */}
                {nodesRef.current.map((n) => {
                  const isFocus = n.id === focus
                  const isNeighbor =
                    !isFocus && neighborTags?.has(n.id) === true
                  const dimmed = focus !== null && !isFocus && !isNeighbor
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
                        setSelected(n.id === selected ? null : n.id)
                      }}
                      style={{ opacity: dimmed ? 0.22 : 1, transition: 'opacity 150ms' }}
                    >
                      {isFocus && (
                        <circle
                          r={n.radius * 2.2}
                          fill="url(#nodeGlow)"
                          pointerEvents="none"
                        />
                      )}
                      <circle
                        r={n.radius}
                        fill={isFocus
                          ? 'var(--color-primary)'
                          : 'color-mix(in srgb, var(--color-primary) 45%, var(--color-background))'}
                        stroke={
                          selected === n.id
                            ? 'var(--color-primary)'
                            : 'color-mix(in srgb, var(--color-primary) 70%, transparent)'
                        }
                        strokeWidth={selected === n.id ? 3 : 1.5}
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
                        {n.count}
                      </text>
                    </g>
                  )
                })}
              </g>
            </svg>
          )}
        </div>

        {/* Side drawer */}
        <aside
          className="w-[320px] border-l border-border flex flex-col"
          style={{ background: 'var(--color-sidebar-alt)' }}
        >
          {selected ? (
            <>
              <header className="px-4 py-3 border-b border-border-subtle">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                  Selected tag
                </div>
                <div
                  className="text-lg font-semibold truncate"
                  style={{ color: 'var(--color-primary)' }}
                >
                  #{selected}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {selectedFiles.length}{' '}
                  {selectedFiles.length === 1 ? 'note' : 'notes'}
                </div>
              </header>
              <ul className="flex-1 overflow-y-auto">
                {selectedFiles.length === 0 ? (
                  <li className="px-4 py-4 text-xs text-muted-foreground">
                    No notes declare this tag explicitly.
                  </li>
                ) : (
                  selectedFiles.map((path) => {
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
            </>
          ) : (
            <div className="p-4 text-sm text-muted-foreground space-y-3">
              <p className="font-medium text-foreground">How to read this</p>
              <p>
                Each circle is a tag. Bigger circles have more notes.
                Lines connect tags that appear together in at least one
                note; thicker lines = more shared notes.
              </p>
              <p>
                Hover to highlight a tag and its connections. Click a tag
                to open its note list here.
              </p>
              <p className="text-xs text-muted-foreground/70 pt-2 border-t border-border-subtle">
                Tip: clusters of tightly-connected tags are your vault's
                recurring themes. Orphans — tags with no lines —
                probably deserve more linking.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
