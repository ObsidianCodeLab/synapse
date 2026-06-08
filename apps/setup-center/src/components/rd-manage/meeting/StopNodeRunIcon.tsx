import React from 'react';

type StopNodeRunIconProps = {
  className?: string;
};

/** 终止节点运行：外圈 + 较大红色实心方块（比 Lucide CircleStop 更易辨认） */
export function StopNodeRunIcon({ className = 'h-5 w-5' }: StopNodeRunIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="9.25"
        stroke="currentColor"
        strokeWidth="1.75"
        className="text-red-400/90"
      />
      <rect
        x="7.25"
        y="7.25"
        width="9.5"
        height="9.5"
        rx="0.75"
        className="fill-red-500 stroke-red-500"
        strokeWidth="0.5"
      />
    </svg>
  );
}
