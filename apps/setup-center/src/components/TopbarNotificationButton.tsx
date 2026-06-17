import { useTranslation } from "react-i18next";
import { Bell } from "lucide-react";
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
  onNavigate?: (view: ViewId) => void;
};

export function TopbarNotificationButton({
  unreadFeedbackCount = 0,
  pendingApprovalsCount = 0,
  onNavigate,
}: TopbarNotificationButtonProps) {
  const { t } = useTranslation();
  const totalCount = unreadFeedbackCount + pendingApprovalsCount;
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
      <DropdownMenuContent align="end" className="min-w-[220px]">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {t("topbar.notificationsTitle")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
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
