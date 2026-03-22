import { Bot, Check, Copy, Loader2, Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ChatRole = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  usedMatchIds?: number[];
  journalEntryId?: string;
  limitations?: string[];
  agent?: {
    toolRounds: number;
    footballCallsUsed: number;
    maxFootballCalls: number;
    maxToolRounds?: number;
  };
}

interface AiChatApiResponse {
  success?: boolean;
  answer?: string;
  usedMatchIds?: number[];
  limitations?: string[];
  journalEntryId?: string;
  debug?: unknown;
  error?: { code?: string; message?: string };
  agent?: {
    toolRounds: number;
    footballCallsUsed: number;
    maxFootballCalls: number;
    maxToolRounds?: number;
  };
}

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

const WELCOME =
  "滚球交易决策顾问就绪。发送任意问题开始分析——我会基于实时数据给出交易建议（入场/跳过/观望 + 市场方向 + 置信度）。";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 5000);
    });
  }, [text]);
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-text-muted hover:text-text-secondary"
      title="复制"
    >
      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 className="text-sm font-bold text-text-primary mt-2 mb-1 first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-bold text-text-primary mt-2 mb-1 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="text-xs font-semibold text-accent-primary mt-1.5 mb-0.5 first:mt-0">{children}</h3>,
        p: ({ children }) => <p className="text-xs text-text-primary mb-1.5 last:mb-0 leading-relaxed">{children}</p>,
        ul: ({ children }) => <ul className="text-xs text-text-primary mb-1.5 space-y-0.5 pl-3 list-disc">{children}</ul>,
        ol: ({ children }) => <ol className="text-xs text-text-primary mb-1.5 space-y-0.5 pl-3 list-decimal">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-text-primary">{children}</strong>,
        em: ({ children }) => <em className="italic text-text-secondary">{children}</em>,
        code: ({ children, className }) => {
          const isBlock = className?.includes("language-");
          return isBlock ? (
            <code className="block bg-bg-page/80 border border-border-default rounded px-2 py-1.5 text-xs font-mono text-accent-primary my-1.5 overflow-x-auto whitespace-pre">{children}</code>
          ) : (
            <code className="bg-bg-page/80 border border-border-default rounded px-1 py-0.5 text-xs font-mono text-accent-primary">{children}</code>
          );
        },
        pre: ({ children }) => <>{children}</>,
        blockquote: ({ children }) => <blockquote className="border-l-2 border-accent-primary/40 pl-2 my-1.5 text-text-secondary italic text-xs">{children}</blockquote>,
        hr: () => <hr className="border-border-default my-2" />,
        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent-primary underline hover:brightness-125">{children}</a>,
        table: ({ children }) => <div className="overflow-x-auto my-1.5"><table className="text-xs border-collapse w-full">{children}</table></div>,
        th: ({ children }) => <th className="border border-border-default px-1.5 py-0.5 bg-bg-page/60 text-text-primary font-semibold text-left">{children}</th>,
        td: ({ children }) => <td className="border border-border-default px-1.5 py-0.5 text-text-secondary">{children}</td>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

interface AiChatPanelProps {
  className?: string;
}

export function AiChatPanel({ className }: AiChatPanelProps) {
  const [input, setInput] = useState("");
  type AiMode = "DEEPSEEK" | "PERPLEXITY" | "HYBRID";
  const [aiMode, setAiMode] = useState<AiMode>("DEEPSEEK");
  const [agentEnabled, setAgentEnabled] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { id: uid(), role: "assistant", content: WELCOME },
  ]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  /** 切换 Agent 开关时保留聊天历史，只追加一条提示 */
  const prevAgentRef = useRef(agentEnabled);
  useEffect(() => {
    if (prevAgentRef.current !== agentEnabled && messages.length > 1) {
      const label = agentEnabled ? "Agent 模式" : "普通模式";
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "assistant", content: `已切换到 **${label}**，历史聊天保留。` },
      ]);
    }
    prevAgentRef.current = agentEnabled;
  }, [agentEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on change
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setLoading(true);
    setInput("");
    setMessages((prev) => [...prev, { id: uid(), role: "user", content: text }]);

    const useAgent = agentEnabled && aiMode === "DEEPSEEK";
    const canStream = aiMode === "DEEPSEEK" && !useAgent;

    // 构建对话历史（最近 8 轮，截断过长回复避免打爆 token）
    const MAX_HISTORY_PAIRS = 8;
    const ASSISTANT_TRIM = 1200;
    const historyForApi = messages
      .filter((m) => m.content !== WELCOME && !m.content.startsWith("已切换到"))
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-(MAX_HISTORY_PAIRS * 2))
      .map((m) => ({
        role: m.role as string,
        content:
          m.role === "assistant" && m.content.length > ASSISTANT_TRIM
            ? m.content.slice(0, ASSISTANT_TRIM) + "\n…（已截断）"
            : m.content,
      }));

    try {
      const resp = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text, topN: 20, mode: aiMode, agent: useAgent,
          history: historyForApi,
          stream: canStream,
          persistJournal: true, journalDays: 10, journalLimit: 20,
        }),
      });

      // Non-streaming path (agent, hybrid, perplexity, or stream unsupported)
      if (!canStream || !resp.body || !resp.headers.get("content-type")?.includes("text/event-stream")) {
        const data = (await resp.json().catch(() => ({}))) as AiChatApiResponse;
        if (!resp.ok) {
          setMessages((prev) => [...prev, { id: uid(), role: "assistant", content: `❌ ${data.error?.message ?? `HTTP ${resp.status}`}` }]);
          return;
        }
        const answer = typeof data.answer === "string" ? data.answer : null;
        setMessages((prev) => [...prev, {
          id: uid(), role: "assistant",
          content: answer ?? "模型未返回有效答案，请稍后重试。",
          journalEntryId: typeof data.journalEntryId === "string" ? data.journalEntryId : undefined,
          usedMatchIds: Array.isArray(data.usedMatchIds) ? data.usedMatchIds : undefined,
          limitations: Array.isArray(data.limitations) ? data.limitations : undefined,
          agent: data.agent,
        }]);
        return;
      }

      // Streaming path
      const assistantId = uid();
      setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (!payload) continue;
          try {
            const evt = JSON.parse(payload);
            if (evt.t) {
              // Incremental text chunk
              setMessages((prev) =>
                prev.map((m) => m.id === assistantId ? { ...m, content: m.content + evt.t } : m)
              );
            }
            if (evt.done) {
              // Final metadata
              setMessages((prev) =>
                prev.map((m) => m.id === assistantId ? {
                  ...m,
                  journalEntryId: evt.journalEntryId ?? undefined,
                  usedMatchIds: evt.usedMatchIds ?? undefined,
                  limitations: evt.limitations ?? undefined,
                } : m)
              );
            }
            if (evt.error) {
              setMessages((prev) =>
                prev.map((m) => m.id === assistantId ? { ...m, content: m.content + `\n\n❌ ${evt.error}` } : m)
              );
            }
          } catch { /* skip malformed */ }
        }
      }

      // Handle case where stream had no content
      setMessages((prev) =>
        prev.map((m) => m.id === assistantId && !m.content ? { ...m, content: "模型未返回有效答案，请稍后重试。" } : m)
      );
    } catch (e) {
      setMessages((prev) => [...prev, { id: uid(), role: "assistant", content: `❌ ${e instanceof Error ? e.message : "请求失败"}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`flex flex-col bg-bg-page ${className ?? "h-full"}`}>
      {/* 头部 */}
      <div className="flex-none flex items-center justify-between gap-2 px-3 py-2 border-b border-border-default">
        <div className="flex items-center gap-1.5">
          <Bot className="w-4 h-4 text-accent-primary" />
          <span className="text-xs font-semibold text-text-primary">AI 交易顾问</span>
        </div>
        <div className="flex items-center gap-1.5">
          <select
            className="bg-bg-component border border-border-default rounded px-1.5 py-1 text-xs text-text-primary focus:outline-none"
            value={aiMode}
            onChange={(e) => {
              const next = e.target.value as AiMode;
              setAiMode(next);
              if (next !== "DEEPSEEK") setAgentEnabled(false);
              if (messages.length > 1) {
                setMessages((prev) => [
                  ...prev,
                  { id: uid(), role: "assistant", content: `已切换到 **${next}** 模式，历史聊天保留。` },
                ]);
              }
            }}
          >
            <option value="DEEPSEEK">DeepSeek</option>
            <option value="HYBRID">HYBRID</option>
            <option value="PERPLEXITY">Perplexity</option>
          </select>
          <label className="flex items-center gap-1 text-xs text-text-muted cursor-pointer">
            <input type="checkbox" className="rounded border-border-default w-3 h-3"
              checked={agentEnabled && aiMode === "DEEPSEEK"} disabled={loading || aiMode !== "DEEPSEEK"}
              onChange={(e) => setAgentEnabled(e.target.checked)} />
            Agent
          </label>
          <button type="button" disabled={loading || messages.length <= 1}
            onClick={() => setMessages([{ id: uid(), role: "assistant", content: WELCOME }])}
            className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg-component disabled:opacity-30" title="清空">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 消息区 — select-text 覆盖页面级 select-none，让用户可选取文字 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-2 select-text">
        <div className="space-y-2">
          {messages.map((m) => (
            <div key={m.id} className={`group relative px-2.5 py-2 rounded-lg ${
              m.role === "user" ? "bg-accent-primary/10 border border-accent-primary/20" : "bg-bg-component border border-border-default"
            }`}>
              <div className="flex items-center justify-between mb-0.5 select-none">
                <span className="text-xs text-text-muted">{m.role === "user" ? "你" : "助手"}</span>
                {m.role === "assistant" && <CopyButton text={m.content} />}
              </div>
              {m.role === "assistant" ? (
                <div className="prose-chat cursor-text"><MarkdownContent content={m.content} /></div>
              ) : (
                <div className="whitespace-pre-wrap text-xs text-text-primary cursor-text">{m.content}</div>
              )}
              {m.role === "assistant" && m.limitations && m.limitations.length > 0 && (
                <div className="mt-1 text-xs text-accent-warning/90 space-y-0.5">
                  {m.limitations.map((x, i) => <div key={`${m.id}-l-${i}`}>• {x}</div>)}
                </div>
              )}
              {m.role === "assistant" && m.journalEntryId && (
                <div className="mt-1 text-xs text-text-muted font-mono opacity-50">📝 {m.journalEntryId}</div>
              )}
              {m.role === "assistant" && m.agent && (
                <div className="mt-1 text-xs text-text-muted font-mono opacity-50">
                  🤖 轮次 {m.agent.toolRounds} · API {m.agent.footballCallsUsed}/{m.agent.maxFootballCalls}
                </div>
              )}
            </div>
          ))}
          {loading && !messages.some((m) => m.role === "assistant" && m.content === "") && (
            <div className="px-2.5 py-2 rounded-lg bg-bg-component border border-border-default">
              <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> 思考中…
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 输入区 */}
      <div className="flex-none border-t border-border-default px-2 py-2">
        <div className="flex items-end gap-1.5">
          <textarea
            className="flex-1 min-h-[36px] max-h-[100px] bg-bg-component border border-border-default rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent-primary resize-none"
            placeholder="输入问题，Enter 发送…"
            value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
            disabled={loading}
          />
          <button type="button"
            className="flex items-center justify-center px-3 py-1.5 rounded-lg bg-accent-primary text-bg-page hover:brightness-105 transition-all disabled:opacity-50 text-xs"
            onClick={() => void send()} disabled={loading || !input.trim()}>
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
