import type { Meta, StoryObj } from "@storybook/react-vite";
import { CsvPanel } from "./CsvPanel.tsx";

const meta = {
  title: "Data Display/CsvPanel",
  component: CsvPanel,
  args: { result: null, onImport: () => {}, onRefuse: () => {}, onExport: () => {} },
} satisfies Meta<typeof CsvPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ImportedOk: Story = {
  args: { result: { ok: true, message: "Imported 120 rows." } },
};

export const Refused: Story = {
  args: { result: { ok: false, message: "Line 4: column “age” must be an integer." } },
};

/** Export is disabled while a request is in flight. */
export const Busy: Story = {
  args: { busy: true },
};
