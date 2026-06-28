export type InboxPriority = "low" | "normal" | "high" | "critical" | string;

export type InboxCategory = "system" | "meeting" | "approval" | "all";

export type InboxAction =
  | { kind: "open_meeting"; room_id: string; scope_type?: string; scope_id?: string }
  | { kind: "open_approval"; pending_id: string };

export type InboxMessage = {
  id: string;
  title: string;
  body_markdown: string;
  type: "notice" | "update" | "security" | "activity" | "tip" | string;
  priority: InboxPriority;
  category?: InboxCategory | string;
  action?: InboxAction;
  cta?: {
    label?: string | null;
    url?: string | null;
    [key: string]: unknown;
  } | null;
  target_rule?: Record<string, unknown>;
  rollout_percent?: number;
  publish_at?: string | null;
  expire_at?: string | null;
  source?: string;
  raw?: Record<string, unknown>;
  received_at?: string;
  read_at?: string | null;
  clicked_at?: string | null;
  dismissed_at?: string | null;
};

export type InboxCategoryStats = {
  total: number;
  unread: number;
};

export type InboxListResponse = {
  messages: InboxMessage[];
  unread_count: number;
  categories?: Partial<Record<InboxCategory, InboxCategoryStats>>;
};

export type InboxWsMessagePayload = {
  id?: string;
  title?: string;
  priority?: InboxPriority;
};

export type InboxUpdatePayload = {
  message_id?: string;
  title?: string;
  version?: string | null;
  manifest_url?: string | null;
  force_upgrade?: boolean;
  min_supported_version?: string | null;
  policy?: "prompt" | "forced_after_delay" | "forced_now" | string;
};

export function inboxPriorityRank(priority: InboxPriority | null | undefined): number {
  const value = String(priority || "").toLowerCase();
  if (value === "critical") return 4;
  if (value === "high") return 3;
  if (value === "normal") return 2;
  if (value === "low") return 1;
  return 0;
}

export function isHighPriorityInbox(priority: InboxPriority | null | undefined): boolean {
  return inboxPriorityRank(priority) >= 3;
}

export function resolveInboxCategory(message: InboxMessage): InboxCategory {
  const category = String(message.category || message.raw?._category || "").toLowerCase();
  if (category === "meeting" || category === "approval" || category === "system") {
    return category;
  }
  if (message.id.startsWith("virtual:meeting:")) return "meeting";
  if (message.id.startsWith("virtual:approval:")) return "approval";
  return "system";
}

export function isInboxUnread(message: InboxMessage): boolean {
  const category = resolveInboxCategory(message);
  if (category === "meeting" || category === "approval") return true;
  return !message.read_at && !message.dismissed_at;
}

/** Inbox 分段控制器：单一互斥选项，仅一个「全部」 */
export type InboxSegment = "all" | "important" | "normal" | "update" | "meeting" | "approval";

/** 统一服务 event_type：重要 | 一般 | 升级；非 system 消息返回 null */
export function resolveSystemEventType(
  message: InboxMessage,
): "重要" | "一般" | "升级" | null {
  if (resolveInboxCategory(message) !== "system") return null;
  const rawType = String(message.raw?.event_type || "").trim();
  if (rawType === "重要" || rawType === "一般" || rawType === "升级") {
    return rawType;
  }
  if (String(message.type || "").toLowerCase() === "update") return "升级";
  if (isHighPriorityInbox(message.priority)) return "重要";
  return "一般";
}

export function matchesInboxSegment(message: InboxMessage, segment: InboxSegment): boolean {
  if (segment === "all") return true;
  const category = resolveInboxCategory(message);
  if (segment === "meeting") return category === "meeting";
  if (segment === "approval") return category === "approval";
  if (category !== "system") return false;
  const eventType = resolveSystemEventType(message);
  if (segment === "important") return eventType === "重要";
  if (segment === "normal") return eventType === "一般";
  if (segment === "update") return eventType === "升级";
  return true;
}
