import type { DemandEnjoyComment } from '@rd-view/types';
import { enjoyIdToEmoji, isSameEmployeeId } from '@rd-view/utils/enjoyEmojiCatalog';
import { PersonName } from '@rd-view/components/PersonName';
import { WorkOrderEmojiPicker } from './WorkOrderEmojiPicker';

function EnjoyReadonlyChip({ comment }: { comment: DemandEnjoyComment }) {
  return (
    <span className="work-order-enjoy-chip work-order-enjoy-chip--readonly">
      <span className="work-order-emoji-trigger-emoji">{enjoyIdToEmoji(comment.enjoyId)}</span>
      <span className="work-order-emoji-trigger-name">
        <PersonName name={comment.assignee} />
      </span>
    </span>
  );
}

interface WorkOrderEnjoyBarProps {
  comments: DemandEnjoyComment[];
  currentEmployeeId: string;
  currentUserName: string;
  onOwnEnjoySelect: (enjoyId: string) => void;
  onPickerOpenChange?: (open: boolean) => void;
}

/** 工单表情栏：他人只读回显，本人可选/改 */
export function WorkOrderEnjoyBar({
  comments,
  currentEmployeeId,
  currentUserName,
  onOwnEnjoySelect,
  onPickerOpenChange,
}: WorkOrderEnjoyBarProps) {
  const ownComment = comments.find((item) => isSameEmployeeId(item.assigneeId, currentEmployeeId));
  const others = comments.filter((item) => !isSameEmployeeId(item.assigneeId, currentEmployeeId));

  return (
    <div className="work-order-enjoy-bar">
      {others.map((comment) => (
        <EnjoyReadonlyChip key={comment.assigneeId} comment={comment} />
      ))}
      {currentEmployeeId ? (
        <WorkOrderEmojiPicker
          value={
            ownComment
              ? { enjoyId: ownComment.enjoyId, personName: ownComment.assignee || currentUserName }
              : undefined
          }
          onSelect={onOwnEnjoySelect}
          onOpenChange={onPickerOpenChange}
        />
      ) : null}
    </div>
  );
}
