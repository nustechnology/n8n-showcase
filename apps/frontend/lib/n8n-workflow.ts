import type { Edge, Node } from "@xyflow/react";
import { z } from "zod";

// n8n's exported workflow JSON is data crossing a trust boundary (an
// external tool's export, not something this app produces) — validated with
// zod per this repo's convention, not just type-asserted. Only the fields
// this app reads are modeled; n8n's real export has many more (credentials,
// webhookId, settings, pinData, ...) that are irrelevant to a read-only
// viewer and dropped silently (no .strict()).
export const n8nNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  typeVersion: z.number().optional(),
  position: z.tuple([z.number(), z.number()]),
  parameters: z.record(z.string(), z.unknown()).optional(),
});
export type N8nNode = z.infer<typeof n8nNodeSchema>;

export const n8nConnectionSchema = z.object({
  node: z.string(),
  type: z.string(),
  index: z.number(),
});
export type N8nConnection = z.infer<typeof n8nConnectionSchema>;

/** sourceNodeName -> connectionType (usually "main") -> outputPortIndex -> targets. A branching node (e.g. IF) has more than one output port. */
export const n8nConnectionsSchema = z.record(z.string(), z.record(z.string(), z.array(z.array(n8nConnectionSchema))));
export type N8nConnections = z.infer<typeof n8nConnectionsSchema>;

export const n8nWorkflowSchema = z.object({
  name: z.string().optional(),
  nodes: z.array(n8nNodeSchema),
  connections: n8nConnectionsSchema,
});
export type N8nWorkflow = z.infer<typeof n8nWorkflowSchema>;

export interface WorkflowNodeData extends Record<string, unknown> {
  label: string;
  /** Raw n8n node type (e.g. "n8n-nodes-base.if") — icon/visual mapping is a UI concern, not decided here. */
  nodeType: string;
  /** How many distinct output ports this node has (>1 for a branching node like IF) — the node renderer needs this to render one Handle per port; an edge's sourceHandle id with no matching rendered Handle is a React Flow error (#008), not just a cosmetic gap. */
  outputCount: number;
}

export type WorkflowFlowNode = Node<WorkflowNodeData>;
export type WorkflowFlowEdge = Edge;

/**
 * Pure conversion from n8n's workflow JSON to React Flow's nodes/edges — no
 * React, no DOM, no fetching. n8n connections reference nodes by *name*, not
 * id, so a name -> id lookup is built first; an unresolvable name (a
 * dangling reference in externally-authored JSON this app doesn't control)
 * is skipped rather than thrown, since a viewer shouldn't crash on a
 * malformed export.
 */
export function n8nWorkflowToFlow(workflow: N8nWorkflow): { nodes: WorkflowFlowNode[]; edges: WorkflowFlowEdge[] } {
  const idByName = new Map(workflow.nodes.map((node) => [node.name, node.id]));

  // Computed up front (before building `nodes`) so each node's rendered
  // handle count matches the real number of output ports it connects
  // through — a node with no outgoing connections still gets 1, since every
  // node renders at least one (unused) source handle.
  const outputCountByName = new Map<string, number>();
  for (const [sourceName, connectionsByType] of Object.entries(workflow.connections)) {
    const maxPorts = Math.max(0, ...Object.values(connectionsByType).map((ports) => ports.length));
    outputCountByName.set(sourceName, maxPorts);
  }

  const nodes: WorkflowFlowNode[] = workflow.nodes.map((node) => ({
    id: node.id,
    position: { x: node.position[0], y: node.position[1] },
    data: {
      label: node.name,
      nodeType: node.type,
      outputCount: Math.max(1, outputCountByName.get(node.name) ?? 0),
    },
  }));

  const edges: WorkflowFlowEdge[] = [];

  for (const [sourceName, connectionsByType] of Object.entries(workflow.connections)) {
    const sourceId = idByName.get(sourceName);
    if (!sourceId) continue;

    for (const outputPorts of Object.values(connectionsByType)) {
      outputPorts.forEach((targets, outputIndex) => {
        for (const target of targets) {
          const targetId = idByName.get(target.node);
          if (!targetId) continue;

          edges.push({
            id: `${sourceId}:${outputIndex}-${targetId}:${target.index}`,
            source: sourceId,
            target: targetId,
            sourceHandle: outputIndex > 0 ? String(outputIndex) : undefined,
          });
        }
      });
    }
  }

  return { nodes, edges };
}
