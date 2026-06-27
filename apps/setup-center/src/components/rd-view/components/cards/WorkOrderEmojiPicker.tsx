import { useState } from 'react';
import { Popover } from 'antd';
import { SmileOutlined } from '@ant-design/icons';
import { PersonName } from '@rd-view/components/PersonName';
import {
  ENJOY_EMOJI_ITEMS,
  enjoyIdToEmoji,
} from '@rd-view/utils/enjoyEmojiCatalog';

export { ENJOY_EMOJI_ITEMS } from '@rd-view/utils/enjoyEmojiCatalog';

export interface EmojiReaction {
  enjoyId: string;
  personName: string;
}

interface WorkOrderEmojiPickerProps {
  value?: EmojiReaction;
  onSelect: (enjoyId: string) => void;
  onOpenChange?: (open: boolean) => void;
}

export function WorkOrderEmojiPicker({ value, onSelect, onOpenChange }: WorkOrderEmojiPickerProps) {
  const [open, setOpen] = useState(false);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  const handleGridWheel = (event: React.WheelEvent) => {
    event.stopPropagation();
  };

  const handleSelect = (enjoyId: number) => {
    onSelect(String(enjoyId));
    handleOpenChange(false);
  };

  const panel = (
    <div className="work-order-emoji-panel" onClick={(e) => e.stopPropagation()}>
      <div className="work-order-emoji-panel-title">选择表情包</div>
      <div className="work-order-emoji-grid" onWheel={handleGridWheel}>
        {ENJOY_EMOJI_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`work-order-emoji-item${value?.enjoyId === String(item.id) ? ' work-order-emoji-item--active' : ''}`}
            onClick={() => handleSelect(item.id)}
            title={item.label}
          >
            {item.emoji}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="work-order-emoji-picker-wrap" onClick={(e) => e.stopPropagation()}>
      <Popover
        content={panel}
        trigger="click"
        open={open}
        onOpenChange={handleOpenChange}
        placement="topRight"
        arrow={false}
        overlayClassName="work-order-emoji-popover"
        getPopupContainer={() => document.body}
        destroyOnHidden
      >
        <button
          type="button"
          className={`work-order-emoji-trigger${open ? ' work-order-emoji-trigger--active' : ''}${value ? ' work-order-emoji-trigger--selected' : ''}`}
          onClick={(e) => e.stopPropagation()}
        >
          {value ? (
            <>
              <span className="work-order-emoji-trigger-emoji">{enjoyIdToEmoji(value.enjoyId)}</span>
              <span className="work-order-emoji-trigger-name">
                <PersonName name={value.personName} />
              </span>
            </>
          ) : (
            <>
              <SmileOutlined />
              <span>选择表情</span>
            </>
          )}
        </button>
      </Popover>
    </div>
  );
}
