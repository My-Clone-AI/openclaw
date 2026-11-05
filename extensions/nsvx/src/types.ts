/** Field names follow the NSVX AgentOS REST contract. */
export type NsvxAction = {
  id: string;
  version: number;
  app: string;
  title: string;
  description: string;
  kind: string;
  risk_class: string;
  scopes: string[];
  confirmation: string;
  idempotency: string;
};

export type NsvxRunResult = {
  status: string;
  correlation_id: string;
  output?: Record<string, unknown>;
  task_id?: string;
  approval_id?: string;
  replayed?: boolean;
};

export type NsvxTask = {
  id: string;
  action: string;
  state: string;
  created_at?: string;
  updated_at?: string;
};

export type NsvxApproval = {
  id: string;
  task_id: string;
  action: string;
  state: string;
  policy: string;
  terms: Record<string, unknown>;
  expires_at: string;
  created_at: string;
};

export type NsvxStatus =
  | { state: "connected"; address: string; actions: number }
  | { state: "unconfigured" | "signed-out" | "off" | "offline" | "failed"; address: string };

export type ParityCounts = {
  discovered: number;
  native: number;
  partial: number;
  missing: number;
  blocked: number;
  verified: number;
};

export type ParityData = ParityCounts & {
  sources: { nsvx: string; openclaw: string };
  families: (ParityCounts & { id: string; name: string })[];
  entries: {
    id: string;
    title: string;
    family: string;
    priority: string;
    status: "native" | "partial" | "missing" | "blocked";
    verified: boolean;
  }[];
};
