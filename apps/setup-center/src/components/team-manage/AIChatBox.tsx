import React, { useState, useRef, useEffect } from 'react';
import { Input, Button, Avatar, Typography } from 'antd';
import {
  SendOutlined,
  RobotOutlined,
  UserOutlined,
  ClearOutlined,
  BulbOutlined,
  CaretUpOutlined,
  CaretDownOutlined,
} from '@ant-design/icons';
import { ChatMessage, initialChatMessages, Dimension } from "./mockData";

const { Text } = Typography;
const { TextArea } = Input;

interface AIChatBoxProps {
  dimension: Dimension;
}

const AI_RESPONSES: string[] = [
  '根据当前数据分析，团队本周AI交互质量整体优良。建议关注王强的token效率，差分算法研究属于探索性工作，可适当引导其沉淀为知识库文档，供后续团队复用。',
  '从瀑布流数据来看，编码实现阶段的AI交互最为频繁，token消耗占比达到42.3%。李薇在架构设计阶段的AI使用最为高效，建议组织一次AI辅助设计的经验分享会。',
  '本周代码质量整体偏高，平均92.4分。吴志远的代码审查辅助输出了高质量的问题报告，发现了路径规划模块的内存泄漏风险，建议在下次代码规范培训中重点讲解此类问题。',
  '团队能效本周达到89.1%，环比提升3.5%。孙晨曦的测试用例生成效率提升最为显著，AI辅助使测试覆盖率从78%提升到94.2%。建议推广其测试AI实践经验。',
  '从知识生成维度分析，需求分析类文档生成最多（6篇），说明AI在需求梳理方面的价值已被团队认可。产品架构类文档较少，可鼓励架构师更多使用AI进行架构评审和决策支持。',
];

let responseIndex = 0;

const MessageBubble: React.FC<{ msg: ChatMessage }> = ({ msg }) => {
  const isUser = msg.role === 'user';
  return (
    <div style={{
      display: 'flex',
      flexDirection: isUser ? 'row-reverse' : 'row',
      alignItems: 'flex-start',
      gap: 10,
      marginBottom: 14,
    }}>
      <Avatar
        size={30}
        icon={isUser ? <UserOutlined /> : <RobotOutlined />}
        style={{
          background: isUser
            ? 'linear-gradient(135deg, var(--primary), var(--brand2))'
            : 'linear-gradient(135deg, var(--brand2), var(--primary))',
          flexShrink: 0,
        }}
      />
      <div style={{ maxWidth: '78%' }}>
        <div style={{
          background: isUser
            ? 'var(--nav-active)'
            : 'var(--bg-subtle)',
          border: isUser
            ? '1px solid var(--nav-active-border)'
            : '1px solid var(--border)',
          borderRadius: isUser ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
          padding: '10px 14px',
        }}>
          <Text style={{
            color: 'var(--text)', fontSize: 12.5, lineHeight: 1.75,
            display: 'block', whiteSpace: 'pre-wrap',
          }}>
            {msg.content}
          </Text>
        </div>
        <div style={{
          textAlign: isUser ? 'right' : 'left',
          color: 'var(--muted2)', fontSize: 10, marginTop: 4,
        }}>
          {msg.timestamp}
        </div>
      </div>
    </div>
  );
};

const QuickQuestion: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button
    onClick={onClick}
    style={{
      background: 'var(--nav-hover)',
      border: '1px solid var(--nav-active-border)',
      borderRadius: 16, padding: '4px 12px',
      color: 'var(--primary)', fontSize: 11,
      cursor: 'pointer', whiteSpace: 'nowrap',
      transition: 'all 0.15s',
    }}
    onMouseEnter={e => {
      (e.target as HTMLElement).style.background = 'var(--nav-active)';
    }}
    onMouseLeave={e => {
      (e.target as HTMLElement).style.background = 'var(--nav-hover)';
    }}
  >
    {label}
  </button>
);

export const AIChatBox: React.FC<AIChatBoxProps> = ({ dimension }) => {
  const [messages, setMessages] = useState<ChatMessage[]>(initialChatMessages);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<any>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => { if (!collapsed) scrollToBottom(); }, [messages, collapsed]);

  const handleSend = (text?: string) => {
    const content = text || input.trim();
    if (!content) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    setTimeout(() => {
      const aiMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: AI_RESPONSES[responseIndex % AI_RESPONSES.length],
        timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      };
      responseIndex++;
      setMessages(prev => [...prev, aiMsg]);
      setLoading(false);
    }, 1200 + Math.random() * 800);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const quickQuestions = [
    '分析token效率',
    '谁的产出最高？',
    '代码质量趋势',
    '知识沉淀建议',
    '风险提示',
  ];

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: collapsed ? 44 : 320,
      transition: 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      overflow: 'hidden',
      background: 'var(--card-bg)',
      borderTop: '1px solid var(--border)',
    }}>
      {/* Header — click to toggle */}
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          padding: '0 16px',
          height: 44,
          borderBottom: collapsed ? 'none' : '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--bg-subtle)',
          flexShrink: 0,
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: 'var(--text)', fontSize: 12, fontWeight: 600 }}>AI 研发分析助手</Text>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--success)',
            boxShadow: '0 0 6px color-mix(in srgb, var(--success) 45%, transparent)',
            display: 'inline-block',
          }} />
          <Text style={{ color: 'var(--muted)', fontSize: 10 }}>在线</Text>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }} onClick={e => e.stopPropagation()}>
          <Text style={{ color: 'var(--muted2)', fontSize: 10 }}>
            <BulbOutlined style={{ marginRight: 4 }} />
            基于{dimension === 'month' ? '本月' : dimension === 'week' ? '本周' : '本日'}数据
          </Text>
          <Button
            type="text" size="small"
            icon={<ClearOutlined />}
            onClick={() => setMessages(initialChatMessages.slice(0, 1))}
            style={{ color: 'var(--muted2)', fontSize: 10 }}
          >
            清空
          </Button>
          {/* Collapse toggle */}
          <div
            onClick={() => setCollapsed(c => !c)}
            style={{
              width: 24, height: 24, borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--nav-hover)',
              border: '1px solid var(--nav-active-border)',
              color: 'var(--primary)', cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--nav-active)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--nav-hover)')}
          >
            {collapsed
              ? <CaretUpOutlined style={{ fontSize: 10 }} />
              : <CaretDownOutlined style={{ fontSize: 10 }} />}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 8px' }}>
        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        {loading && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <Avatar
              size={30}
              icon={<RobotOutlined />}
              style={{ background: 'linear-gradient(135deg, var(--brand2), var(--primary))', flexShrink: 0 }}
            />
            <div style={{
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border)',
              borderRadius: '4px 12px 12px 12px',
              padding: '12px 16px',
            }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: 'var(--primary)',
                    animation: `bounce 1s infinite ${i * 0.15}s`,
                    display: 'inline-block',
                    opacity: 0.8,
                  }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Questions */}
      <div style={{
        padding: '6px 16px',
        display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0,
      }}>
        {quickQuestions.map(q => (
          <QuickQuestion key={q} label={q} onClick={() => handleSend(q)} />
        ))}
      </div>

      {/* Input */}
      <div style={{
        padding: '8px 16px 12px',
        borderTop: '1px solid var(--border)',
        display: 'flex', gap: 8, flexShrink: 0,
      }}>
        <TextArea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="向AI助手询问团队研发情况... (Enter发送, Shift+Enter换行)"
          autoSize={{ minRows: 1, maxRows: 3 }}
          style={{
            flex: 1, resize: 'none',
            background: 'var(--bg-app)',
            border: '1px solid var(--border)',
            color: 'var(--text)', fontSize: 12,
            borderRadius: 8,
          }}
          disabled={loading}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={() => handleSend()}
          loading={loading}
          disabled={!input.trim()}
          style={{
            alignSelf: 'flex-end',
            borderRadius: 8,
            height: 36, width: 36, flexShrink: 0,
          }}
        />
      </div>

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
};