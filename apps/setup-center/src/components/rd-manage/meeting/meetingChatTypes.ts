import type React from 'react';

/** 会议室参会智能体（与 MeetingRoomBoard 中 RoomAgent 对齐） */
export interface RoomAgent {
  id: string;
  name: string;
  role: string;
  avatarColor: string;
  icon: React.ReactNode;
  status: 'idle' | 'processing' | 'error';
  currentAction: string;
}
