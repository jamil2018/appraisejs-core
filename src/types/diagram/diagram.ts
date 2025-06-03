export type NodeData = {
  order: number;
  label: string;
  gherkinStep?: string;
  isFirstNode?: boolean;
  icon?: string;
  parameters?: { name: string; value: string; order: number }[];
};

export type NodeOrderMap = Record<string, NodeData>;
