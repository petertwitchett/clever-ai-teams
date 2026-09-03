/* Types mirroring FastAPI Backend Schema & DSL */

export type ThemeMode = "light" | "dark" | "semi-dark";
export type ThemeColor = "purple" | "orange" | "blue" | "green" | "red";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "member" | "viewer";
  created_at: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

export interface BrainBinding {
  provider: "openai" | "anthropic" | "deepseek" | "ollama" | "litellm";
  model: string;
  temperature: number;
  top_p: number;
  max_context_tokens: number;
}

export interface IdentityBlock {
  id: string;
  name: string;
  role: string;
  duty: string;
  avatar_url?: string;
}

export interface PsychologicalPersona {
  tone: string;
  temperament: string;
  cognitive_style: string;
  quirks: string[];
}

export interface ConstitutionalEthics {
  negative_constraints: string[];
  operational_guardrails: string[];
  safety_invariants: string[];
}

export interface MemoryConfig {
  working_memory_window: number;
  archival_top_k: number;
  importance_threshold: number;
}

export interface PersonNodeManifest {
  identity: IdentityBlock;
  persona: PsychologicalPersona;
  ethics: ConstitutionalEthics;
  brain: BrainBinding;
  skills: string[]; // Assigned skill IDs / names
  memory: MemoryConfig;
  canvas_position?: { x: number; y: number };
  [key: string]: any;
}

export interface OrchestratorSpec {
  node_id: string;
  name: string;
  duty: string;
  brain: BrainBinding;
  stall_threshold: number;
  canvas_position?: { x: number; y: number };
  [key: string]: any;
}

export interface GraphEdgeDSL {
  id: string;
  source: string;
  target: string;
  channel: "subtask_dispatch" | "dialectical_review" | "peer_collaboration";
  bidirectional?: boolean;
  notes?: string;
}

export interface GraphDSL {
  version: string;
  name: string;
  description: string;
  orchestrator: OrchestratorSpec;
  nodes: PersonNodeManifest[];
  edges: GraphEdgeDSL[];
}

export interface GraphSummary {
  id: string;
  name: string;
  description: string;
  is_compiled: boolean;
  is_published: boolean;
  node_count: number;
  edge_count: number;
  created_at: string;
  updated_at: string;
  dsl?: GraphDSL;
}

export interface ChatSession {
  id: string;
  title: string;
  graph_id: string;
  graph_name?: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  sender_type: "user" | "orchestrator" | "specialist" | "system";
  sender_name: string;
  content: string;
  created_at: string;
  run_id?: string;
  metadata?: Record<string, any>;
}

export interface Milestone {
  id: string;
  description: string;
  assigned_node: string;
  status: "pending" | "in_progress" | "review" | "verified" | "failed";
  verification_criteria: string;
  intermediate_output?: string;
}

export interface TaskLedger {
  milestones: Milestone[];
  facts: string[];
  hypotheses: string[];
  stall_count: number;
  is_replanning: boolean;
}

export interface ProgressLedger {
  current_milestone_id: string | null;
  active_directive: string | null;
  assigned_node: string | null;
  iteration: number;
  status: "idle" | "dispatching" | "executing" | "evaluating" | "advance";
}

export interface DialecticalCritique {
  id: string;
  milestone_id: string;
  critic_node: string;
  target_node: string;
  critique_text: string;
  accepted: boolean;
  score: number;
  timestamp: string;
}

export interface OrchestrationRun {
  id: string;
  session_id: string;
  status: "queued" | "running" | "waiting_hitl" | "completed" | "failed" | "cancelled";
  task_ledger: TaskLedger;
  progress_ledger: ProgressLedger;
  critiques: DialecticalCritique[];
  final_result?: string;
  created_at: string;
  completed_at?: string;
}

export interface VoyagerSkill {
  id: string;
  name: string;
  description: string;
  category: string;
  python_code: string;
  docstring: string;
  input_schema: Record<string, any>;
  ast_validated: boolean;
  usage_count: number;
  success_rate: number;
  created_at: string;
}

export interface ExpeLReflection {
  id: string;
  session_id: string;
  principle: string;
  trigger_context: string;
  impact_score: number;
  created_at: string;
}

export interface ArchivalMemory {
  id: string;
  node_id: string;
  node_name?: string;
  content: string;
  importance: number;
  similarity?: number;
  access_count: number;
  created_at: string;
}
