/**
 * 任务执行操作 Demo：放弃文件变更 · 当前轮次重试
 * 访问：桌面/Web 应用 hash `#task-exec-ops-demo`
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Button, Card, Popconfirm, Space, Typography, message } from 'antd';
import { GitBranch, RotateCw, Terminal, X } from 'lucide-react';
import { TaskExecRoundsPanel } from '../../components/rd-manage/meeting/TaskExecReviewPanel';
import type {
  TaskExecCodeDiffFile,
  TaskExecReprocessRound,
} from '../../api/meetingRoomService';

const MOCK_FILES: TaskExecCodeDiffFile[] = [
  {
    id: 'T-101:src/service/OrderService.java',
    path: 'src/service/OrderService.java',
    task_no: 'T-101',
    status: 'modified',
    additions: 12,
    deletions: 3,
    language: 'java',
    original: 'public class OrderService {\n  // old\n}\n',
    modified: 'public class OrderService {\n  // new impl\n}\n',
  },
  {
    id: 'T-101:src/api/OrderController.java',
    path: 'src/api/OrderController.java',
    task_no: 'T-101',
    status: 'added',
    additions: 28,
    deletions: 0,
    language: 'java',
    original: '',
    modified: '@RestController\npublic class OrderController {}\n',
  },
  {
    id: 'T-102:README.md',
    path: 'README.md',
    task_no: 'T-102',
    status: 'modified',
    additions: 2,
    deletions: 1,
    language: 'markdown',
    original: '# Demo\n',
    modified: '# Demo\n\n## Task Exec\n',
  },
];

const INITIAL_ROUNDS: TaskExecReprocessRound[] = [
  {
    round: 1,
    kind: 'initial',
    reason: '',
    status: 'ok',
    summary: { total_tokens: 4200, total_duration_sec: 186 },
  },
  {
    round: 2,
    kind: 'reprocess',
    reason: '补充边界校验与异常分支单测',
    status: 'running',
    summary: {},
  },
];

function fileBaseName(path: string | undefined): string {
  const norm = String(path || '').replace(/\\/g, '/');
  const idx = norm.lastIndexOf('/');
  return idx >= 0 ? norm.slice(idx + 1) : norm;
}

export function TaskExecOpsDemoView() {
  const [files, setFiles] = useState<TaskExecCodeDiffFile[]>(() => [...MOCK_FILES]);
  const [rounds, setRounds] = useState<TaskExecReprocessRound[]>(() => [...INITIAL_ROUNDS]);
  const [currentRound, setCurrentRound] = useState(2);
  const [cliRunning, setCliRunning] = useState(true);
  const [retryingRound, setRetryingRound] = useState<number | null>(null);
  const [eventLog, setEventLog] = useState<string[]>([
    '[demo] 页面已加载，以下为本地模拟数据',
  ]);

  const pushLog = useCallback((line: string) => {
    setEventLog((prev) => [...prev.slice(-19), line]);
  }, []);

  const summary = useMemo(
    () => ({
      file_count: files.length,
      additions: files.reduce((n, f) => n + (f.additions ?? 0), 0),
      deletions: files.reduce((n, f) => n + (f.deletions ?? 0), 0),
    }),
    [files],
  );

  const onDiscardFile = useCallback(
    (fileId: string) => {
      const target = files.find((f) => f.id === fileId);
      if (!target) return;
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      pushLog(`[放弃变更] 已恢复 ${target.path} 为 git HEAD（模拟）`);
      message.success(`已放弃 ${fileBaseName(target.path)} 的变更`);
    },
    [files, pushLog],
  );

  const onRetryRound = useCallback(
    async (roundNo: number) => {
      setRetryingRound(roundNo);
      pushLog(`[重试轮次] 终止 IDE 终端 psmux 会话…（模拟）`);
      await new Promise((r) => window.setTimeout(r, 800));
      pushLog(`[重试轮次] 重新触发第 ${roundNo} 轮 CLI（模拟，轮次号不变）`);
      setRounds((prev) =>
        prev.map((item) =>
          item.round === roundNo
            ? { ...item, status: 'running', started_at: new Date().toISOString(), summary: {} }
            : item,
        ),
      );
      setCliRunning(true);
      message.success(`第 ${roundNo} 轮已重试（Demo 模拟）`);
      setRetryingRound(null);
    },
    [pushLog],
  );

  const simulateRoundComplete = useCallback(() => {
    setRounds((prev) =>
      prev.map((item) =>
        item.round === currentRound
          ? {
              ...item,
              status: 'ok',
              summary: { total_tokens: 3100, total_duration_sec: 142 },
            }
          : item,
      ),
    );
    setCliRunning(false);
    pushLog(`[模拟] 第 ${currentRound} 轮执行完成`);
    message.info('已模拟当前轮次完成，可切换为评审态查看代码差异');
  }, [currentRound, pushLog]);

  const resetDemo = useCallback(() => {
    setFiles([...MOCK_FILES]);
    setRounds([...INITIAL_ROUNDS]);
    setCurrentRound(2);
    setCliRunning(true);
    setEventLog(['[demo] 已重置']);
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 pb-10">
      <div className="space-y-1">
        <Typography.Title level={4} className="!mb-0">
          任务执行操作 Demo
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="!mb-0 text-sm">
          本地模拟「放弃文件变更」与「当前轮次重试」交互。正式环境请接入会议室任务执行面板；本页 hash：
          <code className="ml-1">#task-exec-ops-demo</code>
        </Typography.Paragraph>
      </div>

      <Alert
        type="info"
        showIcon
        message="Demo 说明"
        description={
          <ul className="mb-0 pl-4 text-[12px]">
            <li>文件标签右侧红叉：放弃该文件未提交变更（正式环境调用 DELETE code-diffs API）</li>
            <li>执行轮次卡片「重试当前轮」：终止 psmux IDE 终端并重跑当前轮（正式环境调用 POST retry-round API）</li>
          </ul>
        }
      />

      <Space wrap>
        <Button onClick={resetDemo}>重置 Demo</Button>
        <Button type="primary" disabled={!cliRunning} onClick={simulateRoundComplete}>
          模拟当前轮完成
        </Button>
      </Space>

      <Card
        size="small"
        title={
          <span className="inline-flex items-center gap-2 text-sm">
            <GitBranch className="h-4 w-4 text-cyan-400" />
            代码差异 · 放弃变更
          </span>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <span>{summary.file_count} 个文件</span>
          <span className="text-emerald-300">+{summary.additions}</span>
          <span className="text-rose-300">-{summary.deletions}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {files.length === 0 ? (
            <Typography.Text type="secondary">所有变更已放弃</Typography.Text>
          ) : (
            files.map((file) => (
              <div
                key={file.id}
                className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/20 py-0.5 pl-2 pr-1"
              >
                <span className="max-w-[14rem] truncate text-[11px] font-medium">{fileBaseName(file.path)}</span>
                <span className="text-[10px] text-muted-foreground">{file.status}</span>
                <Popconfirm
                  title="放弃此文件的全部变更？"
                  okText="放弃"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => onDiscardFile(file.id)}
                >
                  <Button
                    type="primary"
                    danger
                    size="small"
                    className="rd-task-exec-discard-btn rd-task-exec-discard-btn--icon"
                    title="放弃此文件变更"
                    aria-label="放弃此文件变更"
                    icon={<X className="h-3 w-3" strokeWidth={2.5} />}
                    onClick={(e) => e.stopPropagation()}
                  />
                </Popconfirm>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card
        size="small"
        title={
          <span className="inline-flex items-center gap-2 text-sm">
            <RotateCw className="h-4 w-4 text-violet-400" />
            执行轮次 · 当前轮重试
          </span>
        }
      >
        <TaskExecRoundsPanel
          rounds={rounds}
          currentRound={currentRound}
          variant="task_exec"
          onRetryRound={onRetryRound}
          retryingRound={retryingRound}
          retryDisabled={!cliRunning}
        />
      </Card>

      <Card
        size="small"
        title={
          <span className="inline-flex items-center gap-2 text-sm">
            <Terminal className="h-4 w-4" />
            操作日志
          </span>
        }
      >
        <pre className="mb-0 max-h-40 overflow-auto rounded-lg bg-black/30 p-3 text-[11px] leading-relaxed text-muted-foreground">
          {eventLog.join('\n')}
        </pre>
      </Card>
    </div>
  );
}
