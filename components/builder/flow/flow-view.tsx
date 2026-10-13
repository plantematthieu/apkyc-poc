"use client"

import { useCallback, useMemo, useState } from "react"
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type NodeChange,
  type OnConnectEnd,
} from "@xyflow/react"
import { Network } from "lucide-react"
import { locateIssue, NODE_WIDTH, transitionSources } from "@/lib/builder"
import { useCatalogStore } from "@/store/catalog"
import { useEditor } from "@/store/editor"
import { newCondition } from "../conditions/condition-builder"
import { useIssues } from "../problems-button"
import { useDescribe } from "../use-describe"
import { ConditionEdge, edgeId, type ConditionEdgeType } from "./condition-edge"
import { FlowInspector } from "./flow-inspector"
import { StepNode, type StepNodeType } from "./step-node"

const nodeTypes = { step: StepNode }
const edgeTypes = { condition: ConditionEdge }

export function FlowView() {
  return (
    <ReactFlowProvider>
      <FlowCanvas />
    </ReactFlowProvider>
  )
}

/** Nouvelle branche conditionnelle : une première règle sur un champ déjà rempli. */
function addBranch(from: string, to: string) {
  const { schema, lang } = useEditor.getState()
  const sources = transitionSources({ schema, properties: useCatalogStore.getState().properties, lang }, from)
  useEditor.getState().addTransition(from, to, newCondition(sources))
}

function FlowCanvas() {
  const schema = useEditor((s) => s.schema)
  const positions = useEditor((s) => s.positions)
  const selection = useEditor((s) => s.selection)
  const readOnly = useEditor((s) => s.readOnly)
  const lang = useEditor((s) => s.lang)
  const ed = useEditor.getState
  const issues = useIssues()
  const { describe } = useDescribe()
  const { screenToFlowPosition, fitView } = useReactFlow()

  const built = useMemo<StepNodeType[]>(() => {
    const errorSteps = new Set(
      issues
        .filter((i) => i.severity === "error")
        .map(locateIssue)
        .filter((l) => !l.transition)
        .map((l) => l.stepKey),
    )
    return Object.entries(schema.steps).map(([key, step]) => ({
      id: key,
      type: "step",
      position: positions[key] ?? { x: 0, y: 0 },
      selected: selection?.kind === "step" && selection.key === key,
      data: { stepKey: key, step, lang, isStart: schema.start === key, hasError: errorSteps.has(key), isEnd: step.next.length === 0, readOnly },
    }))
  }, [schema, positions, selection, issues, lang, readOnly])

  // Les positions pendant le glissement restent locales ; on les enregistre au lâcher
  const [nodes, setNodes] = useState<StepNodeType[]>(built)
  const [synced, setSynced] = useState(built)
  if (synced !== built) {
    setSynced(built)
    // On garde les dimensions mesurées : sans elles, xyflow masque les nœuds le temps de les remesurer
    setNodes((prev) =>
      built.map((n) => {
        const old = prev.find((o) => o.id === n.id)
        return old?.measured ? { ...n, measured: old.measured } : n
      }),
    )
  }

  const edges = useMemo<ConditionEdgeType[]>(() => {
    const errorEdges = new Set(
      issues
        .map(locateIssue)
        .filter((l) => l.transition)
        .map((l) => edgeId(l.transition!.from, l.transition!.index)),
    )
    return Object.entries(schema.steps).flatMap(([from, step]) => {
      const conditional = step.next.filter((t) => t.if !== undefined).length
      return step.next
        .map((t, index) => ({ t, index }))
        .filter(({ t }) => t.goto in schema.steps)
        .map(({ t, index }) => ({
          id: edgeId(from, index),
          source: from,
          target: t.goto,
          type: "condition",
          selected: selection?.kind === "transition" && selection.from === from && selection.index === index,
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
          data: {
            from,
            index,
            label: describe(t.if),
            // Un lien simple (sans alternative) n'a pas besoin d'étiquette « Sinon »
            showLabel: t.if !== undefined || conditional > 0,
            isDefault: t.if === undefined,
            order: t.if !== undefined && conditional > 1 ? index + 1 : null,
            hasError: errorEdges.has(edgeId(from, index)),
          },
        }))
    })
  }, [schema, selection, issues, describe])

  const onNodesChange = useCallback((changes: NodeChange<StepNodeType>[]) => {
    setNodes((ns) => applyNodeChanges(changes.filter((c) => c.type !== "select" && c.type !== "remove"), ns))
  }, [])

  const onConnect = useCallback((c: Connection) => {
    if (c.source && c.target) addBranch(c.source, c.target)
  }, [])

  // Flèche lâchée dans le vide : on crée l'étape à cet endroit
  const onConnectEnd: OnConnectEnd = useCallback(
    (event, state) => {
      if (state.isValid || !state.fromNode) return
      if (state.toNode && state.toNode.id !== state.fromNode.id) return addBranch(state.fromNode.id, state.toNode.id)
      const point = "changedTouches" in event ? event.changedTouches[0]! : event
      const pos = screenToFlowPosition({ x: point.clientX, y: point.clientY })
      const key = ed().addStep({ x: pos.x - NODE_WIDTH / 2, y: pos.y })
      if (!key) return
      addBranch(state.fromNode.id, key)
      ed().select({ kind: "step", key })
    },
    [ed, screenToFlowPosition],
  )

  const relayout = () => {
    ed().relayout()
    setTimeout(() => fitView({ duration: 300, padding: 0.2 }), 30)
  }

  const inspectorOpen = selection?.kind === "step" || selection?.kind === "transition"

  return (
    <div
      className="absolute inset-0"
      onDoubleClick={(e) => {
        if (readOnly || !(e.target as HTMLElement).classList.contains("react-flow__pane")) return
        const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
        ed().addStep({ x: pos.x - NODE_WIDTH / 2, y: pos.y - 40 })
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={(_, __, dragged) => dragged.forEach((n) => ed().moveStep(n.id, n.position))}
        onNodeClick={(_, n) => ed().select({ kind: "step", key: n.id })}
        onNodeDoubleClick={(_, n) => ed().openStep(n.id)}
        onEdgeClick={(_, e) => e.data && ed().select({ kind: "transition", from: e.data.from, index: e.data.index })}
        onPaneClick={() => ed().select(null)}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        nodesConnectable={!readOnly}
        deleteKeyCode={null}
        zoomOnDoubleClick={false}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.2}
        maxZoom={1.5}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} />
        <Controls showInteractive={false} position="top-left">
          <ControlButton onClick={relayout} title="Réorganiser le parcours" aria-label="Réorganiser le parcours">
            <Network />
          </ControlButton>
        </Controls>
        <MiniMap pannable zoomable position="bottom-right" className="!rounded-lg !border" style={{ marginRight: inspectorOpen ? 352 : 16 }} />
        {!readOnly && (
          <Panel position="bottom-center" className="text-muted-foreground bg-background/80 hidden rounded-full border px-3 py-1 text-xs backdrop-blur md:block">
            Tirez le <span className="font-semibold">+</span> sous une étape pour créer une branche · double-clic sur une étape pour la remplir
          </Panel>
        )}
      </ReactFlow>
      {inspectorOpen && <FlowInspector />}
    </div>
  )
}
