/**
 * Same-origin API prefix. In Docker/nginx and local Next rewrites,
 * all backend routes are exposed under `/api/*` on the current host.
 * Override only for unusual setups: NEXT_PUBLIC_API_URL=https://other-host/api
 */
const API_BASE =
  (typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "")) ||
  "/api";

export type User = {
  id: string;
  username: string;
  display_name: string;
  role: string;
  is_active?: boolean;
  permissions?: string[];
};

export type Tip = {
  id: string;
  title: string;
  body: string;
  category: string;
  author_id: string;
  author_name: string;
  created_at: string;
  updated_at: string;
};

export type Task = {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  created_by: string;
  created_by_name: string;
  assigned_to: string | null;
  assigned_to_name: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskComment = {
  id: string;
  task_id: string;
  author_id: string;
  author_name: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  is_system?: boolean;
};

export type TaskEvent = {
  id: string;
  task_id: string;
  actor_id: string;
  actor_name: string;
  event_type: string;
  detail: string;
  created_at: string;
};

export type TicketFile = {
  id: string;
  ticket_id: string;
  filename: string;
  stored_path: string;
  content_type: string | null;
  size: number;
  created_at: string;
};

export type Ticket = {
  id: string;
  submitter_name: string;
  workplace: string;
  body: string;
  status: "open" | "fixed" | "converted" | string;
  converted_task_id: string | null;
  handled_by: string | null;
  handled_by_name?: string | null;
  created_at: string;
  updated_at: string;
  files: TicketFile[];
};

export type TaskGroup = {
  id: string;
  name: string;
  leader_id: string;
  leader_name: string;
  created_by: string;
  created_by_name: string;
  created_at: string;
  member_count?: number;
  members?: Array<{
    id: string;
    username: string;
    display_name: string;
    role: string;
  }>;
};

export type TaskFile = {
  id: string;
  task_id: string;
  uploader_id: string;
  uploader_name: string;
  entry_id: string;
  filename: string;
  created_at: string;
  open_url: string;
  chunks_indexed?: number;
};

export type PerformancePeriod = "week" | "month" | "year" | "total";

export type PerformanceRow = {
  user_id: string;
  display_name: string;
  username: string;
  role: string;
  completed: number;
  in_progress: number;
  pending: number;
  assigned_total: number;
  actions: number;
  completion_rate: number;
  tickets_handled?: number;
  tickets_fixed?: number;
  tickets_converted?: number;
  period?: string;
};

function authHeaders(token?: string | null): HeadersInit {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...authHeaders(token),
      ...options.headers,
    },
  });

  if (!res.ok) {
    let detail = "حدث خطأ في الطلب";
    try {
      const data = await res.json();
      detail = data.detail || detail;
      if (Array.isArray(detail)) detail = detail.map((d: { msg: string }) => d.msg).join("، ");
    } catch {
      /* ignore */
    }
    throw new Error(typeof detail === "string" ? detail : "حدث خطأ في الطلب");
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  health: () =>
    request<{ status: string; chunks_indexed: number; db_entries: number }>(
      "/health",
    ),

  login: (username: string, password: string) =>
    request<{ access_token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  me: (token: string) => request<User>("/auth/me", {}, token),

  activity: {
    list: (
      token: string,
      params?: { limit?: number; offset?: number; category?: string; action?: string },
    ) => {
      const q = new URLSearchParams();
      if (params?.limit) q.set("limit", String(params.limit));
      if (params?.offset) q.set("offset", String(params.offset));
      if (params?.category) q.set("category", params.category);
      if (params?.action) q.set("action", params.action);
      const qs = q.toString();
      return request<{
        items: Array<{
          id: string;
          created_at: string;
          action: string;
          category: string;
          detail: string;
          username: string | null;
          user_id: string | null;
          ip_address: string;
          resource_type: string | null;
          resource_id: string | null;
          actor_label: string;
        }>;
        total: number;
        limit: number;
        offset: number;
      }>(`/activity${qs ? `?${qs}` : ""}`, {}, token);
    },
  },

  roles: {
    list: (token: string) =>
      request<{
        roles: Array<{
          role: string;
          label?: string;
          permissions: string[];
          is_system?: boolean;
          is_custom: boolean;
          defaults: string[];
        }>;
        catalog: Array<{ code: string; label: string }>;
      }>("/auth/roles", {}, token),
    create: (
      token: string,
      body: { code: string; label: string; permissions?: string[] },
    ) =>
      request<{
        role: string;
        label: string;
        permissions: string[];
        message: string;
      }>("/auth/roles", { method: "POST", body: JSON.stringify(body) }, token),
    remove: (token: string, role: string) =>
      request<{ status: string; role: string }>(
        `/auth/roles/${role}`,
        { method: "DELETE" },
        token,
      ),
    update: (token: string, role: string, permissions: string[]) =>
      request<{ role: string; permissions: string[]; message: string }>(
        `/auth/roles/${role}/permissions`,
        { method: "PUT", body: JSON.stringify({ permissions }) },
        token,
      ),
    reset: (token: string, role: string) =>
      request<{ role: string; permissions: string[]; message: string }>(
        `/auth/roles/${role}/reset`,
        { method: "POST" },
        token,
      ),
  },

  users: {
    list: (token: string) => request<User[]>("/auth/users", {}, token),
    create: (
      token: string,
      body: {
        username: string;
        display_name: string;
        password: string;
        role: string;
      },
    ) =>
      request<User>(
        "/auth/users",
        { method: "POST", body: JSON.stringify(body) },
        token,
      ),
    update: (
      token: string,
      id: string,
      body: {
        display_name?: string;
        role?: string;
        is_active?: boolean;
      },
    ) =>
      request<User>(
        `/auth/users/${id}`,
        { method: "PATCH", body: JSON.stringify(body) },
        token,
      ),
    setPassword: (token: string, id: string, password: string) =>
      request<{ status: string }>(
        `/auth/users/${id}/password`,
        { method: "POST", body: JSON.stringify({ password }) },
        token,
      ),
  },

  tips: {
    list: (token?: string | null) => request<Tip[]>("/tips", {}, token),
    create: (
      token: string,
      body: { title: string; body: string; category: string },
    ) =>
      request<Tip>(
        "/tips",
        { method: "POST", body: JSON.stringify(body) },
        token,
      ),
    remove: (token: string, id: string) =>
      request<{ status: string }>(`/tips/${id}`, { method: "DELETE" }, token),
  },

  assistant: {
    chat: (body: {
      message: string;
      history?: Array<{ role: "user" | "assistant"; content: string }>;
    }) =>
      request<{
        reply: string;
        sources: Array<{ title: string; uri: string }>;
      }>("/assistant/chat", { method: "POST", body: JSON.stringify(body) }),
  },

  tasks: {
    list: (token: string, params?: { status?: string; mine?: boolean }) => {
      const q = new URLSearchParams();
      if (params?.status) q.set("status", params.status);
      if (params?.mine) q.set("mine", "true");
      const qs = q.toString();
      return request<Task[]>(`/tasks${qs ? `?${qs}` : ""}`, {}, token);
    },
    get: (token: string, id: string) =>
      request<Task>(`/tasks/${id}`, {}, token),
    create: (
      token: string,
      body: {
        title: string;
        description?: string;
        priority?: string;
        assigned_to?: string | null;
        due_date?: string | null;
      },
    ) =>
      request<Task>(
        "/tasks",
        { method: "POST", body: JSON.stringify(body) },
        token,
      ),
    setStatus: (token: string, id: string, status: string) =>
      request<Task>(
        `/tasks/${id}/status`,
        { method: "PATCH", body: JSON.stringify({ status }) },
        token,
      ),
    transfer: (token: string, id: string, assigned_to: string) =>
      request<Task>(
        `/tasks/${id}/transfer`,
        { method: "POST", body: JSON.stringify({ assigned_to }) },
        token,
      ),
    comments: (token: string, id: string) =>
      request<TaskComment[]>(`/tasks/${id}/comments`, {}, token),
    addComment: (
      token: string,
      id: string,
      body: { body: string; parent_id?: string | null },
    ) =>
      request<TaskComment>(
        `/tasks/${id}/comments`,
        { method: "POST", body: JSON.stringify(body) },
        token,
      ),
    files: (token: string, id: string) =>
      request<TaskFile[]>(`/tasks/${id}/files`, {}, token),
    uploadFile: async (token: string, id: string, file: File) => {
      const form = new FormData();
      form.append("file", file);
      return request<TaskFile>(
        `/tasks/${id}/files`,
        { method: "POST", body: form },
        token,
      );
    },
    events: (token: string, id: string) =>
      request<TaskEvent[]>(`/tasks/${id}/events`, {}, token),
  },

  tickets: {
    submit: async (body: {
      submitter_name: string;
      workplace: string;
      body: string;
      files?: File[];
    }) => {
      const form = new FormData();
      form.append("submitter_name", body.submitter_name);
      form.append("workplace", body.workplace);
      form.append("body", body.body);
      for (const f of body.files || []) {
        form.append("files", f);
      }
      return request<{ status: string; message: string }>("/tickets", {
        method: "POST",
        body: form,
      });
    },
    list: (token: string, status?: string) => {
      const q = status ? `?status=${encodeURIComponent(status)}` : "";
      return request<Ticket[]>(`/tickets${q}`, {}, token);
    },
    counts: (token: string) =>
      request<Record<string, number>>("/tickets/counts", {}, token),
    get: (token: string, id: string) =>
      request<Ticket>(`/tickets/${id}`, {}, token),
    setStatus: (token: string, id: string, status: "open" | "fixed") =>
      request<Ticket>(
        `/tickets/${id}/status`,
        { method: "PATCH", body: JSON.stringify({ status }) },
        token,
      ),
    remove: (token: string, id: string) =>
      request<{ status: string }>(
        `/tickets/${id}`,
        { method: "DELETE" },
        token,
      ),
    convert: (
      token: string,
      id: string,
      body?: {
        assigned_to?: string | null;
        priority?: string;
        title?: string;
      },
    ) =>
      request<{
        ticket: Ticket;
        task: {
          id: string;
          title: string;
          assigned_to: string | null;
          assigned_to_name: string | null;
        };
      }>(
        `/tickets/${id}/convert`,
        { method: "POST", body: JSON.stringify(body || {}) },
        token,
      ),
    fileUrl: (ticketId: string, fileId: string) =>
      `${API_BASE}/tickets/${ticketId}/files/${fileId}`,
  },

  taskGroups: {
    list: (token: string) =>
      request<TaskGroup[]>("/task-groups", {}, token),
    get: (token: string, id: string) =>
      request<TaskGroup>(`/task-groups/${id}`, {}, token),
    create: (
      token: string,
      body: { name: string; leader_id: string; member_ids?: string[] },
    ) =>
      request<TaskGroup>(
        "/task-groups",
        { method: "POST", body: JSON.stringify(body) },
        token,
      ),
    update: (
      token: string,
      id: string,
      body: {
        name?: string;
        leader_id?: string;
        member_ids?: string[];
      },
    ) =>
      request<TaskGroup>(
        `/task-groups/${id}`,
        { method: "PATCH", body: JSON.stringify(body) },
        token,
      ),
    remove: (token: string, id: string) =>
      request<{ status: string }>(
        `/task-groups/${id}`,
        { method: "DELETE" },
        token,
      ),
  },

  performance: {
    summary: (token: string, period: PerformancePeriod = "total") =>
      request<PerformanceRow[]>(
        `/performance/summary?period=${period}`,
        {},
        token,
      ),
    ticketsOverview: (token: string) =>
      request<{ open: number; fixed: number; converted: number }>(
        "/performance/tickets-overview",
        {},
        token,
      ),
  },

  documents: {
    entries: (token: string) =>
      request<{ total: number; entries: Array<Record<string, unknown>> }>(
        "/entries",
        {},
        token,
      ),
    search: (token: string, query: string, top_k = 5) =>
      request<{
        results: Array<{
          filename: string;
          score: number;
          source_id: string;
          open_url: string;
          entry_type: string;
        }>;
      }>(
        "/search",
        {
          method: "POST",
          body: JSON.stringify({ query, top_k }),
        },
        token,
      ),
    ingestFile: async (token: string, file: File) => {
      const form = new FormData();
      form.append("file", file);
      return request<{
        filename: string;
        chunks_indexed: number;
        source_id: string;
      }>("/ingest", { method: "POST", body: form }, token);
    },
    ingestText: (token: string, text: string, filename: string) =>
      request("/ingest/text", {
        method: "POST",
        body: JSON.stringify({ text, filename }),
      }, token),
    checkSimilarity: (token: string, text: string, threshold = 0.8) =>
      request<{
        is_duplicate: boolean;
        max_score: number;
        suggested_corrections: string[];
        similar_documents: Array<{
          filename: string;
          score: number;
          suggested_text: string;
          open_url: string;
        }>;
      }>(
        "/check-similarity",
        {
          method: "POST",
          body: JSON.stringify({ text, threshold }),
        },
        token,
      ),
    openEntry: async (token: string, openUrl: string, filename?: string) => {
      const res = await fetch(`${API_BASE}${openUrl}`, {
        headers: authHeaders(token),
      });
      if (!res.ok) {
        throw new Error("تعذر فتح الملف");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noreferrer";
      if (filename) a.download = "";
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke later so the tab can load
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
  },

  openUrl: (path: string) => `${API_BASE}${path}`,

  virus: {
    scanFile: async (file: File, token?: string | null) => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_BASE}/v3/files`, {
        method: "POST",
        headers: token ? authHeaders(token) : {},
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data?.error?.message || data?.detail || "فشل فحص الملف",
        );
      }
      return data as {
        data: { id: string; type: string; links?: { self?: string } };
      };
    },
    scanUrl: async (url: string, token?: string | null) => {
      const res = await fetch(`${API_BASE}/v3/urls`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? authHeaders(token) : {}),
        },
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data?.error?.message || data?.detail || "فشل فحص الرابط",
        );
      }
      return data as {
        data: { id: string; type: string; links?: { self?: string } };
      };
    },
    getAnalysis: async (analysisId: string, token?: string | null) => {
      const res = await fetch(
        `${API_BASE}/v3/analyses/${encodeURIComponent(analysisId)}`,
        { headers: token ? authHeaders(token) : {} },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data?.error?.message || data?.detail || "فشل جلب نتيجة الفحص",
        );
      }
      return data as VirusAnalysis;
    },
    history: (token: string, limit = 50, verdict?: string) => {
      const q = new URLSearchParams({ limit: String(limit) });
      if (verdict) q.set("verdict", verdict);
      return request<{
        success: boolean;
        message: string;
        data: VirusHistoryItem[];
      }>(`/internal/history?${q}`, {}, token);
    },
    statistics: (token: string) =>
      request<{
        success: boolean;
        data: {
          total_scans: number;
          infected: number;
          suspicious: number;
          clean: number;
          queued: number;
        };
      }>("/internal/history/statistics", {}, token),
  },

  logs: {
    analyze: async (token: string, file: File) => {
      const form = new FormData();
      form.append("file", file);
      return request<LogAnalyzeResponse>(
        "/log-analyzer/analyze",
        { method: "POST", body: form },
        token,
      );
    },
    list: (token: string, limit = 50) =>
      request<{ reports: LogReportMeta[] }>(
        `/log-analyzer/reports?limit=${limit}`,
        {},
        token,
      ),
    get: (token: string, id: string) =>
      request<LogReportDetail>(`/log-analyzer/reports/${id}`, {}, token),
  },
};

export type VirusVerdictSummary = {
  verdict: "clean" | "suspicious" | "infected" | string;
  malicious: number;
  suspicious: number;
  harmless: number;
  undetected: number;
  total_engines: number;
  safety_percentage: number;
};

export type VirusEngineResult = {
  engine_name: string;
  has_virus: boolean | null;
  status_ar: string;
  malware_name: string | null;
};

export type VirusAnalysis = {
  data: {
    id: string;
    type: string;
    attributes: {
      status: string;
      stats?: Record<string, number>;
      results?: Record<string, { category?: string; result?: string }>;
    };
  };
  verdict_summary?: VirusVerdictSummary;
  engines_results?: VirusEngineResult[];
  vt_link?: string;
};

export type VirusHistoryItem = {
  id: number;
  scan_type: string;
  target: string;
  analysis_id: string;
  status: string;
  verdict: string | null;
  malicious: number;
  suspicious: number;
  harmless: number;
  total_engines: number;
  vt_link: string | null;
  created_at: string;
  completed_at: string | null;
};

export type LogReportMeta = {
  id: string;
  user_id: string;
  filename: string;
  created_at: string;
};

export type LogReport = {
  summary: {
    total_events: number;
    errors: number;
    warnings: number;
    critical_findings: number;
    unique_ips: number;
    time_range: { start: string; end: string } | null;
    level_counts: Record<string, number>;
  };
  findings: Array<{
    severity: string;
    title: string;
    description: string;
    event_ids: number[];
    count: number;
    mitre: string;
  }>;
  timeline: Array<{
    bucket: string;
    count: number;
    by_level: Record<string, number>;
  }>;
  top_event_ids: Array<{ id: number; count: number; name: string }>;
  top_accounts: Array<{ account: string; count: number }>;
  top_sources: Array<{ source: string; count: number }>;
  attacker_actions: Array<{
    time: string;
    action: string;
    actor: string;
    target: string;
    severity: string;
    event_id?: number | null;
  }>;
  ips: Array<{
    ip: string;
    related_events: number;
    geo: {
      country?: string;
      countryCode?: string;
      city?: string;
      lat?: number | null;
      lon?: number | null;
      isp?: string;
      private?: boolean;
    };
    vt_malicious?: number | null;
    vt_suspicious?: number | null;
    vt_reputation?: number | null;
    vt_as_owner?: string | null;
  }>;
  geo: Array<{
    country: string;
    lat?: number | null;
    lon?: number | null;
    count: number;
  }>;
  filename?: string;
};

export type LogAnalyzeResponse = {
  id: string;
  filename: string;
  report: LogReport;
};

export type LogReportDetail = {
  id: string;
  user_id: string;
  filename: string;
  created_at: string;
  report: LogReport;
};
