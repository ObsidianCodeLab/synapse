import React, { useMemo, useState } from 'react';
import { Button } from 'antd';
import { toast } from 'sonner';
import {
  submitMeetingRoomAutoSplitChoice,
  type AutoSplitChoicePayload,
  type MeetingRoomDetail,
} from '@/api/meetingRoomService';

type Props = {
  synapseApiBase: string;
  roomId: string;
  payload?: AutoSplitChoicePayload | null;
  onSubmitted?: (detail: MeetingRoomDetail) => void;
};

export const MeetingAutoSplitChoicePanel: React.FC<Props> = ({
  synapseApiBase,
  roomId,
  payload,
  onSubmitted,
}) => {
  const [submitting, setSubmitting] = useState<'continue' | 'reuse_existing' | null>(null);

  const tasks = useMemo(
    () => (Array.isArray(payload?.existing_tasks) ? payload!.existing_tasks! : []),
    [payload],
  );
  const demandNo = (payload?.demand_no || '').trim();

  const handleSubmit = async (choice: 'continue' | 'reuse_existing') => {
    setSubmitting(choice);
    try {
      const detail = await submitMeetingRoomAutoSplitChoice(synapseApiBase, roomId, choice);
      toast.success(choice === 'continue' ? '将继续按方案拆单' : '将沿用已有任务单');
      onSubmitted?.(detail);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg || '提交失败');
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-5 p-6">
      <div>
        <h3 className="text-base font-medium text-foreground">自动拆单 — 已有任务单</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          需求单{demandNo ? ` ${demandNo} ` : ' '}
          在 userwork 中已挂 {tasks.length} 条任务单。请选择继续按 split_plan 创建新子单，或沿用已有任务单并跳过拆单。
        </p>
      </div>

      {tasks.length > 0 ? (
        <ul className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] px-4 py-3 text-sm">
          {tasks.map((t) => (
            <li key={t.task_no} className="py-1.5">
              <span className="font-medium text-foreground">{t.task_no}</span>
              {t.task_title ? (
                <span className="text-muted-foreground"> · {t.task_title}</span>
              ) : null}
              {t.product_module_name ? (
                <span className="text-muted-foreground"> · {t.product_module_name}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button
          type="primary"
          loading={submitting === 'reuse_existing'}
          disabled={Boolean(submitting && submitting !== 'reuse_existing')}
          onClick={() => void handleSubmit('reuse_existing')}
        >
          沿用已有任务单（跳过拆单）
        </Button>
        <Button
          loading={submitting === 'continue'}
          disabled={Boolean(submitting && submitting !== 'continue')}
          onClick={() => void handleSubmit('continue')}
        >
          继续拆单（按 split_plan 创建）
        </Button>
      </div>
    </div>
  );
};
