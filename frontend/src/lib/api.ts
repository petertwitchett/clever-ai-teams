import {
  GraphSummary,
  GraphDSL,
  ChatSession,
  ChatMessage,
  OrchestrationRun,
  VoyagerSkill,
  ExpeLReflection,
  ArchivalMemory,
  PersonNodeManifest,
  User,
  TaskLedger,
  ProgressLedger,
  DialecticalCritique,
} from "./types";

const DEFAULT_API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" && window.location.origin
    ? `${window.location.origin}/api/v1`
    : "https://app-912ec933-b93b-4612-b0f3-89d1351070b9.cleverapps.io/api/v1");

class ApiClient {
  private baseUrl: string = DEFAULT_API_BASE;
  private token: string | null = null;
  private authPromise: Promise<string> | null = null;

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

  /**
   * Acquire a valid platform access token if none exists in localStorage.
   */
  public async ensureAuth(): Promise<string> {
    if (this.token) return this.token;

    if (this.authPromise) return this.authPromise;

    this.authPromise = (async () => {
      try {
        const res = await fetch(`${this.baseUrl}/auth/demo-token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.access_token) {
            this.setToken(data.access_token);
            return data.access_token;
          }
        }
      } catch (err: any) {
        console.warn("Auto-provisioning session token failed:", err?.message || err);
      } finally {
        this.authPromise = null;
      }
      return "";
    })();

    return this.authPromise;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retryCount = 0
  ): Promise<T> {
    await this.ensureAuth();

    const url = `${this.baseUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const res = await fetch(url, { ...options, headers });

    // Handle token expiration / 401 unauthenticated
    if (res.status === 401 && retryCount === 0) {
      this.setToken(null);
      await this.ensureAuth();
      return this.request<T>(endpoint, options, 1);
    }

    if (!res.ok) {
      const errorText = await res.text();
      let errorMsg = `API Error (${res.status}): ${errorText || res.statusText}`;
      try {
        const parsed = JSON.parse(errorText);
        if (parsed.detail) {
          errorMsg = typeof parsed.detail === "string" ? parsed.detail : JSON.stringify(parsed.detail);
        } else if (parsed.error?.message) {
          errorMsg = parsed.error.message;
        }
      } catch {}
      throw new Error(errorMsg);
    }

    return (await res.json()) as T;
  }

  // --- Health ---
  async getHealth() {
    const root = this.baseUrl.replace(/\/api\/v1\/?$/, "");
    const res = await fetch(`${root}/health`);
    return await res.json();
  }

  // --- Auth ---
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

  // --- Graphs (Canvas Teams) ---
  async getGraphs(): Promise<GraphSummary[]> {
    const res = await this.request<{ items: any[]; total: number }>("/graphs?limit=50");
    const summaries: GraphSummary[] = [];

    // For each graph, fetch full detail so DSL is immediately available
    for (const item of res.items || []) {
      try {
        const detail = await this.getGraph(item.id);
        summaries.push(detail);
      } catch {
        summaries.push({
          id: item.id,
          name: item.name,
          description: item.description || "",
          is_compiled: item.status === "compiled",
          is_published: item.is_public || false,
          node_count: item.node_count || 0,
          edge_count: item.edge_count || 0,
          created_at: item.created_at,
          updated_at: item.updated_at,
        });
      }
    }
    return summaries;
  }

  async getGraph(id: string): Promise<GraphSummary> {
    const g = await this.request<any>(`/graphs/${id}`);
    const dsl = g.dsl || {};
    const nodes = g.nodes || [];
    const edges = g.edges || [];

    const orchNode = nodes.find((n: any) => n.node_type === "orchestrator");
    const specialistNodes = nodes.filter((n: any) => n.node_type !== "orchestrator");

    const normalizedDSL: GraphDSL = {
      version: dsl.dsl_version || "1.0",
      name: g.name,
      description: g.description || "",
      orchestrator: {
        node_id: orchNode?.id || "orchestrator",
        name: orchNode?.display_name || "Atlas",
        duty: orchNode?.primary_duty || "Decompose goals, dispatch subtasks, synthesize final answers.",
        brain: {
          provider: orchNode?.llm_provider || "openai",
          model: orchNode?.llm_model || "o1-preview",
          temperature: orchNode?.temperature ?? 0.3,
          top_p: orchNode?.top_p ?? 1.0,
          max_context_tokens: orchNode?.max_tokens || 32000,
        },
        stall_threshold: g.stall_limit || 3,
        canvas_position: { x: 420, y: 60 },
      },
      nodes: specialistNodes.map((n: any, idx: number) => ({
        identity: {
          id: n.id,
          name: n.display_name,
          role: n.professional_role,
          duty: n.primary_duty,
        },
        persona: {
          tone: n.persona_traits?.tone || "Analytical",
          temperament: n.persona_traits?.temperament || "Methodical",
          cognitive_style: n.persona_traits?.cognitive_style || "Systematic",
          quirks: n.persona_traits?.quirks || [],
        },
        ethics: {
          negative_constraints: n.constitutional_constraints || [],
          operational_guardrails: [],
          safety_invariants: [],
        },
        brain: {
          provider: n.llm_provider || "anthropic",
          model: n.llm_model || "claude-3-5-sonnet",
          temperature: n.temperature ?? 0.5,
          top_p: n.top_p ?? 1.0,
          max_context_tokens: n.max_tokens || 16000,
        },
        skills: n.assigned_skill_ids || [],
        memory: {
          working_memory_window: n.working_memory_window || 10,
          archival_top_k: n.memory_retrieval_k || 5,
          importance_threshold: 0.5,
        },
        canvas_position: {
          x: 100 + (idx % 3) * 340,
          y: 280 + Math.floor(idx / 3) * 260,
        },
      })),
      edges: edges.map((e: any, idx: number) => ({
        id: e.id || `edge-${idx}`,
        source: e.source_node_id || e.source,
        target: e.target_node_id || e.target,
        channel: e.channel,
        bidirectional: e.bidirectional,
        notes: e.conditions ? JSON.stringify(e.conditions) : undefined,
      })),
    };

    return {
      id: g.id,
      name: g.name,
      description: g.description || "",
      is_compiled: g.status === "compiled",
      is_published: g.is_public || false,
      node_count: nodes.length,
      edge_count: edges.length,
      created_at: g.created_at,
      updated_at: g.updated_at,
      dsl: normalizedDSL,
    };
  }

  async createGraph(dsl: GraphDSL): Promise<GraphSummary> {
    const payload = {
      name: dsl.name,
      description: dsl.description,
      is_public: true,
      dsl: {
        dsl_version: dsl.version,
        metadata: { name: dsl.name, description: dsl.description },
        orchestrator: {
          node_key: "orchestrator",
          stall_limit: dsl.orchestrator?.stall_threshold || 3,
          max_steps: 20,
        },
        nodes: [
          {
            key: "orchestrator",
            node_type: "orchestrator",
            identity: {
              display_name: dsl.orchestrator?.name || "Atlas",
              professional_role: "Team Orchestrator",
              primary_duty: dsl.orchestrator?.duty || "Decompose goals",
            },
            persona: { tone: "decisive", temperament: "calm", cognitive_style: "strategic" },
            ethics: { absolute_constraints: [] },
            brain: {
              provider: dsl.orchestrator?.brain?.provider,
              model: dsl.orchestrator?.brain?.model,
              temperature: dsl.orchestrator?.brain?.temperature ?? 0.3,
            },
          },
          ...dsl.nodes.map((n) => ({
            key: n.identity.id || n.identity.name.toLowerCase().replace(/\s+/g, "_"),
            node_type: n.identity.role.toLowerCase().includes("critic")
              ? "critic"
              : n.identity.role.toLowerCase().includes("dev")
              ? "developer"
              : "researcher",
            identity: {
              display_name: n.identity.name,
              professional_role: n.identity.role,
              primary_duty: n.identity.duty,
            },
            persona: n.persona,
            ethics: { absolute_constraints: n.ethics?.negative_constraints || [] },
            brain: {
              provider: n.brain?.provider,
              model: n.brain?.model,
              temperature: n.brain?.temperature ?? 0.5,
            },
          })),
        ],
        edges: dsl.edges.map((e) => ({
          source: e.source,
          target: e.target,
          channel: e.channel,
          bidirectional: e.bidirectional || false,
        })),
      },
    };

    const res = await this.request<any>("/graphs", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return await this.getGraph(res.id);
  }

  async validateGraph(dsl: GraphDSL): Promise<{ valid: boolean; errors?: string[] }> {
    return await this.request<{ valid: boolean; errors?: string[] }>("/graphs/validate", {
      method: "POST",
      body: JSON.stringify(dsl),
    });
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

  // --- Sessions (Chat) ---
  async getSessions(): Promise<ChatSession[]> {
    const res = await this.request<{ items: any[]; total: number }>("/sessions?limit=50");
    return (res.items || []).map((s: any) => ({
      id: s.id,
      title: s.title || "Strategy Session",
      graph_id: s.graph_id,
      created_at: s.created_at,
      updated_at: s.last_message_at || s.created_at,
      message_count: 0,
    }));
  }

  async createSession(graphId: string, title?: string): Promise<ChatSession> {
    const res = await this.request<any>("/sessions", {
      method: "POST",
      body: JSON.stringify({ graph_id: graphId, title: title || "New Strategy Session" }),
    });
    return {
      id: res.id,
      title: res.title,
      graph_id: res.graph_id,
      created_at: res.created_at,
      updated_at: res.last_message_at || res.created_at,
      message_count: 0,
    };
  }

  async getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
    const res = await this.request<{ items: any[]; total: number }>(`/sessions/${sessionId}/messages?limit=100`);
    return (res.items || []).map((m: any) => {
      let senderType: ChatMessage["sender_type"] = "specialist";
      if (m.role === "user") senderType = "user";
      else if (m.role === "orchestrator") senderType = "orchestrator";
      else if (m.role === "system") senderType = "system";

      return {
        id: m.id,
        session_id: m.session_id,
        sender_type: senderType,
        sender_name: m.role.toUpperCase(),
        content: m.content,
        created_at: m.created_at,
        run_id: m.run_id,
        metadata: m.structured_data,
      };
    });
  }

  async sendMessage(
    sessionId: string,
    content: string
  ): Promise<{ run_id: string; message_id: string }> {
    const res = await this.request<any>(`/chat/${sessionId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content, stream: false }),
    });
    return {
      run_id: res.id,
      message_id: res.user_message_id || res.id,
    };
  }

  async getRun(runId: string): Promise<OrchestrationRun> {
    const r = await this.request<any>(`/chat/runs/${runId}`);

    const taskLedger: TaskLedger = {
      milestones: (r.task_ledger?.milestones || []).map((m: any) => ({
        id: m.id || m.title || "m",
        description: m.description || m.title || "Milestone Directive",
        status: m.status || "pending",
        assigned_node: m.assigned_node || "Specialist",
        verification_criteria: m.verification_criteria || "",
      })),
      facts: r.task_ledger?.facts || r.task_ledger?.verified_facts || [],
      hypotheses: r.task_ledger?.hypotheses || r.task_ledger?.working_hypotheses || [],
      stall_count: r.task_ledger?.stall_count || 0,
      is_replanning: r.task_ledger?.is_replanning || false,
    };

    const progressLedger: ProgressLedger = {
      current_milestone_id: r.progress_ledger?.current_milestone_id || null,
      active_directive: r.progress_ledger?.active_directive || r.progress_ledger?.active_subtask || null,
      assigned_node: r.progress_ledger?.assigned_node || r.progress_ledger?.assigned_to || null,
      iteration: r.step_count || r.progress_ledger?.iteration || 1,
      status: r.status === "running" ? "executing" : "idle",
    };

    const critiques: DialecticalCritique[] = (r.progress_ledger?.critiques || []).map((c: any, idx: number) => ({
      id: c.id || `crit-${idx}`,
      milestone_id: c.milestone_id || "m1",
      critic_node: c.critic_node || "Critic",
      target_node: c.target_node || "Specialist",
      critique_text: c.critique_text || c.critique || "",
      accepted: c.accepted !== undefined ? c.accepted : true,
      score: c.score || 95,
      timestamp: c.timestamp || new Date().toISOString(),
    }));

    return {
      id: r.id,
      session_id: r.session_id,
      status: r.status,
      task_ledger: taskLedger,
      progress_ledger: progressLedger,
      critiques,
      final_result: typeof r.result === "string" ? r.result : JSON.stringify(r.result),
      created_at: r.created_at,
      completed_at: r.completed_at,
    };
  }

  async getSessionRuns(sessionId: string): Promise<OrchestrationRun[]> {
    const res = await this.request<{ items: any[]; total: number }>(`/sessions/${sessionId}/runs?limit=10`);
    const runs: OrchestrationRun[] = [];
    for (const r of res.items || []) {
      runs.push(await this.getRun(r.id));
    }
    return runs;
  }

  // --- Skills (Voyager Python Sandbox) ---
  async getSkills(): Promise<VoyagerSkill[]> {
    const res = await this.request<{ items: any[]; total: number }>("/skills?limit=50");
    return (res.items || []).map((s: any) => ({
      id: s.id,
      name: s.name,
      description: s.description || "",
      category: s.node_id ? "Specialist Tool" : "Global Catalog",
      python_code: s.code || "",
      docstring: s.description || "",
      input_schema: s.parameters_schema || {},
      ast_validated: s.status !== "rejected",
      usage_count: s.usage_count || 0,
      success_rate: s.usage_count > 0 ? Math.round((s.success_count / s.usage_count) * 100) : 100,
      created_at: s.created_at,
    }));
  }

  async executeSkill(
    skillId: string,
    args: Record<string, any>
  ): Promise<{ output: string; exit_code: number; execution_time_ms: number }> {
    const res = await this.request<any>(`/skills/${skillId}/execute`, {
      method: "POST",
      body: JSON.stringify({ arguments: args }),
    });
    return {
      output: typeof res.result === "object" ? JSON.stringify(res.result, null, 2) : String(res.result || res.stdout || ""),
      exit_code: res.success ? 0 : 1,
      execution_time_ms: Math.round(res.duration_ms || 0),
    };
  }

  // --- Post-Mortems (ExpeL Experiential Reflection) ---
  async getPostMortems(): Promise<ExpeLReflection[]> {
    const res = await this.request<{ items: any[]; total: number }>("/post-mortems?limit=50");
    return (res.items || []).map((p: any) => ({
      id: p.id,
      session_id: p.run_id,
      principle: p.result?.heuristic || `Analyzed execution trace ${p.run_id.slice(0, 8)} (${p.status})`,
      trigger_context: `Post-Mortem Run: ${p.run_id} • ${p.attempts} attempt(s) • Lessons: ${p.lessons_extracted}`,
      impact_score: p.skills_compiled > 0 ? 98 : 85,
      created_at: p.created_at,
    }));
  }

  async drainPostMortems(): Promise<{ detail: string }> {
    return await this.request<{ detail: string }>("/post-mortems/drain", {
      method: "POST",
    });
  }

  // --- Personas (All Specialist & Orchestrator Nodes) ---
  async getPersonas(graphId?: string): Promise<PersonNodeManifest[]> {
    const endpoint = graphId ? `/personas/by-graph/${graphId}` : "/personas";
    const nodes = await this.request<any[]>(endpoint);
    return (nodes || []).map((n: any, idx: number) => ({
      identity: {
        id: n.id,
        name: n.display_name,
        role: n.professional_role,
        duty: n.primary_duty,
      },
      persona: {
        tone: n.persona_traits?.tone || "Analytical",
        temperament: n.persona_traits?.temperament || "Methodical",
        cognitive_style: n.persona_traits?.cognitive_style || "Systematic",
        quirks: n.persona_traits?.quirks || [],
      },
      ethics: {
        negative_constraints: n.constitutional_constraints || [],
        operational_guardrails: [],
        safety_invariants: [],
      },
      brain: {
        provider: n.llm_provider || "anthropic",
        model: n.llm_model || "claude-3-5-sonnet",
        temperature: n.temperature ?? 0.5,
        top_p: n.top_p ?? 1.0,
        max_context_tokens: n.max_tokens || 16000,
      },
      skills: n.assigned_skill_ids || [],
      memory: {
        working_memory_window: n.working_memory_window || 10,
        archival_top_k: n.memory_retrieval_k || 5,
        importance_threshold: 0.5,
      },
      canvas_position: {
        x: n.position_x || 100 + (idx % 3) * 340,
        y: n.position_y || 280 + Math.floor(idx / 3) * 260,
      },
    }));
  }

  // --- Memory (Tiered Semantic Archival Memory) ---
  async getMemories(nodeId?: string): Promise<ArchivalMemory[]> {
    const endpoint = nodeId ? `/memory/nodes/${nodeId}` : "/memory";
    const res = await this.request<{ items: any[]; total: number }>(endpoint);
    return (res.items || []).map((m: any) => ({
      id: m.id,
      node_id: m.node_id,
      node_name: m.memory_type ? `Type: ${m.memory_type}` : undefined,
      content: m.content,
      importance: m.importance || 0.85,
      similarity: m.importance || 0.9,
      access_count: m.access_count || 1,
      created_at: m.created_at,
    }));
  }

  async searchMemory(query: string, nodeId?: string): Promise<ArchivalMemory[]> {
    // If a node_id is provided, use semantic similarity endpoint
    if (nodeId) {
      const hits = await this.request<any[]>(`/memory/nodes/${nodeId}/search`, {
        method: "POST",
        body: JSON.stringify({ query, top_k: 10 }),
      });
      return (hits || []).map((h: any) => ({
        id: h.memory.id,
        node_id: h.memory.node_id,
        content: h.memory.content,
        importance: h.memory.importance || 0.8,
        similarity: h.similarity,
        access_count: h.memory.access_count || 1,
        created_at: h.memory.created_at,
      }));
    }

    // Otherwise list all memories and filter by text
    const all = await this.getMemories();
    const q = query.toLowerCase();
    return all.filter((m) => m.content.toLowerCase().includes(q));
  }
}

export const api = new ApiClient();
