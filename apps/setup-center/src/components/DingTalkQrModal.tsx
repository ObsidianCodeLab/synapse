import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import dingtalkQrUrl from "../assets/qrcode.png";

export function DingTalkQrModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("sidebar.dingtalkQr", "钉钉群")}</DialogTitle>
        </DialogHeader>
        <p className="text-center text-sm font-medium text-foreground/80">
          智能研发助手Synapse使用交流群 钉钉群号：174735022344
        </p>
        <div className="flex items-center justify-center pt-2 pb-4">
          <img
            src={dingtalkQrUrl}
            alt="钉钉群二维码"
            className="w-full max-w-[280px] rounded-lg"
          />
        </div>
        <p className="text-center text-xs text-muted-foreground">
          {t("sidebar.dingtalkQrHint", "打开钉钉扫一扫加入群聊")}
        </p>
      </DialogContent>
    </Dialog>
  );
}
