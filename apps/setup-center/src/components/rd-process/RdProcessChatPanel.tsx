import { useEffect, useRef, useState } from "react";
import {
  Avatar,
  Button,
  Dropdown,
  Input,
  Space,
  Tag,
  Typography,
  type MenuProps,
} from "antd";
import {
  Send,
  User,
  Sparkles,
  Paperclip,
  MoreHorizontal,
  Cpu,
  Copy,
  Download,
  Trash2,
  RefreshCw,
  Link,
  Tag as TagIcon,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Circle,
  Target,
  Zap,
  Plus,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { TOPIC_ROWS } from "./processMockData";

const { Text } = Typography;

interface Message {
  id: string;
  sender: "ai" | "user";
  text: string;
  time: string;
}

export function RdProcessChatPanel() {
  const { t, i18n } = useTranslation();
  const [messages, setMessages] = useState<Message[]>(() => [
    { id: "1", sender: "ai", text: t("rdProcess.chat.msgAi1"), time: "10:00" },
    { id: "2", sender: "user", text: t("rdProcess.chat.msgUser1"), time: "10:01" },
    { id: "3", sender: "ai", text: t("rdProcess.chat.msgAi2"), time: "10:01" },
    { id: "4", sender: "ai", text: t("rdProcess.chat.msgAi3"), time: "10:02" },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isTopicsExpanded, setIsTopicsExpanded] = useState(true);
  const [selectedTopic, setSelectedTopic] = useState<number | null>(2);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    setMessages([
      { id: "1", sender: "ai", text: t("rdProcess.chat.msgAi1"), time: "10:00" },
      { id: "2", sender: "user", text: t("rdProcess.chat.msgUser1"), time: "10:01" },
      { id: "3", sender: "ai", text: t("rdProcess.chat.msgAi2"), time: "10:01" },
      { id: "4", sender: "ai", text: t("rdProcess.chat.msgAi3"), time: "10:02" },
    ]);
  }, [i18n.language, t]);

  const handleSend = () => {
    if (!inputValue.trim()) return;
    const locale = i18n.language.startsWith("zh") ? "zh-CN" : "en-US";
    const newMessage: Message = {
      id: Date.now().toString(),
      sender: "user",
      text: inputValue,
      time: new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((prev) => [...prev, newMessage]);
    setInputValue("");
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: "ai",
          text: t("rdProcess.chat.msgAiReply"),
          time: new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    }, 1000);
  };

  const menuItems: MenuProps["items"] = [
    { key: "copy-link", label: t("rdProcess.chat.menuCopyLink"), icon: <Link size={13} /> },
    { key: "copy-chat", label: t("rdProcess.chat.menuCopyChat"), icon: <Copy size={13} /> },
    { key: "export", label: t("rdProcess.chat.menuExport"), icon: <Download size={13} /> },
    { key: "reset", label: t("rdProcess.chat.menuReset"), icon: <RefreshCw size={13} /> },
    { type: "divider" },
    { key: "clear", label: t("rdProcess.chat.menuClear"), icon: <Trash2 size={13} />, danger: true },
  ];

  const doneCount = TOPIC_ROWS.filter((r) => r.status === "done").length;
  const ongoingCount = TOPIC_ROWS.filter((r) => r.status === "ongoing").length;

  const border = "var(--border)";
  const panel = "var(--card-bg)";
  const sub = "var(--bg-subtle)";
  const muted = "var(--muted)";
  const text = "var(--text)";
  const primary = "var(--primary)";
  const brandMix = "color-mix(in srgb, var(--brand) 18%, transparent)";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: panel,
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          borderBottom: `1px solid ${border}`,
          background: sub,
          zIndex: 30,
          flexShrink: 0,
          gap: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flex: 1,
            overflow: "hidden",
            flexWrap: "nowrap",
            minWidth: 0,
          }}
        >
          <Tag
            style={{
              background: brandMix,
              color: "var(--brand2)",
              border: `1px solid color-mix(in srgb, var(--brand) 35%, transparent)`,
              fontSize: 11,
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              flexShrink: 0,
              marginInlineEnd: 0,
            }}
          >
            <TagIcon size={10} />
            {t("rdProcess.chat.tagReq")}
          </Tag>
          <Tag
            style={{
              background: "var(--bg-subtle)",
              color: muted,
              border: `1px solid ${border}`,
              fontSize: 11,
              fontFamily: "monospace",
              flexShrink: 0,
              marginInlineEnd: 0,
            }}
          >
            #REQ-20240312
          </Tag>
          <Text
            style={{
              color: text,
              fontWeight: 600,
              fontSize: 13,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
              flex: 1,
            }}
          >
            {t("rdProcess.chat.reqTitle")}
          </Text>
          <button
            type="button"
            onClick={() => setIsTopicsExpanded(!isTopicsExpanded)}
            style={{
              flexShrink: 0,
              background: isTopicsExpanded ? brandMix : "var(--bg-subtle)",
              border: `1px solid ${isTopicsExpanded ? "color-mix(in srgb, var(--brand) 40%, transparent)" : border}`,
              color: isTopicsExpanded ? "var(--brand2)" : muted,
              borderRadius: 20,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              height: 26,
              padding: "0 8px",
              fontSize: 11,
              cursor: "pointer",
              transition: "all 0.2s",
              whiteSpace: "nowrap",
            }}
          >
            <Sparkles size={11} color={isTopicsExpanded ? "var(--brand)" : "var(--muted2)"} />
            <span>{t("rdProcess.chat.topicsToggle")}</span>
            <span
              style={{
                opacity: 0.7,
                paddingLeft: 5,
                borderLeft: "1px solid currentColor",
                marginLeft: 1,
                lineHeight: 1,
              }}
            >
              {doneCount + ongoingCount}/{TOPIC_ROWS.length}
            </span>
            {isTopicsExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
        </div>

        <Dropdown menu={{ items: menuItems }} trigger={["click"]} placement="bottomRight">
          <Button
            type="text"
            icon={<MoreHorizontal size={20} />}
            style={{
              color: muted,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 4,
            }}
          />
        </Dropdown>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}>
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 20,
            transition: "opacity 0.25s ease, transform 0.25s ease, visibility 0.25s",
            background: "color-mix(in srgb, var(--card-bg) 72%, transparent)",
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
            borderBottom: `1px solid ${border}`,
            boxShadow: "var(--shadow)",
            opacity: isTopicsExpanded ? 1 : 0,
            visibility: isTopicsExpanded ? "visible" : "hidden",
            transform: isTopicsExpanded ? "translateY(0)" : "translateY(-10px)",
            pointerEvents: isTopicsExpanded ? "auto" : "none",
          }}
        >
          <div style={{ padding: "12px 16px 14px", maxHeight: 380, overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <Text style={{ fontSize: 11, color: muted, fontWeight: 500, letterSpacing: "0.04em" }}>
                {t("rdProcess.chat.topicListTitle")}
              </Text>
              <div style={{ flex: 1, height: 1, background: border }} />
              <Tag
                style={{
                  background: brandMix,
                  color: "var(--brand2)",
                  border: `1px solid color-mix(in srgb, var(--brand) 30%, transparent)`,
                  fontSize: 10,
                  marginInlineEnd: 0,
                }}
              >
                {t("rdProcess.chat.topicPhase")}
              </Tag>
            </div>

            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              {TOPIC_ROWS.map((item, index) => {
                const isActive = item.status === "ongoing";
                const isSelected = selectedTopic === index;
                const isDone = item.status === "done";

                return (
                  <li key={item.titleKey}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedTopic(isSelected ? null : index)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedTopic(isSelected ? null : index);
                        }
                      }}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                        padding: "7px 8px",
                        borderRadius: 8,
                        cursor: "pointer",
                        background: isActive ? brandMix : isSelected ? "var(--nav-hover)" : "transparent",
                        border: isActive ? `1px solid color-mix(in srgb, var(--brand) 28%, transparent)` : "1px solid transparent",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div style={{ flexShrink: 0, marginTop: 1 }}>
                        {isDone ? (
                          <CheckCircle2 size={15} color="var(--muted2)" />
                        ) : isActive ? (
                          <Circle size={15} color="var(--brand)" />
                        ) : (
                          <Circle size={15} color="var(--muted2)" />
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={{
                            fontSize: 12,
                            display: "block",
                            color: isDone ? muted : isActive ? "var(--brand2)" : text,
                            fontWeight: isActive ? 500 : 400,
                            textDecoration: isDone ? "line-through" : "none",
                          }}
                        >
                          {index + 1}. {t(item.titleKey)}
                        </Text>
                      </div>
                      {isActive && (
                        <Tag
                          style={{
                            background: brandMix,
                            color: "var(--brand2)",
                            border: `1px solid color-mix(in srgb, var(--brand) 35%, transparent)`,
                            fontSize: 10,
                            marginInlineEnd: 0,
                            flexShrink: 0,
                          }}
                        >
                          {t("rdProcess.chat.topicOngoing")}
                        </Tag>
                      )}
                      {isDone && (
                        <Tag
                          style={{
                            background: "var(--bg-subtle)",
                            color: "var(--muted2)",
                            border: `1px solid ${border}`,
                            fontSize: 10,
                            marginInlineEnd: 0,
                            flexShrink: 0,
                          }}
                        >
                          {t("rdProcess.chat.topicDone")}
                        </Tag>
                      )}
                    </div>
                    {isSelected && (
                      <div
                        style={{
                          marginLeft: 25,
                          marginTop: 4,
                          marginBottom: 6,
                          padding: "8px 12px",
                          background: "color-mix(in srgb, var(--bg-app) 80%, transparent)",
                          borderRadius: 8,
                          border: `1px solid ${border}`,
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        <Space size={6} align="start">
                          <Zap size={11} color="var(--warning)" style={{ flexShrink: 0, marginTop: 2 }} />
                          <div>
                            <Text style={{ fontSize: 10, color: muted, fontWeight: 500 }}>{t("rdProcess.chat.actionLabel")}</Text>
                            <Text style={{ fontSize: 11, color: text, marginLeft: 4 }}>{t(item.actionKey)}</Text>
                          </div>
                        </Space>
                        <Space size={6} align="start">
                          <Target size={11} color={primary} style={{ flexShrink: 0, marginTop: 2 }} />
                          <div>
                            <Text style={{ fontSize: 10, color: muted, fontWeight: 500 }}>{t("rdProcess.chat.goalLabel")}</Text>
                            <Text style={{ fontSize: 11, color: text, marginLeft: 4 }}>{t(item.goalKey)}</Text>
                          </div>
                        </Space>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 16px 8px",
            background: "var(--bg-app)",
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          {messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                display: "flex",
                justifyContent: msg.sender === "user" ? "flex-end" : "flex-start",
              }}
            >
              <div
                style={{
                  display: "flex",
                  maxWidth: "86%",
                  flexDirection: msg.sender === "user" ? "row-reverse" : "row",
                  gap: 10,
                  alignItems: "flex-start",
                }}
              >
                <Avatar
                  size={32}
                  style={{
                    background: msg.sender === "user" ? "var(--brand)" : "color-mix(in srgb, var(--brand) 85%, #6366f1)",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginTop: 22,
                  }}
                  icon={msg.sender === "user" ? <User size={15} /> : <Cpu size={15} />}
                />
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: msg.sender === "user" ? "flex-end" : "flex-start",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      marginBottom: 5,
                      paddingInline: 4,
                      fontWeight: 500,
                      color: msg.sender === "user" ? primary : "var(--brand2)",
                    }}
                  >
                    {msg.sender === "user" ? t("rdProcess.chat.userName") : t("rdProcess.chat.aiName")}
                  </Text>
                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: 16,
                      borderTopRightRadius: msg.sender === "user" ? 4 : 16,
                      borderTopLeftRadius: msg.sender === "user" ? 16 : 4,
                      background: msg.sender === "user" ? primary : panel,
                      border: msg.sender === "user" ? "none" : `1px solid ${border}`,
                    }}
                  >
                    <Text
                      style={{
                        color: msg.sender === "user" ? "#fff" : text,
                        fontSize: 13,
                        lineHeight: 1.65,
                        whiteSpace: "pre-wrap",
                        display: "block",
                      }}
                    >
                      {msg.text}
                    </Text>
                  </div>
                  <Text
                    style={{
                      fontSize: 11,
                      color: "var(--muted2)",
                      marginTop: 5,
                      paddingInline: 4,
                      fontFamily: "monospace",
                    }}
                  >
                    {msg.time}
                  </Text>
                </div>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <div
          style={{
            flexShrink: 0,
            padding: "6px 12px 6px 16px",
            background: panel,
            borderTop: `1px solid ${border}`,
            display: "flex",
            alignItems: "center",
            gap: 0,
          }}
        >
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 8,
              overflowX: "auto",
              minWidth: 0,
              paddingRight: 8,
              scrollbarWidth: "none",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                height: 28,
                padding: "0 10px 0 4px",
                background: "color-mix(in srgb, var(--primary) 10%, transparent)",
                border: `1px solid color-mix(in srgb, var(--primary) 30%, transparent)`,
                borderRadius: 20,
                cursor: "default",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "var(--brand)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <User size={11} color="white" />
              </div>
              <Text style={{ fontSize: 12, color: "var(--brand2)" }}>{t("rdProcess.chat.userName")}</Text>
            </div>

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                height: 28,
                padding: "0 10px 0 4px",
                background: brandMix,
                border: `1px solid color-mix(in srgb, var(--brand) 35%, transparent)`,
                borderRadius: 20,
                cursor: "default",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "color-mix(in srgb, var(--brand) 80%, #4f46e5)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Cpu size={11} color="white" />
              </div>
              <Text style={{ fontSize: 12, color: "var(--brand2)" }}>{t("rdProcess.chat.aiName")}</Text>
            </div>
          </div>

          <div style={{ flexShrink: 0, width: 1, height: 20, background: border, marginRight: 8 }} />

          <button
            type="button"
            style={{
              flexShrink: 0,
              width: 28,
              height: 28,
              borderRadius: "50%",
              border: `1px dashed ${muted}`,
              background: "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: muted,
              transition: "border-color 0.2s, color 0.2s, background 0.2s",
            }}
            title={t("rdProcess.chat.addParticipant")}
          >
            <Plus size={13} />
          </button>
        </div>
      </div>

      <div
        style={{
          padding: "12px 16px 14px",
          background: sub,
          borderTop: `1px solid ${border}`,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            background: "var(--bg-app)",
            border: `1px solid ${border}`,
            borderRadius: 12,
            overflow: "hidden",
            transition: "border-color 0.2s",
          }}
        >
          <Button
            type="text"
            icon={<Paperclip size={17} />}
            style={{
              color: muted,
              padding: "8px 12px",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              height: "auto",
            }}
          />
          <Input.TextArea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={t("rdProcess.chat.placeholder")}
            variant="borderless"
            autoSize={{ minRows: 1, maxRows: 5 }}
            style={{
              flex: 1,
              background: "transparent",
              color: text,
              resize: "none",
              padding: "10px 4px",
              fontSize: 13,
            }}
          />
          <Button
            type="text"
            onClick={handleSend}
            disabled={!inputValue.trim()}
            icon={<Send size={17} />}
            style={{
              color: inputValue.trim() ? primary : "var(--muted2)",
              padding: "8px 12px",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              height: "auto",
              transition: "color 0.2s",
            }}
          />
        </div>
        <div style={{ marginTop: 8, textAlign: "center" }}>
          <Text style={{ fontSize: 11, color: "var(--muted2)" }}>
            {t("rdProcess.chat.hintEnter")}
            <kbd
              style={{
                padding: "1px 5px",
                background: "var(--bg-subtle)",
                borderRadius: 4,
                border: `1px solid ${border}`,
                fontFamily: "monospace",
                fontSize: 10,
                color: muted,
                margin: "0 4px",
              }}
            >
              Enter
            </kbd>
            {t("rdProcess.chat.hintSend")}
            <kbd
              style={{
                padding: "1px 5px",
                background: "var(--bg-subtle)",
                borderRadius: 4,
                border: `1px solid ${border}`,
                fontFamily: "monospace",
                fontSize: 10,
                color: muted,
                margin: "0 4px",
              }}
            >
              Shift+Enter
            </kbd>
            {t("rdProcess.chat.hintNewline")}
          </Text>
        </div>
      </div>
    </div>
  );
}
