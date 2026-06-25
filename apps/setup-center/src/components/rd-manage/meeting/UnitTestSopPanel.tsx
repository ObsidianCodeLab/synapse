/**
 * 测试案例评审面板（协同节点）：用例说明 + 动态 pytest + 逐条人工确认
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Input,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  CheckCircle2,
  FlaskConical,
  Loader2,
  Play,
  XCircle,
} from 'lucide-react';

import {
  MIN_UNIT_TEST_REVIEW_COMMENT_LEN,
  fetchUnitTestReview,
  runUnitTestReviewTests,
  saveUnitTestCaseReviews,
  submitUnitTestReviewDecision,
  type UnitTestCaseReviewStatus,
  type UnitTestReviewPayload,
} from '../../../api/meetingRoomService';
import { ReviewMarkdown } from './ReviewMarkdown';

const { TextArea } = Input;
const { Text, Paragraph } = Typography;

type CaseDraft = { status: UnitTestCaseReviewStatus; comment: string };

interface Props {
  synapseApiBase: string;
  roomId: string;
  scopeId?: string;
  initialPayload?: UnitTestReviewPayload | null;
  blocked?: boolean;
  onDecided?: () => void;
}

const RESULT_COLOR: Record<string, string> = {
  passed: 'green',
  failed: 'red',
  error: 'red',
  skipped: 'default',
  pending: 'default',
};

const RESULT_LABEL: Record<string, string> = {
  passed: '通过',
  failed: '失败',
  error: '错误',
  skipped: '跳过',
  pending: '未执行',
};

const REVIEW_LABEL: Record<string, string> = {
  pending: '待确认',
  approved: '已通过',
  needs_change: '需修订',
};

function draftsFromPayload(payload?: UnitTestReviewPayload | null): Record<string, CaseDraft> {
  const out: Record<string, CaseDraft> = {};
  for (const row of payload?.test_cases ?? []) {
    out[row.id] = {
      status: (row.human_review?.status as UnitTestCaseReviewStatus) || 'pending',
      comment: row.human_review?.comment || '',
    };
  }
  return out;
}

function CaseResultTag({ status }: { status?: string }) {
  const key = (status || 'pending').trim();
  return <Tag color={RESULT_COLOR[key] || 'default'}>{RESULT_LABEL[key] || key}</Tag>;
}

export function UnitTestSopPanel({
  synapseApiBase,
  roomId,
  initialPayload,
  blocked,
  onDecided,
}: Props) {
  const [payload, setPayload] = useState<UnitTestReviewPayload | null>(initialPayload ?? null);
  const [loading, setLoading] = useState(!initialPayload);
  const [runningTests, setRunningTests] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [overallComment, setOverallComment] = useState('');
  const [caseDrafts, setCaseDrafts] = useState<Record<string, CaseDraft>>(() =>
    draftsFromPayload(initialPayload),
  );
  const draftsDirtyRef = useRef(false);
  const overallCommentDirtyRef = useRef(false);

  const reload = useCallback(async () => {
    if (!synapseApiBase || !roomId) return;
    setLoading(true);
    try {
      const res = await fetchUnitTestReview(synapseApiBase, roomId);
      setPayload(res.payload);
      if (!draftsDirtyRef.current) {
        setCaseDrafts(draftsFromPayload(res.payload));
      }
      if (!overallCommentDirtyRef.current) {
        setOverallComment(res.payload.human_review?.comment || '');
      }
    } catch {
      message.error('加载测试案例评审数据失败');
    } finally {
      setLoading(false);
    }
  }, [synapseApiBase, roomId]);

  useEffect(() => {
    draftsDirtyRef.current = false;
    overallCommentDirtyRef.current = false;
  }, [roomId]);

  useEffect(() => {
    if (initialPayload) {
      setPayload(initialPayload);
      if (!draftsDirtyRef.current) {
        setCaseDrafts(draftsFromPayload(initialPayload));
      }
      if (!overallCommentDirtyRef.current) {
        setOverallComment(initialPayload.human_review?.comment || '');
      }
      setLoading(false);
      return;
    }
    void reload();
  }, [initialPayload, reload]);

  const cases = payload?.test_cases ?? [];
  const lastRun = payload?.last_run;
  const suite = payload?.test_suite;
  const approvedCount = cases.filter((c) => caseDrafts[c.id]?.status === 'approved').length;
  const needsChangeCount = cases.filter((c) => caseDrafts[c.id]?.status === 'needs_change').length;
  const allApproved = cases.length > 0 && approvedCount === cases.length;
  const testsPassed = (lastRun?.failed ?? 0) === 0 && (lastRun?.total ?? 0) > 0;

  const caseUpdates = useCallback(
    () =>
      cases.map((c) => ({
        id: c.id,
        status: caseDrafts[c.id]?.status || 'pending',
        comment: caseDrafts[c.id]?.comment || '',
      })),
    [cases, caseDrafts],
  );

  const updateCaseDraft = useCallback((caseId: string, next: CaseDraft) => {
    draftsDirtyRef.current = true;
    setCaseDrafts((prev) => ({ ...prev, [caseId]: next }));
  }, []);

  const persistCases = useCallback(async () => {
    const res = await saveUnitTestCaseReviews(synapseApiBase, roomId, caseUpdates());
    setPayload(res.payload);
    draftsDirtyRef.current = false;
    message.success('评审进度已保存');
  }, [caseUpdates, synapseApiBase, roomId]);

  const handleRunTests = useCallback(async () => {
    setRunningTests(true);
    try {
      const res = await runUnitTestReviewTests(synapseApiBase, roomId);
      setPayload(res.payload);
      if (!draftsDirtyRef.current) {
        setCaseDrafts(draftsFromPayload(res.payload));
      }
      const failed = res.payload.last_run?.failed ?? 0;
      const passed = res.payload.last_run?.passed ?? 0;
      if (failed > 0) {
        message.warning(`测试完成：通过 ${passed}，失败 ${failed}`);
      } else {
        message.success(`测试完成：全部通过（${passed} 条）`);
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : '执行单元测试失败');
    } finally {
      setRunningTests(false);
    }
  }, [synapseApiBase, roomId]);

  const validateReviseComments = (): string | null => {
    for (const c of cases) {
      const draft = caseDrafts[c.id];
      if (draft?.status !== 'needs_change') continue;
      if ((draft.comment || '').trim().length < 8) {
        return `用例「${c.name || c.id}」需修订时必须填写不少于 8 字的意见`;
      }
    }
    return null;
  };

  const handleDecision = async (decision: 'approve' | 'revise') => {
    if (decision === 'approve') {
      if (!allApproved) {
        message.warning('须将全部测试用例标记为「已通过」');
        return;
      }
      if (!testsPassed) {
        message.warning('请先执行单元测试并确保全部通过');
        return;
      }
      if (overallComment.trim().length < MIN_UNIT_TEST_REVIEW_COMMENT_LEN) {
        message.warning(`总体评审意见不少于 ${MIN_UNIT_TEST_REVIEW_COMMENT_LEN} 字`);
        return;
      }
    } else {
      if (needsChangeCount === 0) {
        message.warning('需修订时至少将一条用例标记为「需修订」');
        return;
      }
      const err = validateReviseComments();
      if (err) {
        message.warning(err);
        return;
      }
    }

    setSubmitting(true);
    try {
      await submitUnitTestReviewDecision(synapseApiBase, roomId, {
        decision,
        comment: overallComment.trim(),
        cases: caseUpdates(),
      });
      message.success(decision === 'approve' ? '测试案例评审已通过' : '已提交修订意见，小鲸将增量修订');
      onDecided?.();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '提交评审失败');
    } finally {
      setSubmitting(false);
    }
  };

  const summaryMarkdown = useMemo(
    () => (payload?.whale_summary?.markdown || '').trim(),
    [payload?.whale_summary?.markdown],
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        加载测试案例评审…
      </div>
    );
  }

  if (!payload) {
    return (
      <Alert
        type="warning"
        showIcon
        message="未找到 unit_test_review.json，请先完成小鲸测试案例技能产出"
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[color:var(--panel)]">
      <div className="border-b border-slate-800 px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <FlaskConical className="h-5 w-5 text-cyan-400" />
          <div>
            <h3 className="text-base font-medium text-slate-100">测试案例评审</h3>
            <p className="text-xs text-slate-500">
              完善任务执行阶段单元测试 · 执行 pytest · 逐条确认场景与要求
            </p>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              icon={runningTests ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              onClick={() => void handleRunTests()}
              loading={runningTests}
              disabled={blocked || submitting}
            >
              执行单元测试
            </Button>
            <Button onClick={() => void persistCases()} disabled={blocked || submitting}>
              保存评审进度
            </Button>
          </div>
        </div>
        {blocked ? (
          <Alert className="mt-3" type="info" showIcon message="节点处于修订中，请等待小鲸处理完成后再评审" />
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5">
        {summaryMarkdown ? (
          <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <Text className="text-slate-400 text-xs">小鲸测试摘要</Text>
            <div className="mt-2 text-sm text-slate-300">
              <ReviewMarkdown content={summaryMarkdown} />
            </div>
          </section>
        ) : null}

        <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 space-y-2">
          <Text className="text-slate-400 text-xs">测试套件</Text>
          <div className="text-sm text-slate-300 space-y-1">
            {suite?.code_root ? <div>工程目录：<code className="text-cyan-400">{suite.code_root}</code></div> : null}
            {(suite?.test_files ?? []).length ? (
              <div>
                测试文件：
                {(suite?.test_files ?? []).map((f) => (
                  <code key={f} className="ml-2 text-cyan-400">{f}</code>
                ))}
              </div>
            ) : null}
            {lastRun?.ran_at ? (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span>最近执行：{lastRun.ran_at}</span>
                <Tag color="green">通过 {lastRun.passed ?? 0}</Tag>
                <Tag color={(lastRun.failed ?? 0) > 0 ? 'red' : 'default'}>失败 {lastRun.failed ?? 0}</Tag>
                <Tag>跳过 {lastRun.skipped ?? 0}</Tag>
              </div>
            ) : (
              <Paragraph type="secondary" className="!mb-0 text-xs">
                尚未执行测试，请点击「执行单元测试」获取动态结果
              </Paragraph>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <Text className="text-slate-400 text-xs">
            用例清单（{approvedCount}/{cases.length} 已确认）
          </Text>
          {cases.map((c) => {
            const draft = caseDrafts[c.id] || { status: 'pending' as const, comment: '' };
            return (
              <div key={c.id} className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 space-y-3">
                <div className="flex flex-wrap items-start gap-2">
                  <span className="font-medium text-slate-100">{c.name || c.id}</span>
                  <CaseResultTag status={c.last_result?.status} />
                  <Tag>{REVIEW_LABEL[draft.status] || draft.status}</Tag>
                </div>
                {c.scenario ? (
                  <div className="text-sm text-slate-300">
                    <span className="text-slate-500">场景：</span>{c.scenario}
                  </div>
                ) : null}
                {c.requirements ? (
                  <div className="text-sm text-slate-300">
                    <span className="text-slate-500">要求：</span>{c.requirements}
                  </div>
                ) : null}
                {(c.test_file || c.test_function) ? (
                  <div className="text-xs text-slate-500 font-mono">
                    {c.test_file}{c.test_function ? ` :: ${c.test_function}` : ''}
                  </div>
                ) : null}
                {c.last_result?.message ? (
                  <Alert type="error" showIcon message={c.last_result.message} className="text-xs" />
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {(['approved', 'needs_change', 'pending'] as const).map((st) => (
                    <Button
                      key={st}
                      size="small"
                      type={draft.status === st ? 'primary' : 'default'}
                      disabled={blocked || submitting}
                      onClick={() => updateCaseDraft(c.id, { ...draft, status: st })}
                    >
                      {REVIEW_LABEL[st]}
                    </Button>
                  ))}
                </div>
                {draft.status === 'needs_change' ? (
                  <TextArea
                    rows={2}
                    placeholder="请说明需如何完善测试代码或用例描述（不少于 8 字）"
                    value={draft.comment}
                    disabled={blocked || submitting}
                    onChange={(e) => {
                      updateCaseDraft(c.id, { ...draft, comment: e.target.value });
                    }}
                  />
                ) : null}
              </div>
            );
          })}
        </section>

        {lastRun?.raw_output_tail ? (
          <section className="rounded-lg border border-slate-800 bg-black/40 p-4">
            <Text className="text-slate-500 text-xs">pytest 输出（尾部）</Text>
            <pre className="mt-2 max-h-48 overflow-auto text-xs text-slate-400 whitespace-pre-wrap">
              {lastRun.raw_output_tail}
            </pre>
          </section>
        ) : null}

        <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 space-y-3">
          <Text className="text-slate-400 text-xs">总体评审意见（通过时不少于 {MIN_UNIT_TEST_REVIEW_COMMENT_LEN} 字）</Text>
          <TextArea
            rows={3}
            value={overallComment}
            disabled={blocked || submitting}
            onChange={(e) => {
              overallCommentDirtyRef.current = true;
              setOverallComment(e.target.value);
            }}
            placeholder="说明测试覆盖是否满足验收标准、有无遗漏场景等"
          />
          <div className="flex flex-wrap gap-2 justify-end">
            <Button
              danger
              icon={<XCircle className="h-4 w-4" />}
              disabled={blocked || submitting}
              loading={submitting}
              onClick={() => void handleDecision('revise')}
            >
              需修订
            </Button>
            <Button
              type="primary"
              icon={<CheckCircle2 className="h-4 w-4" />}
              disabled={blocked || submitting || !allApproved || !testsPassed}
              loading={submitting}
              onClick={() => void handleDecision('approve')}
            >
              全部通过并推进
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
