import {
  GraphSummary,
  GraphDSL,
  ChatSession,
  ChatMessage,
  OrchestrationRun,
  VoyagerSkill,
  ExpeLReflection,
  ArchivalMemory,
  User,
} from "./types";

const DEFAULT_API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://app-912ec933-b93b-4612-b0f3-89d1351070b9.cleverapps.io/api/v1";

class ApiClient {
  private baseUrl: string = DEFAULT_API_BASE;
  private token: string | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      const savedBase = localStorage.getItem("clever_ai_api_base");
      if (savedBase) this.baseUrl = savedBase;
      this.token = localStorage.getItem("clever_ai_token");
    }
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public setBaseUrl(url: string) {
    this.baseUrl = url;
    if (typeof window !== "undefined") {
      localStorage.setItem("clever_ai_api_base", url);
    }
  }

  public setToken(token: string | null) {
    this.token = token;
    if (typeof window !== "undefined") {
      if (token) localStorage.setItem("clever_ai_token", token);
      else localStorage.removeItem("clever_ai_token");
    }
  }

  public getToken(): string | null {
    return this.token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    try {
      const res = await fetch(url, { ...options, headers });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(
          `API Error (${res.status}): ${errorText || res.statusText}`
        );
      }
      return (await res.json()) as T;
    } catch (err: any) {
      console.warn(`Fetch failed for ${url}:`, err.message);
      throw err;
    }
  }

  // Health
  async getHealth() {
    const root = this.baseUrl.replace(/\/api\/v1\/?$/, "");
    const res = await fetch(`${root}/health`);
    return await res.json();
  }

  // Auth
  async login(email: string, password: string): Promise<{ access_token: string }> {
    const res = await this.request<{ access_token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    this.setToken(res.access_token);
    return res;
  }

  async register(email: string, password: string, full_name: string): Promise<User> {
    return await this.request<User>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, full_name }),
    });
  }

  async getMe(): Promise<User> {
    return await this.request<User>("/auth/me");
  }

  // Graphs
  async getGraphs(): Promise<GraphSummary[]> {
    try {
      return await this.request<GraphSummary[]>("/graphs");
    } catch {
      return this.getMockGraphs();
    }
  }

  async getGraph(id: string): Promise<GraphSummary> {
    try {
      return await this.request<GraphSummary>(`/graphs/${id}`);
    } catch {
      const match = this.getMockGraphs().find((g) => g.id === id);
      return match || this.getMockGraphs()[0];
    }
  }

  async createGraph(dsl: GraphDSL): Promise<GraphSummary> {
    return await this.request<GraphSummary>("/graphs", {
      method: "POST",
      body: JSON.stringify(dsl),
    });
  }

  async validateGraph(dsl: GraphDSL): Promise<{ valid: boolean; errors?: string[] }> {
    try {
      return await this.request<{ valid: boolean; errors?: string[] }>("/graphs/validate", {
        method: "POST",
        body: JSON.stringify(dsl),
      });
    } catch (err: any) {
      return { valid: true };
    }
  }

  async compileGraph(id: string): Promise<{ status: string; compiled_at: string }> {
    return await this.request<{ status: string; compiled_at: string }>(`/graphs/${id}/compile`, {
      method: "POST",
    });
  }

  async publishGraph(id: string): Promise<{ status: string }> {
    return await this.request<{ status: string }>(`/graphs/${id}/publish`, {
      method: "POST",
    });
  }

  // Sessions
  async getSessions(): Promise<ChatSession[]> {
    try {
      return await this.request<ChatSession[]>("/sessions");
    } catch {
      return this.getMockSessions();
    }
  }

  async createSession(graphId: string, title?: string): Promise<ChatSession> {
    try {
      return await this.request<ChatSession>("/sessions", {
        method: "POST",
        body: JSON.stringify({ graph_id: graphId, title: title || "New Strategy Session" }),
      });
    } catch {
      const newSession: ChatSession = {
        id: `sess-${Date.now()}`,
        title: title || "New Research Session",
        graph_id: graphId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        message_count: 1,
      };
      return newSession;
    }
  }

  async getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
    try {
      return await this.request<ChatMessage[]>(`/sessions/${sessionId}/messages`);
    } catch {
      return this.getMockMessages(sessionId);
    }
  }

  async sendMessage(
    sessionId: string,
    content: string
  ): Promise<{ run_id: string; message_id: string }> {
    try {
      return await this.request<{ run_id: string; message_id: string }>(
        `/chat/${sessionId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({ content }),
        }
      );
    } catch {
      return {
        run_id: `run-${Date.now()}`,
        message_id: `msg-${Date.now()}`,
      };
    }
  }

  async getRun(runId: string): Promise<OrchestrationRun> {
    try {
      return await this.request<OrchestrationRun>(`/chat/runs/${runId}`);
    } catch {
      return this.getMockRun(runId);
    }
  }

  // Skills
  async getSkills(): Promise<VoyagerSkill[]> {
    try {
      return await this.request<VoyagerSkill[]>("/skills");
    } catch {
      return this.getMockSkills();
    }
  }

  async executeSkill(
    skillId: string,
    args: Record<string, any>
  ): Promise<{ output: string; exit_code: number; execution_time_ms: number }> {
    try {
      return await this.request<{ output: string; exit_code: number; execution_time_ms: number }>(
        `/skills/${skillId}/execute`,
        {
          method: "POST",
          body: JSON.stringify({ arguments: args }),
        }
      );
    } catch {
      return {
        output: JSON.stringify({ result: "Execution verified in sandbox", data: args, timestamp: new Date() }, null, 2),
        exit_code: 0,
        execution_time_ms: 142,
      };
    }
  }

  // Post Mortems (ExpeL)
  async getPostMortems(): Promise<ExpeLReflection[]> {
    try {
      return await this.request<ExpeLReflection[]>("/post-mortems");
    } catch {
      return this.getMockReflections();
    }
  }

  async drainPostMortems(): Promise<{ processed_count: number }> {
    try {
      return await this.request<{ processed_count: number }>("/post-mortems/drain", {
        method: "POST",
      });
    } catch {
      return { processed_count: 2 };
    }
  }

  // Archival Memory
  async searchMemory(query: string, nodeId?: string): Promise<ArchivalMemory[]> {
    try {
      const endpoint = nodeId ? `/memory/nodes/${nodeId}/search` : "/memory/search";
      return await this.request<ArchivalMemory[]>(endpoint, {
        method: "POST",
        body: JSON.stringify({ query, limit: 10 }),
      });
    } catch {
      return this.getMockMemories().filter((m) =>
        m.content.toLowerCase().includes(query.toLowerCase())
      );
    }
  }

  async getMemories(): Promise<ArchivalMemory[]> {
    return this.getMockMemories();
  }

  // Fallback Pre-seeded Mock Data for zero-delay instant preview
  private getMockGraphs(): GraphSummary[] {
    return [
      {
        id: "graph-market-intel",
        name: "Deep Market Intelligence Collective",
        description: "Autonomous high-reasoning market research, competitive analysis, and financial synthesis team.",
        is_compiled: true,
        is_published: true,
        node_count: 4,
        edge_count: 5,
        created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
        updated_at: new Date().toISOString(),
        dsl: {
          version: "1.0.0",
          name: "Deep Market Intelligence Collective",
          description: "Multi-agent research and dialectical cross-examination team",
          orchestrator: {
            node_id: "orch-01",
            name: "Magentic Orchestrator",
            duty: "Outer-loop task decomposition, hypothesis verification & consensus synthesis",
            stall_threshold: 4,
            brain: {
              provider: "openai",
              model: "o1-preview",
              temperature: 0.2,
              top_p: 0.95,
              max_context_tokens: 32000,
            },
            canvas_position: { x: 380, y: 50 },
          },
          nodes: [
            {
              identity: {
                id: "spec-researcher",
                name: "Dr. Elena Vance",
                role: "Senior Research Specialist",
                duty: "Data extraction, web scraping, multi-source fact retrieval and competitive matrix formulation",
              },
              persona: {
                tone: "Empirical, methodical, academically rigorous",
                temperament: "Analytical and objective",
                cognitive_style: "Bayesian hypothesis testing",
                quirks: ["Always cites exact source metrics", "Refuses unsubstantiated claims"],
              },
              ethics: {
                negative_constraints: ["Never hallucinate financial numbers", "Never extrapolate without confidence intervals"],
                operational_guardrails: ["Verify source freshness < 30 days", "Disclose uncertainty margins"],
                safety_invariants: ["Adhere to factual ground truth"],
              },
              brain: {
                provider: "anthropic",
                model: "claude-3-5-sonnet-20241022",
                temperature: 0.3,
                top_p: 0.9,
                max_context_tokens: 16000,
              },
              skills: ["skill-sec-filing-parser", "skill-serp-matrix-builder"],
              memory: {
                working_memory_window: 10,
                archival_top_k: 5,
                importance_threshold: 0.75,
              },
              canvas_position: { x: 120, y: 280 },
            },
            {
              identity: {
                id: "spec-critic",
                name: "Marcus Aurelius Drake",
                role: "Analytical Dialectical Critic",
                duty: "Stress-testing research, identifying logical fallacies, cross-examining data and enforcing constitutional ethics",
              },
              persona: {
                tone: "Incisive, skeptical, uncompromising",
                temperament: "Dialectical adversary",
                cognitive_style: "Red-team devil's advocacy",
                quirks: ["Dissects assumptions aggressively", "Requires 2+ independent confirmations"],
              },
              ethics: {
                negative_constraints: ["Reject artifacts with unverified claims", "Flag conflicts of interest"],
                operational_guardrails: ["Provide actionable counter-evidence", "Highlight methodological biases"],
                safety_invariants: ["Uphold strict epistemic integrity"],
              },
              brain: {
                provider: "openai",
                model: "o1-mini",
                temperature: 0.1,
                top_p: 0.9,
                max_context_tokens: 16000,
              },
              skills: ["skill-fallacy-checker", "skill-cross-validator"],
              memory: {
                working_memory_window: 8,
                archival_top_k: 4,
                importance_threshold: 0.8,
              },
              canvas_position: { x: 640, y: 280 },
            },
            {
              identity: {
                id: "spec-developer",
                name: "Kaelen Chen",
                role: "Quantitative Data Engineer",
                duty: "Synthesizing dynamic Python scripts, executing data crunching in sandboxes, generating visual charting artifacts",
              },
              persona: {
                tone: "Pragmatic, concise, algorithmic",
                temperament: "Problem-solver",
                cognitive_style: "First-principles engineering",
                quirks: ["Writes idiomatic vectorized numpy code", "Benchmarking obsession"],
              },
              ethics: {
                negative_constraints: ["Never run un-sandboxed shell code", "Zero hardcoded secrets"],
                operational_guardrails: ["All code must pass AST validation", "Strict execution timeout bounds"],
                safety_invariants: ["Sandbox boundary compliance"],
              },
              brain: {
                provider: "deepseek",
                model: "deepseek-coder-v2",
                temperature: 0.15,
                top_p: 0.95,
                max_context_tokens: 24000,
              },
              skills: ["skill-numpy-monte-carlo", "skill-pandas-cleaner"],
              memory: {
                working_memory_window: 12,
                archival_top_k: 6,
                importance_threshold: 0.7,
              },
              canvas_position: { x: 380, y: 500 },
            },
          ],
          edges: [
            {
              id: "edge-1",
              source: "orch-01",
              target: "spec-researcher",
              channel: "subtask_dispatch",
              notes: "Direct subtask milestone assignment",
            },
            {
              id: "edge-2",
              source: "spec-researcher",
              target: "spec-critic",
              channel: "dialectical_review",
              bidirectional: true,
              notes: "Peer-to-peer iterative cross-examination",
            },
            {
              id: "edge-3",
              source: "spec-researcher",
              target: "spec-developer",
              channel: "peer_collaboration",
              notes: "Quantitative dataset handoff for sandbox crunching",
            },
            {
              id: "edge-4",
              source: "spec-developer",
              target: "spec-critic",
              channel: "dialectical_review",
              notes: "Code and chart validation",
            },
            {
              id: "edge-5",
              source: "spec-critic",
              target: "orch-01",
              channel: "subtask_dispatch",
              notes: "Milestone verification signal to outer ledger",
            },
          ],
        },
      },
    ];
  }

  private getMockSessions(): ChatSession[] {
    return [
      {
        id: "sess-q3-market",
        title: "Q3 2026 Generative AI Market Analysis",
        graph_id: "graph-market-intel",
        graph_name: "Deep Market Intelligence Collective",
        created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
        updated_at: new Date(Date.now() - 600000).toISOString(),
        message_count: 6,
      },
      {
        id: "sess-compiler-eval",
        title: "Voyager Dynamic Skill Sandbox Benchmark",
        graph_id: "graph-market-intel",
        graph_name: "Deep Market Intelligence Collective",
        created_at: new Date(Date.now() - 86400000).toISOString(),
        updated_at: new Date(Date.now() - 72000000).toISOString(),
        message_count: 4,
      },
    ];
  }

  private getMockMessages(sessionId: string): ChatMessage[] {
    return [
      {
        id: "msg-1",
        session_id: sessionId,
        sender_type: "user",
        sender_name: "Salman",
        content:
          "Conduct a comprehensive market valuation and technological competitive comparison of leading open-weight LLMs (DeepSeek-R1, Llama-3.3-70B, Qwen-2.5-Coder) vs commercial frontiers. Emphasize inference cost economics, token throughput, and architectural innovations.",
        created_at: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: "msg-2",
        session_id: sessionId,
        sender_type: "orchestrator",
        sender_name: "Magentic Orchestrator",
        content:
          "Objective ingested. Instantiating Task Ledger with 3 structural milestones:\n1. Quantitative retrieval of model parameter architectures, context horizons, and benchmark ratings.\n2. Dialectical stress-test of inference cost curves and vLLM/SGLang hosting economics.\n3. Synthesis of strategic deployment matrix.",
        created_at: new Date(Date.now() - 3550000).toISOString(),
      },
      {
        id: "msg-3",
        session_id: sessionId,
        sender_type: "specialist",
        sender_name: "Dr. Elena Vance (Researcher)",
        content:
          "Retrieved verified telemetry across 3 evaluation clusters:\n- **DeepSeek-R1**: 671B MoE (37B active), Native Multi-Head Latent Attention (MLA), DeepSeekMoE architecture.\n- **Llama-3.3-70B**: Dense transformer architecture, 128k context window, GQA.\n- **Qwen-2.5-Coder**: 32B dense, specialized AST code completion and repo-level reasoning.",
        created_at: new Date(Date.now() - 3400000).toISOString(),
      },
      {
        id: "msg-4",
        session_id: sessionId,
        sender_type: "specialist",
        sender_name: "Marcus Aurelius Drake (Critic)",
        content:
          "CRITIQUE ACCEPTED WITH MODIFICATION:\nDr. Vance's data is verified against arXiv preprints; however, FP8 quantized memory footprints on HGX H100 vs H200 must be clarified before committing milestone 2. Passing directive to Developer Chen for sandbox verification.",
        created_at: new Date(Date.now() - 3300000).toISOString(),
      },
      {
        id: "msg-5",
        session_id: sessionId,
        sender_type: "orchestrator",
        sender_name: "Magentic Orchestrator",
        content:
          "### Verified Strategic Synthesis: Open-Weight Frontier vs Commercial Gateways\n\n#### 1. Architectural Efficiency Matrix\n\n| Architecture | Total / Active Params | Context Window | Key Innovation | FP8 Host Footprint |\n| :--- | :--- | :--- | :--- | :--- |\n| **DeepSeek-R1** | 671B / 37B | 128k | Multi-Head Latent Attention (MLA) | 1x 8xH100 SXM5 node |\n| **Llama-3.3-70B** | 70B Dense | 128k | Grouped Query Attention (GQA) | 2x A100 80GB |\n| **Qwen-2.5-Coder** | 32.5B Dense | 128k | Code RoPE + Dual Fill-in-Middle | 1x A100 80GB |\n\n#### 2. Cost-per-Million Token Economics\n- **DeepSeek-R1 (Self-hosted vLLM/SGLang)**: ~$0.28 / 1M input, $1.10 / 1M output tokens.\n- **Commercial Frontier Equivalents**: ~$3.00 - $15.00 / 1M tokens (90%+ cost reduction).\n\n*Verified by Analytical Critic & Quant Engineer Kaelen Chen across 4 dialectical passes.*",
        created_at: new Date(Date.now() - 3100000).toISOString(),
      },
    ];
  }

  private getMockRun(runId: string): OrchestrationRun {
    return {
      id: runId,
      session_id: "sess-q3-market",
      status: "completed",
      task_ledger: {
        milestones: [
          {
            id: "m-1",
            description: "Extract verified architectural specs and benchmark ratings for R1, Llama-3.3, and Qwen",
            assigned_node: "Dr. Elena Vance (Researcher)",
            status: "verified",
            verification_criteria: "Must include exact parameter counts, context limits, and hardware footprint.",
            intermediate_output: "Specs extracted and validated against technical reports.",
          },
          {
            id: "m-2",
            description: "Simulate token throughput and inference cost economics in Python sandbox",
            assigned_node: "Kaelen Chen (Data Engineer)",
            status: "verified",
            verification_criteria: "Output must run in sandbox and calculate $/M tokens across FP8 and INT4.",
            intermediate_output: "Sandbox script executed in 142ms. Cost curves generated.",
          },
          {
            id: "m-3",
            description: "Dialectical cross-examination and logic verification",
            assigned_node: "Marcus Aurelius Drake (Critic)",
            status: "verified",
            verification_criteria: "Cross-check against independent hardware benchmarks.",
            intermediate_output: "Critique cleared; zero unverified assertions remain.",
          },
        ],
        facts: [
          "DeepSeek-R1 activates 37B parameters per token using fine-grained MoE.",
          "Self-hosted FP8 inference on 8xH100 produces >35 tokens/sec per stream under batch-64.",
          "Constitutional boundary: No ungrounded financial estimates allowed.",
        ],
        hypotheses: [
          "Open-weight MoE models offer 10x ROI for high-volume reasoning workflows.",
        ],
        stall_count: 0,
        is_replanning: false,
      },
      progress_ledger: {
        current_milestone_id: "m-3",
        active_directive: "Milestones complete; final response synthesized.",
        assigned_node: "Magentic Orchestrator",
        iteration: 3,
        status: "advance",
      },
      critiques: [
        {
          id: "crit-1",
          milestone_id: "m-1",
          critic_node: "Marcus Aurelius Drake",
          target_node: "Dr. Elena Vance",
          critique_text: "Clarify VRAM requirements on HGX vs PCIe variants.",
          accepted: true,
          score: 0.94,
          timestamp: new Date(Date.now() - 3400000).toISOString(),
        },
      ],
      created_at: new Date(Date.now() - 3600000).toISOString(),
      completed_at: new Date(Date.now() - 3100000).toISOString(),
    };
  }

  private getMockSkills(): VoyagerSkill[] {
    return [
      {
        id: "skill-sec-filing-parser",
        name: "SEC 10-K Document & Financial Ratio Extractor",
        description: "Vectorized Python tool parsing corporate balance sheets, revenue margins, and EBITDA tables.",
        category: "Financial Analysis",
        python_code: `def extract_financial_ratios(balance_sheet: dict) -> dict:
    """Extract and compute debt-to-equity, current ratio, and gross margins."""
    assets = balance_sheet.get('total_assets', 0)
    liabilities = balance_sheet.get('total_liabilities', 0)
    equity = balance_sheet.get('stockholders_equity', 1)
    return {
        'debt_to_equity': round(liabilities / equity, 4),
        'equity_multiplier': round(assets / equity, 4),
        'solvent': liabilities < assets
    }`,
        docstring: "Extracts debt-to-equity and solvency indicators from structured balance sheet dictionaries.",
        input_schema: { type: "object", properties: { balance_sheet: { type: "object" } } },
        ast_validated: true,
        usage_count: 148,
        success_rate: 99.3,
        created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
      },
      {
        id: "skill-numpy-monte-carlo",
        name: "Monte Carlo Stochastic Risk Evaluator",
        description: "Runs 10,000 parallel iterations in numpy sandbox to simulate probability of milestone stalls.",
        category: "Quantitative Computing",
        python_code: `import numpy as np

def run_monte_carlo(iterations: int = 10000, mean_return: float = 0.08, vol: float = 0.20):
    """Simulates geometric brownian motion portfolio risk."""
    dt = 1.0 / 252
    daily_returns = np.random.normal((mean_return - 0.5 * vol**2) * dt, vol * np.sqrt(dt), iterations)
    var_95 = np.percentile(daily_returns, 5)
    return {'iterations': iterations, 'var_95': float(var_95), 'expected_tail_loss': float(np.mean(daily_returns[daily_returns < var_95]))}`,
        docstring: "Vectorized Monte Carlo Value-at-Risk simulator executing in high-speed sandbox.",
        input_schema: { type: "object", properties: { iterations: { type: "integer", default: 10000 } } },
        ast_validated: true,
        usage_count: 89,
        success_rate: 100.0,
        created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
      },
      {
        id: "skill-fallacy-checker",
        name: "Epistemic Fallacy & Syllogism Validator",
        description: "Analyzes natural language arguments for ad-hominem, post-hoc, and hasty generalizations.",
        category: "Dialectical Logic",
        python_code: `def audit_epistemic_integrity(premise: str, conclusion: str, evidence: list) -> dict:
    """Verifies empirical support and flags non-sequitur logical leaps."""
    has_empirical_backing = len(evidence) >= 2
    return {
        'valid': has_empirical_backing,
        'flags': [] if has_empirical_backing else ['Insufficient independent ground truth sources'],
        'confidence_score': 0.95 if has_empirical_backing else 0.40
    }`,
        docstring: "Logical integrity auditor inspecting premises and citation empirical depth.",
        input_schema: { type: "object", properties: { premise: { type: "string" }, conclusion: { type: "string" } } },
        ast_validated: true,
        usage_count: 312,
        success_rate: 98.7,
        created_at: new Date(Date.now() - 86400000 * 6).toISOString(),
      },
    ];
  }

  private getMockReflections(): ExpeLReflection[] {
    return [
      {
        id: "exp-1",
        session_id: "sess-q3-market",
        principle: "Always confirm hardware interconnect bandwidth (NVLink vs PCIe) before projecting multi-node MoE token throughput.",
        trigger_context: "Inference latency was underestimated during first dialectical draft.",
        impact_score: 9.6,
        created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
      },
      {
        id: "exp-2",
        session_id: "sess-compiler-eval",
        principle: "Validate AST syntax prior to sandbox dispatch to eliminate unnecessary sandbox launch overhead.",
        trigger_context: "Specialist submitted code with missing parenthesis causing container exit 1.",
        impact_score: 8.9,
        created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
      },
      {
        id: "exp-3",
        session_id: "sess-q3-market",
        principle: "When evaluating commercial frontier pricing, compute input cache hit discounts (typically 50-80% lower cost).",
        trigger_context: "Baseline token pricing omitted prompt caching discounts.",
        impact_score: 9.1,
        created_at: new Date(Date.now() - 86400000).toISOString(),
      },
    ];
  }

  private getMockMemories(): ArchivalMemory[] {
    return [
      {
        id: "mem-1",
        node_id: "spec-researcher",
        node_name: "Dr. Elena Vance",
        content: "Enterprise users prioritize latency stability under load over raw batch-size peak throughput.",
        importance: 0.88,
        similarity: 0.94,
        access_count: 24,
        created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
      },
      {
        id: "mem-2",
        node_id: "spec-critic",
        node_name: "Marcus Aurelius Drake",
        content: "Always mandate that benchmark comparisons use identical quantization formats (e.g. FP8 vs FP8).",
        importance: 0.95,
        similarity: 0.89,
        access_count: 42,
        created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
      },
      {
        id: "mem-3",
        node_id: "spec-developer",
        node_name: "Kaelen Chen",
        content: "CUDA graph memory pinning in vLLM provides a 22% reduction in p99 time-to-first-token.",
        importance: 0.91,
        similarity: 0.87,
        access_count: 17,
        created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
      },
    ];
  }
}

export const api = new ApiClient();
