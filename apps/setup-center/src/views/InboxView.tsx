import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  BellRing,
  CheckCheck,
  ClipboardCheck,
  ExternalLink,
  Inbox,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Users,
} from "lucide-react";
import { safeFetch } from "../providers";
import { openExternalUrl } from "../platform";
import type { MeetingRoomListItem } from "../api/meetingRoomService";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { INBOX_REFRESH_EVENT, INBOX_UNREAD_CHANGED_EVENT } from "../components/InboxBadge";
import { useMdModules } from "./chat/hooks/useMdModules";
import type { InboxListResponse, InboxMessage, InboxSegment } from "../inboxTypes";
import {
  isHighPriorityInbox,
  isInboxUnread,
  matchesInboxSegment,
  resolveInboxCategory,
  resolveSystemEventType,
} from "../inboxTypes";

const SEGMENTS: InboxSegment[] = ["all", "important", "normal", "update", "meeting", "approval"];

type InboxViewProps = {
  apiBaseUrl: string;
  serviceRunning: boolean;
  refreshKey?: number;
  onUnreadChange?: (count: number) => void;
  onOpenMeetingRoom?: (item: MeetingRoomListItem) => void;
  onOpenApproval?: (pendingId: string) => void;
};

function formatDate(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function messageIcon(message: InboxMessage) {
  const category = resolveInboxCategory(message);
  if (category === "meeting") return <Users size={18} />;
  if (category === "approval") return <ClipboardCheck size={18} />;
  const type = String(message.type || "").toLowerCase();
  if (type === "security") return <ShieldAlert size={18} />;
  if (type === "update") return <RefreshCw size={18} />;
  if (isHighPriorityInbox(message.priority)) return <AlertTriangle size={18} />;
  return <BellRing size={18} />;
}

function segmentLabel(
  t: (key: string) => string,
  segment: InboxSegment,
): string {
  if (segment === "all") return t("inbox.filterAll");
  if (segment === "important") return t("inbox.filterImportant");
  if (segment === "normal") return t("inbox.filterNormal");
  if (segment === "update") return t("inbox.filterUpdates");
  if (segment === "meeting") return t("inbox.segmentMeeting");
  return t("inbox.segmentApproval");
}

function messageMetaLabel(
  t: (key: string) => string,
  message: InboxMessage,
): string {
  const category = resolveInboxCategory(message);
  if (category === "meeting") return t("inbox.segmentMeeting");
  if (category === "approval") return t("inbox.segmentApproval");
  return resolveSystemEventType(message) || t("inbox.filterNormal");
}

export function InboxView({
  apiBaseUrl,
  serviceRunning,
  refreshKey = 0,
  onUnreadChange,
  onOpenMeetingRoom,
  onOpenApproval,
}: InboxViewProps) {
  const { t } = useTranslation();
  const mdModules = useMdModules();
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [segment, setSegment] = useState<InboxSegment>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const publishUnread = useCallback((count: number) => {
    const next = Math.max(0, count);
    setUnreadCount(next);
    onUnreadChange?.(next);
    window.dispatchEvent(
      new CustomEvent(INBOX_UNREAD_CHANGED_EVENT, {
        detail: { unreadCount: next },
      }),
    );
  }, [onUnreadChange]);

  const fetchMessages = useCallback(async (showLoading = false) => {
    if (!serviceRunning) {
      setMessages([]);
      publishUnread(0);
      setLoading(false);
      return;
    }
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const resp = await safeFetch(`${apiBaseUrl}/api/inbox/messages`, {
        signal: AbortSignal.timeout(10_000),
      });
      const data: InboxListResponse = await resp.json();
      const nextMessages = Array.isArray(data.messages) ? data.messages : [];
      setMessages(nextMessages);
      publishUnread(Number(data.unread_count || 0));
      setSelectedId((current) => {
        if (current && nextMessages.some((message) => message.id === current)) return current;
        return nextMessages[0]?.id || null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [apiBaseUrl, publishUnread, serviceRunning]);

  useEffect(() => {
    void fetchMessages(true);
  }, [fetchMessages, refreshKey]);

  useEffect(() => {
    const onRefresh = () => { void fetchMessages(false); };
    window.addEventListener(INBOX_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(INBOX_REFRESH_EVENT, onRefresh);
  }, [fetchMessages]);

  const segmentStats = useMemo(() => {
    const stats = {} as Record<InboxSegment, { total: number; unread: number }>;
    for (const key of SEGMENTS) {
      stats[key] = { total: 0, unread: 0 };
    }
    for (const message of messages) {
      for (const key of SEGMENTS) {
        if (!matchesInboxSegment(message, key)) continue;
        stats[key].total += 1;
        if (isInboxUnread(message)) stats[key].unread += 1;
      }
    }
    stats.all.unread = unreadCount;
    return stats;
  }, [messages, unreadCount]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return messages.filter((message) => {
      if (!matchesInboxSegment(message, segment)) return false;
      if (!normalizedQuery) return true;
      return (
        String(message.title || "").toLowerCase().includes(normalizedQuery) ||
        String(message.body_markdown || "").toLowerCase().includes(normalizedQuery)
      );
    });
  }, [messages, query, segment]);

  const selected = useMemo(() => {
    if (!selectedId) return filtered[0] || messages[0] || null;
    return messages.find((message) => message.id === selectedId) || filtered[0] || null;
  }, [filtered, messages, selectedId]);

  const refreshNow = useCallback(async () => {
    if (!serviceRunning || refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      await safeFetch(`${apiBaseUrl}/api/inbox/refresh`, { method: "POST" });
      await fetchMessages(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  }, [apiBaseUrl, fetchMessages, refreshing, serviceRunning]);

  const markRead = useCallback(async (message: InboxMessage) => {
    if (!message?.id || !isInboxUnread(message)) return;
    if (resolveInboxCategory(message) !== "system") return;
    setBusyId(`read:${message.id}`);
    try {
      const resp = await safeFetch(
        `${apiBaseUrl}/api/inbox/messages/${encodeURIComponent(message.id)}/read`,
        { method: "POST" },
      );
      const data = await resp.json();
      if (typeof data?.unread_count === "number") publishUnread(data.unread_count);
      await fetchMessages(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }, [apiBaseUrl, fetchMessages, publishUnread]);

  const handleSelect = useCallback((message: InboxMessage) => {
    setSelectedId(message.id);
    if (resolveInboxCategory(message) === "system") {
      void markRead(message);
    }
  }, [markRead]);

  const handlePrimaryAction = useCallback(async (message: InboxMessage) => {
    const category = resolveInboxCategory(message);
    const action = message.action || (message.raw?.action as InboxMessage["action"]);
    if (category === "meeting" && action?.kind === "open_meeting") {
      onOpenMeetingRoom?.({
        room_id: action.room_id,
        scope_type: (action.scope_type as MeetingRoomListItem["scope_type"]) || "demand",
        scope_id: action.scope_id || action.room_id,
        ticket_id: action.scope_id || action.room_id,
        ticket_title: message.title,
        branch: "",
        stage_id: 0,
        stage_name: "",
        current_node_id: "",
        current_node_name: "",
        local_process_state: "",
        status: "human_intervention",
        pipeline_enabled: true,
        meeting_room_active: true,
      });
      return;
    }
    if (category === "approval" && action?.kind === "open_approval") {
      onOpenApproval?.(action.pending_id);
      return;
    }
    const url = message.cta?.url;
    if (typeof url === "string" && url.trim()) {
      await openExternalUrl(url);
    }
  }, [onOpenApproval, onOpenMeetingRoom]);

  if (!serviceRunning) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="max-w-sm text-center">
          <Inbox size={36} className="mx-auto mb-3 text-muted-foreground/35" />
          <h2 className="text-base font-semibold">{t("inbox.serviceNotRunning")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("inbox.serviceNotRunningHint")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`inboxView${unreadCount > 0 ? " inboxView--hasPending" : ""}`}>
      <div className="inboxHero">
        <div className="inboxHeroGlow" aria-hidden />
        <div className="inboxHeroContent">
          <div>
            <h1 className="inboxTitle">{t("inbox.title")}</h1>
            <p className="inboxSubtitle">{t("inbox.description")}</p>
          </div>
          <div className="inboxHeroStats">
            <div className="inboxHeroStat">
              <span className="inboxHeroStatValue">{unreadCount}</span>
              <span className="inboxHeroStatLabel">{t("inbox.pendingCount")}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="inboxToolbar inboxControlBar">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={segment}
          onValueChange={(value) => {
            if (value) setSegment(value as InboxSegment);
          }}
          className="inboxSegmentToggle min-w-0 flex-1 flex-wrap justify-start"
          aria-label={t("inbox.segmentLabel")}
        >
          {SEGMENTS.map((item) => {
            const stat = segmentStats[item];
            const hasUnread = (stat?.unread || 0) > 0;
            return (
              <ToggleGroupItem
                key={item}
                value={item}
                className={`inboxSegmentToggleItem h-8 gap-1.5 px-3 text-xs data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground${hasUnread ? " inboxSegmentToggleItemPending" : ""}`}
              >
                <span>{segmentLabel(t, item)}</span>
                {(stat?.unread || 0) > 0 && (
                  <Badge variant="secondary" className="inboxFilterCount">{stat.unread}</Badge>
                )}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="inboxRefreshBtn h-8 shrink-0 gap-1.5 px-3 text-xs"
          onClick={() => { void refreshNow(); }}
          disabled={refreshing}
        >
          {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {t("inbox.refresh")}
        </Button>
      </div>

      <div className="inboxToolbar">
        <div className="relative min-w-[220px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/55" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("inbox.searchPlaceholder")}
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      {error && (
        <div className="inboxError">
          <AlertTriangle size={14} />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex flex-1 items-center justify-center py-16 text-muted-foreground">
          <Loader2 size={24} className="mr-2 animate-spin" />
          {t("common.loading")}
        </div>
      ) : messages.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-16">
          <div className="text-center">
            <Inbox size={40} className="mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">{t("inbox.empty")}</p>
          </div>
        </div>
      ) : (
        <div className="inboxLayout">
          <div className="inboxList">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">{t("inbox.noResults")}</div>
            ) : filtered.map((message) => {
              const selectedRow = selected?.id === message.id;
              const unread = isInboxUnread(message);
              const category = resolveInboxCategory(message);
              const important = isHighPriorityInbox(message.priority) || category !== "system";
              return (
                <button
                  key={message.id}
                  data-slot="inbox-list-item"
                  className={`inboxListItem${selectedRow ? " inboxListItemActive" : ""}${unread ? " inboxListItemUnread" : ""}`}
                  onClick={() => handleSelect(message)}
                >
                  <span className={`inboxListIcon${important ? " inboxListIconHot" : ""}`}>
                    {messageIcon(message)}
                  </span>
                  <span className="inboxListBody">
                    <span className="inboxListTop">
                      <span className="inboxListTitle">{message.title || t("inbox.untitled")}</span>
                      {unread && <span className="inboxUnreadDot inboxUnreadDotPulse" />}
                    </span>
                    <span className="inboxListMeta">
                      {messageMetaLabel(t, message)}
                      {message.publish_at && <span>·</span>}
                      {message.publish_at && <span>{formatDate(message.publish_at)}</span>}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <Card className="inboxDetail">
            {selected ? (
              <CardContent className="flex min-h-0 flex-1 flex-col p-0">
                <div className="inboxDetailHeader">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{messageMetaLabel(t, selected)}</Badge>
                      {resolveInboxCategory(selected) === "system" && isHighPriorityInbox(selected.priority) && (
                        <Badge variant="destructive">{t("inbox.priorityHigh")}</Badge>
                      )}
                    </div>
                    <h2 className="inboxDetailTitle">{selected.title || t("inbox.untitled")}</h2>
                    <p className="inboxDetailTime">
                      {formatDate(selected.publish_at || selected.received_at || null)}
                      {selected.expire_at ? ` · ${t("inbox.expiresAt", { time: formatDate(selected.expire_at) })}` : ""}
                    </p>
                  </div>
                </div>

                <div className="inboxDetailBody">
                  {mdModules ? (
                    <div className="feedbackMdContent inboxMarkdown">
                      <mdModules.ReactMarkdown
                        remarkPlugins={mdModules.remarkPlugins}
                        rehypePlugins={mdModules.rehypePlugins}
                      >
                        {selected.body_markdown || t("inbox.emptyBody")}
                      </mdModules.ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap text-sm leading-7">{selected.body_markdown || t("inbox.emptyBody")}</p>
                  )}
                </div>

                <div className="inboxDetailFooter">
                  {resolveInboxCategory(selected) === "system" && isInboxUnread(selected) && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyId === `read:${selected.id}`}
                      onClick={() => markRead(selected)}
                    >
                      <CheckCheck size={14} />
                      {t("inbox.markRead")}
                    </Button>
                  )}
                  <Button onClick={() => handlePrimaryAction(selected)}>
                    <ExternalLink size={14} />
                    {resolveInboxCategory(selected) === "meeting"
                      ? t("inbox.openMeeting")
                      : resolveInboxCategory(selected) === "approval"
                        ? t("inbox.openApproval")
                        : selected.cta?.label || t("inbox.openLink")}
                  </Button>
                </div>
              </CardContent>
            ) : (
              <CardContent className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                {t("inbox.selectMessage")}
              </CardContent>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
