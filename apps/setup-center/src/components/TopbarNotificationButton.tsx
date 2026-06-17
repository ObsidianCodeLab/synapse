import { useTranslation } from "react-i18next";
import { Bell } from "lucide-react";
import type { MeetingRoomListItem } from "../api/meetingRoomService";
import type { ViewId } from "../types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type TopbarNotificationButtonProps = {
  unreadFeedbackCount?: number;
  pendingApprovalsCount?: number;
  pendingHumanInterventions?: MeetingRoomListItem[];
  onNavigate?: (view: ViewId) => void;
  onOpenMeetingRoom?: (item: MeetingRoomListItem) => void;
};

export function TopbarNotificationButton({
  unreadFeedbackCount = 0,
  pendingApprovalsCount = 0,
  pendingHumanInterventions = [],
  onNavigate,
  onOpenMeetingRoom,
}: TopbarNotificationButtonProps) {
  const { t } = useTranslation();
  const pendingHitlCount = pendingHumanInterventions.length;
  const totalCount = unreadFeedbackCount + pendingApprovalsCount + pendingHitlCount;
  const hasUnread = totalCount > 0;

  const badgeLabel = totalCount > 99 ? "99+" : String(totalCount);

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex shrink-0">
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className={`topbarNotifyBtn${hasUnread ? " topbarNotifyBtn--active" : ""}`}
                aria-label={t("topbar.notifications", { count: totalCount })}
              >
                <span className="topbarNotifyBtnInner">
                  <Bell size={16} className="topbarNotifyBell" />
                  {hasUnread && (
                    <span className="topbarNotifyBadge" aria-hidden>
                      {badgeLabel}
                    </span>
                  )}
                </span>
              </Button>
            </DropdownMenuTrigger>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {hasUnread
            ? t("topbar.notificationsUnread", { count: totalCount })
            : t("topbar.notificationsEmpty")}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="min-w-[260px] max-w-[320px]">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {t("topbar.notificationsTitle")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {pendingHitlCount > 0 && (
          <>
            <DropdownMenuLabel className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 py-1">
              {t("topbar.notificationsMeetingHitl", { count: pendingHitlCount })}
            </DropdownMenuLabel>
            {pendingHumanInterventions.slice(0, 8).map((item) => (
              <DropdownMenuItem
                key={item.room_id}
                className="gap-2 text-xs flex-col items-start py-2"
                onClick={() => onOpenMeetingRoom?.(item)}
              >
                <span className="font-medium truncate w-full" title={item.ticket_title || item.scope_id}>
                  {item.ticket_title || item.scope_id}
                </span>
              </DropdownMenuItem>
            ))}
            {pendingHitlCount > 8 && (
              <DropdownMenuItem
                className="text-xs text-muted-foreground"
                onClick={() => onNavigate?.("workbench_meeting")}
              >
                {t("topbar.notificationsMeetingHitlMore", { count: pendingHitlCount - 8 })}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem
          className="gap-2 text-xs justify-between"
          disabled={pendingApprovalsCount === 0}
          onClick={() => onNavigate?.("pending_approvals")}
        >
          <span>{t("sidebar.pendingApprovals", { defaultValue: "待审批" })}</span>
          {pendingApprovalsCount > 0 && (
            <span className="topbarNotifyMenuCount">{pendingApprovalsCount}</span>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2 text-xs justify-between"
          disabled={unreadFeedbackCount === 0}
          onClick={() => onNavigate?.("my_feedback")}
        >
          <span>{t("sidebar.myFeedback", { defaultValue: "我的反馈" })}</span>
          {unreadFeedbackCount > 0 && (
            <span className="topbarNotifyMenuCount">{unreadFeedbackCount}</span>
          )}
        </DropdownMenuItem>
        {!hasUnread && (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              {t("topbar.notificationsEmpty")}
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
