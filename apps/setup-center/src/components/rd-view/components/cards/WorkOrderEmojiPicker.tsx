import { ENJOY_EMOJI_ITEMS } from '@rd-view/utils/enjoyEmojiCatalog';

const QUICK_ENJOY_ITEMS = ENJOY_EMOJI_ITEMS.slice(0, 3);

export interface EmojiReaction {
  enjoyId: string;
  personName: string;
}

interface WorkOrderEmojiPickerProps {
  value?: EmojiReaction;
  onSelect: (enjoyId: string) => void;
}

/** 工单快捷表情：点赞 / 点踩 / 催促，点击即选 */
export function WorkOrderEmojiPicker({ value, onSelect }: WorkOrderEmojiPickerProps) {
  return (
    <div className="work-order-emoji-quick" onClick={(event) => event.stopPropagation()}>
      {QUICK_ENJOY_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`work-order-emoji-quick-btn${value?.enjoyId === String(item.id) ? ' work-order-emoji-quick-btn--active' : ''}`}
          onClick={() => onSelect(String(item.id))}
          title={item.label}
          aria-label={item.label}
        >
          {item.emoji}
        </button>
      ))}
    </div>
  );
}
