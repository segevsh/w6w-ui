import type { Edge } from "@xyflow/react";
import type { FlowCanvas } from "./canvas-types.ts";
import { type StepNode, relayoutNodes } from "./flow-utils.ts";

const GAP = 64;
const SECTION_PADDING = 24;
const SECTION_LABEL_HEIGHT = 32;

type Rect = { x: number; y: number; width: number; height: number };

function nodeSize(node: StepNode) {
  return {
    width: node.measured?.width ?? node.width ?? 200,
    height: node.measured?.height ?? node.height ?? 64,
  };
}

function overlaps(a: Rect, b: Rect) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** Expand columns and rows for the actual cards, including trigger metadata. */
function spaceNodes(nodes: StepNode[]): StepNode[] {
  const offsets = (axis: "x" | "y", dimension: "width" | "height") => {
    const extents = new Map<number, number>();
    for (const node of nodes) {
      const at = node.position[axis];
      extents.set(at, Math.max(extents.get(at) ?? 0, nodeSize(node)[dimension]));
    }
    const placed = new Map<number, number>();
    let end = Number.NEGATIVE_INFINITY;
    for (const [at, extent] of [...extents].sort(([a], [b]) => a - b)) {
      const start = Math.max(at, end);
      placed.set(at, start);
      end = start + extent + GAP;
    }
    return placed;
  };
  const x = offsets("x", "width");
  const y = offsets("y", "height");
  return nodes.map((node) => ({
    ...node,
    position: {
      x: x.get(node.position.x) ?? node.position.x,
      y: y.get(node.position.y) ?? node.position.y,
    },
  }));
}

/**
 * Arrange paths and their section frames together. Membership is authored data:
 * fit each frame to its members, never infer new membership from moved geometry.
 * A section spanning non-members is moved with its members below the obstruction.
 * Notes and empty sections retain their authored geometry.
 */
export function relayoutFlow(
  nodes: StepNode[],
  edges: Edge[],
  canvas: FlowCanvas,
): { nodes: StepNode[]; canvas: FlowCanvas } {
  const arranged = spaceNodes(relayoutNodes(nodes, edges));
  if (!canvas.sections?.length) return { nodes: arranged, canvas };
  const byId = new Map(arranged.map((node) => [node.id, node]));
  const occupied: Rect[] = (canvas.notes ?? []).map((note) => ({ ...note.position, ...note.size }));
  // Empty frames also occupy space, even if encountered after a populated one.
  for (const section of canvas.sections) {
    if (!section.nodes.some((id) => byId.has(id))) {
      occupied.push({
        ...section.position,
        ...section.size,
        y: section.position.y - SECTION_LABEL_HEIGHT,
        height: section.size.height + SECTION_LABEL_HEIGHT,
      });
    }
  }
  const sections = canvas.sections.map((section) => {
    const memberIds = new Set(section.nodes);
    const members = arranged.filter((node) => memberIds.has(node.id));
    if (!members.length) return section;
    const x = Math.min(...members.map((node) => node.position.x)) - SECTION_PADDING;
    const y = Math.min(...members.map((node) => node.position.y)) - SECTION_PADDING;
    const right = Math.max(...members.map((node) => node.position.x + nodeSize(node).width));
    const bottom = Math.max(...members.map((node) => node.position.y + nodeSize(node).height));
    const frame = {
      x,
      y,
      width: right + SECTION_PADDING - x,
      height: bottom + SECTION_PADDING - y,
    };
    const obstacles = [
      ...occupied,
      ...[...byId.values()]
        .filter((node) => !memberIds.has(node.id))
        .map((node) => ({ ...node.position, ...nodeSize(node) })),
    ].sort((a, b) => a.y - b.y);
    for (const obstacle of obstacles) {
      const withLabel = {
        ...frame,
        y: frame.y - SECTION_LABEL_HEIGHT,
        height: frame.height + SECTION_LABEL_HEIGHT,
      };
      if (overlaps(withLabel, obstacle)) {
        frame.y = obstacle.y + obstacle.height + SECTION_PADDING + SECTION_LABEL_HEIGHT;
      }
    }
    const dy = frame.y - y;
    for (const node of members) {
      byId.set(node.id, { ...node, position: { x: node.position.x, y: node.position.y + dy } });
    }
    occupied.push({
      ...frame,
      y: frame.y - SECTION_LABEL_HEIGHT,
      height: frame.height + SECTION_LABEL_HEIGHT,
    });
    return {
      ...section,
      position: { x: frame.x, y: frame.y },
      size: { width: frame.width, height: frame.height },
    };
  });
  return {
    nodes: arranged.map((node) => byId.get(node.id) ?? node),
    canvas: { ...canvas, sections },
  };
}
