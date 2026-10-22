import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { CanvasLayer } from "./CanvasLayer.tsx";
import type { FlowCanvas } from "./canvas-types.ts";

const CANVAS: FlowCanvas = {
  sections: [
    {
      id: "sec_1",
      title: "Ingest",
      color: "#3b82f6",
      position: { x: 20, y: 20 },
      size: { width: 320, height: 200 },
      nodes: [],
    },
  ],
  notes: [
    {
      id: "note_1",
      color: "#eab308",
      position: { x: 60, y: 80 },
      size: { width: 240, height: 100 },
      content: "**Note**: renders _behind_ nodes. [docs](https://w6w.io)",
    },
  ],
};

/** Outside a flow the layer portals into a stand-in viewport element. */
function Host({ canvas }: { canvas: FlowCanvas }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  return (
    <div style={{ position: "relative", height: 260, overflow: "hidden" }}>
      <div ref={setEl} className="react-flow__viewport" style={{ position: "absolute" }} />
      <CanvasLayer canvas={canvas} viewport={el} />
    </div>
  );
}

const meta = {
  title: "Flow/CanvasLayer",
  component: CanvasLayer,
  parameters: { layout: "padded" },
  args: { canvas: CANVAS },
  render: (args) => <Host canvas={args.canvas} />,
} satisfies Meta<typeof CanvasLayer>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { canvas: {} } };
