import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ConfirmDialog } from "../components/ConfirmDialog";
import {
  IconRefresh, IconTrash,
  IconChevronDown, IconChevronRight, IconLoader, IconMessageCircle,
  IconPlus, IconSearch,
} from "../icons";
import { queryFeedback, deleteFeedback, teamQueryFeedback, type FeedbackRecord } from "../api/feedbackService";
import { fetchIwhalecloudUserinfoSummary, getDevserviceHost, RD_UNIFIED_PORT } from "../api/rdUnifiedService";

type FilterTab = "all" | "active" | "resolved";
type SortBy = "date" | "status" | "type";

type FeedbackPrefill = {
  mode?: "bug" | "feature";
  title?: string;
  description?: string;
};

type MyFeedbackViewProps = {
  apiBaseUrl: string;
  serviceRunning: boolean;
  onOpenFeedbackModal?: (prefill?: FeedbackPrefill) => void;
  refreshTrigger?: number;
  assignee_id?: string;
};

const STATUS_STYLES: Record<string, { bg: string; text: string; border?: string }> = {
  pending: { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-600 dark:text-gray-400" },
  confirmed: { bg: "bg-orange-50 dark:bg-orange-900/30", text: "text-orange-600 dark:text-orange-400" },
  resolved: { bg: "bg-green-50 dark:bg-green-900/30", text: "text-green-600 dark:text-green-400" },
};

const ACTIVE_STATUSES = ["pending", "confirmed"];
const RESOLVED_STATUSES = ["resolved"];
const STATUS_WEIGHT: Record<string, number> = {
  pending: 1, confirmed: 2, resolved: 3,
};

function statusKey(status: string): string {
  const map: Record<string, string> = {
    pending: "statusPending",
    confirmed: "statusConfirmed",
    resolved: "statusResolved",
  };
  return map[status] ?? "statusPending";
}

export function MyFeedbackView({ apiBaseUrl, serviceRunning, onOpenFeedbackModal, refreshTrigger, assignee_id }: MyFeedbackViewProps) {
  const { t } = useTranslation();
  const [downloadBase, setDownloadBase] = useState("");
  const [records, setRecords] = useState<FeedbackRecord[]>([]);
  const [teamRecords, setTeamRecords] = useState<FeedbackRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamLoading, setTeamLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [primaryTab, setPrimaryTab] = useState<"mine" | "all">("mine");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ mx: number; my: number; dx: number; dy: number }>({ mx: 0, my: 0, dx: 0, dy: 0 });
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canDrag = useRef(false);

  useEffect(() => {
    getDevserviceHost().then((host) => {
      if (host) setDownloadBase(`http://${host}:${RD_UNIFIED_PORT}/dev/iwhalecloud/synapse/feedback/download`);
    }).catch(() => {});
  }, []);

  const fetchRecords = useCallback(async () => {
    let s = assignee_id;
    if (!s) {
      try {
        const info = await fetchIwhalecloudUserinfoSummary(apiBaseUrl);
        s = info.employee_id || "";
      } catch {
        s = "";
      }
    }
    if (!s) return;
    try {
      const data = await queryFeedback(apiBaseUrl, { assignee_id: s });
      setRecords(data);
    } catch {
      // silently fail
    }
  }, [apiBaseUrl, assignee_id]);

  const fetchRecordsRef = useRef(fetchRecords);
  fetchRecordsRef.current = fetchRecords;

  const fetchTeamRecords = useCallback(async () => {
    let s = assignee_id;
    if (!s) {
      try {
        const info = await fetchIwhalecloudUserinfoSummary(apiBaseUrl);
        s = info.employee_id || "";
      } catch { s = ""; }
    }
    if (!s) return;
    setTeamLoading(true);
    try {
      const data = await teamQueryFeedback(apiBaseUrl, { assignee_id: s });
      setTeamRecords(data);
    } catch { /* silently fail */ }
    setTeamLoading(false);
  }, [apiBaseUrl, assignee_id]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    if (primaryTab === "all") {
      await fetchTeamRecords();
    } else {
      await fetchRecords();
    }
    setRefreshing(false);
  }, [fetchRecords, fetchTeamRecords, primaryTab]);

  useEffect(() => {
    if (!serviceRunning) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchRecordsRef.current().then(() => setLoading(false));
    fetchTeamRecords();
  }, [serviceRunning, refreshTrigger]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    let s = assignee_id;
    if (!s) {
      try {
        const info = await fetchIwhalecloudUserinfoSummary(apiBaseUrl);
        s = info.employee_id || "";
      } catch {
        s = "";
      }
    }
    if (!s) return;
    setConfirmDialog({
      message: t("myFeedback.deleteConfirm"),
      onConfirm: async () => {
        try {
          await deleteFeedback(apiBaseUrl, { id, assignee_id: s! });
          setRecords((prev) => prev.filter((r) => r.id !== id));
          setExpandedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
        } catch {
          // silently fail
        }
      },
    });
  }, [apiBaseUrl, t, assignee_id]);

  const stats = useMemo(() => {
    let active = 0, resolved = 0;
    for (const r of records) {
      if (ACTIVE_STATUSES.includes(r.status)) active++;
      if (RESOLVED_STATUSES.includes(r.status)) resolved++;
    }
    return { active, resolved };
  }, [records]);

  const filteredRecords = useMemo(() => {
    let result = records;
    if (filterTab === "active") result = result.filter(r => ACTIVE_STATUSES.includes(r.status));
    else if (filterTab === "resolved") result = result.filter(r => RESOLVED_STATUSES.includes(r.status));

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(r => r.title.toLowerCase().includes(q));
    }

    if (sortBy === "date") {
      result = [...result].sort((a, b) => b.created_at.localeCompare(a.created_at));
    } else if (sortBy === "status") {
      result = [...result].sort((a, b) => {
        const wa = STATUS_WEIGHT[a.status] ?? 9;
        const wb = STATUS_WEIGHT[b.status] ?? 9;
        return wa !== wb ? wa - wb : b.created_at.localeCompare(a.created_at);
      });
    } else if (sortBy === "type") {
      result = [...result].sort((a, b) => {
        if (a.type !== b.type) return a.type === "bug" ? -1 : 1;
        return b.created_at.localeCompare(a.created_at);
      });
    }

    return result;
  }, [records, filterTab, searchQuery, sortBy]);

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) +
        " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    } catch { return iso; }
  };

  const imagePaths = (rec: FeedbackRecord): string[] => {
    if (!rec.images) return [];
    return rec.images.split(",").filter(Boolean);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <IconLoader size={28} className="animate-spin text-muted-foreground/60" />
        <p className="text-muted-foreground text-[13px]">{t("myFeedback.loading")}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <ToggleGroup
          type="single"
          value={primaryTab}
          onValueChange={(v) => { if (v) setPrimaryTab(v as "mine" | "all"); }}
          variant="outline"
        >
          <ToggleGroupItem
            value="mine"
            className="text-sm data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary"
          >
            {t("myFeedback.tabMine")}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="all"
            className="text-sm data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary"
          >
            {t("myFeedback.tabAll")}
          </ToggleGroupItem>
        </ToggleGroup>
        <div className="flex items-center gap-2">
          {onOpenFeedbackModal && (
            <Button
              size="sm"
              onClick={() => onOpenFeedbackModal()}
              className="gap-1.5"
            >
              <IconPlus size={14} />
              {t("myFeedback.submitFeedback")}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={refreshing || !serviceRunning}
            onClick={handleRefresh}
            className="gap-1.5"
          >
            {refreshing
              ? <IconLoader size={14} className="animate-spin" />
              : <IconRefresh size={14} />}
            {t("myFeedback.refresh")}
          </Button>
        </div>
      </div>

      {primaryTab === "all" ? (
        teamLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <IconLoader size={28} className="animate-spin text-muted-foreground/60" />
            <p className="text-muted-foreground text-[13px]">{t("myFeedback.loading")}</p>
          </div>
        ) : teamRecords.length === 0 ? (
          <div className="text-center py-16">
            <IconMessageCircle size={40} className="mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground text-[15px]">{t("myFeedback.teamEmpty")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {teamRecords.map((rec) => {
              const isExpanded = expandedIds.has(rec.id);
              const style = STATUS_STYLES[rec.status] ?? STATUS_STYLES.pending;
              return (
                <div key={rec.id} className="rounded-lg border border-border overflow-hidden">
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => toggleExpand(rec.id)}
                  >
                    <div className="shrink-0">
                      {isExpanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                    </div>
                    <Badge
                      variant="secondary"
                      className={`text-[11px] px-1.5 py-0 shrink-0 font-medium ${
                        rec.type === "bug"
                          ? "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                          : "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                      }`}
                    >
                      {rec.type === "bug" ? "bug" : "需求"}
                    </Badge>
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <span className="text-[14px] font-medium truncate">{rec.title}</span>
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap ml-auto">
                        {formatDate(rec.created_at)}
                      </span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">{rec.assignee_name || rec.assignee_id}</span>
                    <Badge
                      variant="secondary"
                      className={`text-[11px] px-2 py-0.5 ${style.bg} ${style.text} ${style.border ?? ""}`}
                    >
                      {t(`myFeedback.${statusKey(rec.status)}`)}
                    </Badge>
                  </div>
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-3 border-t border-border bg-muted/20 space-y-2.5">
                      <div className="bg-background rounded-lg border border-border p-3">
                        <p className="text-[11px] text-muted-foreground font-medium mb-1.5">{t("myFeedback.description")}</p>
                        <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{rec.description}</p>
                      </div>
                      {rec.steps && (
                        <div className="bg-background rounded-lg border border-border p-3">
                          <p className="text-[11px] text-muted-foreground font-medium mb-1.5">{t("myFeedback.steps")}</p>
                          <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{rec.steps}</p>
                        </div>
                      )}
                      {(rec.contact_email || rec.contact_wechat) && (
                        <div className="bg-background rounded-lg border border-border p-3">
                          <p className="text-[11px] text-muted-foreground font-medium mb-1.5">{t("myFeedback.contact")}</p>
                          <div className="text-[13px] leading-relaxed space-y-0.5">
                            {rec.contact_email && <p>邮箱：{rec.contact_email}</p>}
                            {rec.contact_wechat && <p>微信号：{rec.contact_wechat}</p>}
                          </div>
                        </div>
                      )}
                      {(() => {
                        const imgs = rec.images ? rec.images.split(",").filter(Boolean) : [];
                        if (imgs.length === 0) return null;
                        return (
                          <div className="bg-background rounded-lg border border-border p-3" onClick={(e) => e.stopPropagation()}>
                            <p className="text-[11px] text-muted-foreground font-medium mb-2">{t("myFeedback.imageFile")}</p>
                            <div className="flex flex-col gap-2">
                              {imgs.map((p, i) => {
                                const src = downloadBase ? `${downloadBase}/${p}` : undefined;
                                return (
                                  <img key={i} src={src} alt={`screenshot-${i}`}
                                    className="max-w-[400px] rounded border border-border cursor-pointer hover:opacity-90 transition-opacity"
                                    onClick={() => { if (src) setLightboxSrc(src); }} />
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : records.length === 0 ? (
        <div className="text-center py-16">
          <IconMessageCircle size={40} className="mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground text-[15px]">{t("myFeedback.empty")}</p>
          <p className="text-muted-foreground/60 text-[13px] mt-1">{t("myFeedback.emptyHint")}</p>
        </div>
      ) : (
        <>
          {/* Filter tabs */}
          <div className="flex gap-2 mb-3">
            <ToggleGroup
              type="single"
              value={filterTab}
              onValueChange={(v) => { if (v) setFilterTab(v as FilterTab); }}
              variant="outline"
            >
              {([
                ["all", t("myFeedback.filterAll"), records.length],
                ["active", t("myFeedback.filterActive"), stats.active],
                ["resolved", t("myFeedback.filterResolved"), stats.resolved],
              ] as [FilterTab, string, number][]).map(([tab, label, count]) => (
                <ToggleGroupItem
                  key={tab}
                  value={tab}
                  className="text-sm min-w-[4.5rem] data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary"
                >
                  {label}
                  <Badge
                    variant="secondary"
                    className={
                      filterTab === tab
                        ? "ml-1.5 px-1.5 py-0 text-[11px] min-w-[1.25rem] justify-center rounded-full bg-white/25 text-primary-foreground"
                        : "ml-1.5 px-1.5 py-0 text-[11px] min-w-[1.25rem] justify-center rounded-full bg-foreground/10 text-foreground/60"
                    }
                  >
                    {count}
                  </Badge>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          {/* Search + Sort row */}
          <div className="flex items-center gap-2 mb-2">
            <div className="relative flex-1">
              <IconSearch size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", opacity: 0.4, pointerEvents: "none" }} />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("myFeedback.searchPlaceholder")}
                className="pl-8"
              />
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[13px] text-muted-foreground whitespace-nowrap">{t("myFeedback.sortLabel")}:</span>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
                <SelectTrigger size="sm" className="min-w-[5rem]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">{t("myFeedback.sortDate")}</SelectItem>
                  <SelectItem value="status">{t("myFeedback.sortStatus")}</SelectItem>
                  <SelectItem value="type">{t("myFeedback.sortType")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            {filteredRecords.map((rec) => {
              const isExpanded = expandedIds.has(rec.id);
              const style = STATUS_STYLES[rec.status] ?? STATUS_STYLES.pending;

              return (
                <div key={rec.id} className="rounded-lg border border-border overflow-hidden">
                  {/* Card header */}
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => toggleExpand(rec.id)}
                  >
                    <div className="shrink-0">
                      {isExpanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                    </div>
                    <Badge
                      variant="secondary"
                      className={`text-[11px] px-1.5 py-0 shrink-0 font-medium ${
                        rec.type === "bug"
                          ? "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                          : "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                      }`}
                    >
                      {rec.type === "bug" ? "bug" : "需求"}
                    </Badge>
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <span className="text-[14px] font-medium truncate">{rec.title}</span>
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap ml-auto">
                        {formatDate(rec.created_at)}
                      </span>
                    </div>
                    <Badge
                      variant="secondary"
                      className={`text-[11px] px-2 py-0.5 ${style.bg} ${style.text} ${style.border ?? ""}`}
                    >
                      {t(`myFeedback.${statusKey(rec.status)}`)}
                    </Badge>
                    <IconTrash
                      size={14}
                      className="shrink-0 cursor-pointer text-muted-foreground/40 hover:text-destructive transition-colors"
                      onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleDelete(rec.id); }}
                    />
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-3 border-t border-border bg-muted/20 space-y-2.5">
                      {/* Description */}
                      <div className="bg-background rounded-lg border border-border p-3">
                        <p className="text-[11px] text-muted-foreground font-medium mb-1.5">{t("myFeedback.description")}</p>
                        <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{rec.description}</p>
                      </div>

                      {/* Steps (if bug) */}
                      {rec.steps && (
                        <div className="bg-background rounded-lg border border-border p-3">
                          <p className="text-[11px] text-muted-foreground font-medium mb-1.5">{t("myFeedback.steps")}</p>
                          <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{rec.steps}</p>
                        </div>
                      )}

                      {/* Contact */}
                      {(rec.contact_email || rec.contact_wechat) && (
                        <div className="bg-background rounded-lg border border-border p-3">
                          <p className="text-[11px] text-muted-foreground font-medium mb-1.5">{t("myFeedback.contact")}</p>
                          <div className="text-[13px] leading-relaxed space-y-0.5">
                            {rec.contact_email && <p>邮箱：{rec.contact_email}</p>}
                            {rec.contact_wechat && <p>微信号：{rec.contact_wechat}</p>}
                          </div>
                        </div>
                      )}

                      {/* Images */}
                      {(() => {
                        const imgs = imagePaths(rec);
                        if (imgs.length === 0) return null;
                        return (
                          <div
                            className="bg-background rounded-lg border border-border p-3"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <p className="text-[11px] text-muted-foreground font-medium mb-2">{t("myFeedback.imageFile")}</p>
                            <div className="flex flex-col gap-2">
                              {imgs.map((p, i) => {
                                const src = downloadBase ? `${downloadBase}/${p}` : undefined;
                                return (
                                  <img
                                    key={i}
                                    src={src}
                                    alt={`screenshot-${i}`}
                                    className="max-w-[400px] rounded border border-border cursor-pointer hover:opacity-90 transition-opacity"
                                    onClick={() => { if (src) setLightboxSrc(src); }}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />

      {/* Lightbox */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center overflow-hidden select-none"
          style={{ cursor: dragging ? "grabbing" : canDrag.current ? "grab" : "pointer" }}
          onMouseDown={(e) => {
            canDrag.current = false;
            dragStart.current = { mx: e.clientX, my: e.clientY, dx: drag.x, dy: drag.y };
            holdTimer.current = setTimeout(() => {
              canDrag.current = true;
              setDragging(true);
            }, 200);
            e.stopPropagation();
          }}
          onMouseMove={(e) => {
            if (!dragging || !canDrag.current) return;
            setDrag({
              x: dragStart.current.dx + e.clientX - dragStart.current.mx,
              y: dragStart.current.dy + e.clientY - dragStart.current.my,
            });
          }}
          onMouseUp={() => {
            if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
            if (!canDrag.current) {
              setLightboxSrc(null); setZoom(1); setDrag({ x: 0, y: 0 });
            }
            setDragging(false);
            canDrag.current = false;
          }}
          onMouseLeave={() => {
            if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
            setDragging(false);
            canDrag.current = false;
          }}
          onWheel={(e) => {
            e.stopPropagation();
            setZoom((z) => Math.min(5, Math.max(0.2, z - e.deltaY * 0.001)));
          }}
        >
          <div
            className="max-w-[calc(100vw-260px)] max-h-[95vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightboxSrc}
              alt="preview"
              className="rounded shadow-xl"
              style={{
                transform: `scale(${zoom}) translate(${drag.x / zoom}px, ${drag.y / zoom}px)`,
                transformOrigin: "center center",
              }}
              draggable={false}
            />
          </div>
        </div>
      )}
    </div>
  );
}
