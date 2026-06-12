import { createPortal } from "react-dom"
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { IS_TAURI, IS_WINDOWS } from "@/platform/detect"

function useDocTheme() {
  const attr = document.documentElement.getAttribute("data-theme")
  return (attr === "dark" ? "dark" : "light") as ToasterProps["theme"]
}

const TAURI_WIN_TOAST_OFFSET =
  IS_TAURI && IS_WINDOWS
    ? { top: "calc(var(--win-titlebar-height, 36px) + 8px)", right: "16px" }
    : undefined

const Toaster = ({ offset, ...props }: ToasterProps) => {
  const theme = useDocTheme()

  const toaster = (
    <Sonner
      theme={theme}
      className="toaster group"
      offset={offset ?? TAURI_WIN_TOAST_OFFSET}
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
        close: <XIcon className="size-3" strokeWidth={2} />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          zIndex: 99999,
        } as React.CSSProperties
      }
      {...props}
    />
  )

  return createPortal(toaster, document.body)
}

export { Toaster }

