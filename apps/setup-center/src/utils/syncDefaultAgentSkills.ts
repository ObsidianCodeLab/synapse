/**
 * 仅更新 default（小鲸）人设：skills_mode=inclusive + skills 列表。
 * 不写 data/skills.json；工作区外部技能池仍由「能力 → 技能」维护。
 */
import { invoke, IS_TAURI } from "@/platform";
import { safeFetch } from "@/providers";

const DEFAULT_PROFILE_RELPATH = "data/agents/profiles/default.json";

/** 读取小鲸人设中已勾选的外部技能 id（用于向导内展示，与全局 enabled 解耦）。 */
export async function fetchDefaultProfileSkillIds(opts: {
  apiBaseUrl: string;
  serviceRunning: boolean;
  workspaceId: string | null;
  dataMode?: "local" | "remote";
}): Promise<string[]> {
  const { apiBaseUrl, serviceRunning, workspaceId, dataMode = "local" } = opts;
  const base = String(apiBaseUrl || "").replace(/\/$/, "");

  if (serviceRunning && base) {
    try {
      const res = await safeFetch(`${base}/api/agents/profiles?include_hidden=true`, {
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { profiles?: { id: string; skills?: string[] }[] };
      const p = (data.profiles || []).find((x) => x.id === "default");
      if (p?.skills && Array.isArray(p.skills)) return [...p.skills];
    } catch {
      /* 回退 Tauri */
    }
  }

  if (IS_TAURI && dataMode !== "remote" && workspaceId) {
    try {
      const raw = await invoke<string>("workspace_read_file", {
        workspaceId,
        relativePath: DEFAULT_PROFILE_RELPATH,
      });
      const data = JSON.parse(raw || "{}") as { id?: string; skills?: string[] };
      if (data.id === "default" && Array.isArray(data.skills)) return [...data.skills];
    } catch {
      /* 无文件 */
    }
  }
  return [];
}

export async function syncDefaultAgentInclusiveSkills(opts: {
  skillIds: string[];
  apiBaseUrl: string;
  serviceRunning: boolean;
  workspaceId: string | null;
  dataMode?: "local" | "remote";
}): Promise<void> {
  const { skillIds, apiBaseUrl, serviceRunning, workspaceId, dataMode = "local" } = opts;
  const base = String(apiBaseUrl || "").replace(/\/$/, "");

  if (serviceRunning && base) {
    try {
      const res = await safeFetch(`${base}/api/agents/profiles/default`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skills: skillIds, skills_mode: "inclusive" }),
        signal: AbortSignal.timeout(12_000),
      });
      if (res.ok) return;
    } catch {
      /* 多 Agent 未开启或网络失败时改走工作区文件 */
    }
  }

  if (IS_TAURI && dataMode !== "remote" && workspaceId) {
    try {
      const raw = await invoke<string>("workspace_read_file", {
        workspaceId,
        relativePath: DEFAULT_PROFILE_RELPATH,
      });
      const data = JSON.parse(raw || "{}") as Record<string, unknown>;
      if (data.id !== "default") return;
      data.skills_mode = "inclusive";
      data.skills = skillIds;
      await invoke("workspace_write_file", {
        workspaceId,
        relativePath: DEFAULT_PROFILE_RELPATH,
        content: JSON.stringify(data, null, 2) + "\n",
      });
    } catch {
      /* 无 default.json 时忽略 */
    }
  }
}
