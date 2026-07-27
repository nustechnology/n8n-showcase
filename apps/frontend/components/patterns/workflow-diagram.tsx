"use client";

import { memo } from "react";

import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { GitBranch, Globe, Webhook, Workflow } from "lucide-react";

import type { WorkflowFlowEdge, WorkflowFlowNode } from "@/lib/n8n-workflow";

import { cn } from "@/lib/utils";

const NODE_ICON_CLASS = "size-4 shrink-0 text-muted-foreground";

// String-matched against n8n's own node type ids (e.g. "n8n-nodes-base.if")
// — not an exhaustive mapping, just enough to make the common node kinds in
// this app's own workflows recognizable at a glance. Anything unmatched
// falls back to a generic icon rather than rendering nothing. Returns a
// static JSX element per branch (not a component reference held in a
// variable) — assigning a picked component to a capitalized variable and
// rendering it as `<Icon />` resets that element's state every render.
function NodeIcon({ nodeType }: { nodeType: string }) {
  if (nodeType.includes("webhook")) return <Webhook className={NODE_ICON_CLASS} />;
  if (nodeType.includes("httpRequest")) return <Globe className={NODE_ICON_CLASS} />;
  if (nodeType.includes("if")) return <GitBranch className={NODE_ICON_CLASS} />;
  return <Workflow className={NODE_ICON_CLASS} />;
}

const WorkflowGraphNode = memo(function WorkflowGraphNode({ data }: NodeProps<WorkflowFlowNode>) {
  // One Handle per real output port — an edge's sourceHandle id with no
  // matching rendered Handle here is a React Flow error (#008), not just a
  // missing anchor point. Ports > 1 (a branching node like IF) get spread
  // evenly down the right edge instead of stacking at the default center.
  const outputPorts = Array.from({ length: data.outputCount }, (_, i) => i);

  return (
    <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm shadow-sm">
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
      />
      <NodeIcon nodeType={data.nodeType} />
      <span className="font-medium">{data.label}</span>
      {outputPorts.map((outputIndex) => (
        <Handle
          key={outputIndex}
          type="source"
          id={outputIndex > 0 ? String(outputIndex) : undefined}
          position={Position.Right}
          isConnectable={false}
          style={outputPorts.length > 1 ? { top: `${((outputIndex + 1) / (outputPorts.length + 1)) * 100}%` } : undefined}
        />
      ))}
    </div>
  );
});

// Overrides React Flow's built-in "default" node type globally within this
// component — the transform layer (lib/n8n-workflow.ts) never sets a `type`
// on the nodes it produces, so every node renders through here. Module-level
// (not created per-render) since React Flow expects a stable nodeTypes
// object reference.
const nodeTypes = { default: WorkflowGraphNode };

interface WorkflowDiagramProps {
  nodes: WorkflowFlowNode[];
  edges: WorkflowFlowEdge[];
  className?: string;
}

/**
 * Generic, read-only React Flow renderer — takes already-transformed
 * nodes/edges (see lib/n8n-workflow.ts for the n8n-specific conversion) and
 * knows nothing about n8n, orders, or any other domain concept, only how to
 * draw a graph. Read-only is enforced structurally, not just visually:
 * nodes/edges are passed straight through as static props with no
 * onNodesChange/onEdgesChange/onConnect wired at all, so there's nothing
 * for a drag or connection attempt to mutate even before nodesDraggable/
 * nodesConnectable/elementsSelectable are considered.
 */
export function WorkflowDiagram({ nodes, edges, className }: WorkflowDiagramProps) {
  return (
    <div className={cn("h-[600px] w-full rounded-lg border", className)}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
        >
          <Background />
          {/* showInteractive={false} hides the lock/unlock toggle — its
              default "interactive" button would otherwise let a viewer
              re-enable dragging. */}
          <Controls showInteractive={false} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
