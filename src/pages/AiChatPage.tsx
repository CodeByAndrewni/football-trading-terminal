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
  "我是「足球数据分析助手」。每次请求会附带当刻 live 快照，并把近若干天的判断记录从数据库读入模型，便于复盘。聊天窗口本身的多轮对话不会自动上传，记忆靠数据库而非浏览器。";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-text-muted hover:text-text-secondary"
      title="复制"
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-green-400" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
    </button>
  );
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1 className="text-base font-bold text-text-primary mt-3 mb-1 first:mt-0">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-sm font-bold text-text-primary mt-3 mb-1 first:mt-0">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-sm font-semibold text-accent-primary mt-2 mb-1 first:mt-0">
            {children}
          </h3>
        ),
        p: ({ children }) => (
          <p className="text-sm text-text-primary mb-2 last:mb-0 leading-relaxed">
            {children}
          </p>
        ),
        ul: ({ children }) => (
          <ul className="text-sm text-text-primary mb-2 space-y-0.5 pl-4 list-disc">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="text-sm text-text-primary mb-2 space-y-0.5 pl-4 list-decimal">
            {children}
          </ol>
        ),
        li: ({ children }) => (
          <li className="leading-relaxed">{children}</li>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-text-primary">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="italic text-text-secondary">{children}</em>
        ),
        code: ({ children, className }) => {
          const isBlock = className?.includes("language-");
          return isBlock ? (
            <code className="block bg-bg-page/80 border border-border-default rounded px-3 py-2 text-xs font-mono text-accent-primary my-2 overflow-x-auto whitespace-pre">
              {children}
            </code>
          ) : (
            <code className="bg-bg-page/80 border border-border-default rounded px-1 py-0.5 text-xs font-mono text-accent-primary">
              {children}
            </code>
          );
        },
        pre: ({ children }) => <>{children}</>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-accent-primary/40 pl-3 my-2 text-text-secondary italic text-sm">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="border-border-default my-3" />,
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-primary underline hover:brightness-125"
          >
            {children}
          </a>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="text-xs border-collapse w-full">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-border-default px-2 py-1 bg-bg-page/60 text-text-primary font-semibold text-left">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-border-default px-2 py-1 text-text-secondary">
            {children}
          </td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export default function AiChatPage() {
  const [input, setInput] = useState("");
  type AiMode = "DEEPSEEK" | "PERPLEXITY" | "HYBRID";
  const [aiMode, setAiMode] = useState<AiMode>("DEEPSEEK");
  const [agentEnabled, setAgentEnabled] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { id: uid(), role: "assistant", content: WELCOME },
  ]);
  const [loading, setLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const usedMatchPills = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    return last?.usedMatchIds ?? [];
  }, [messages]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on message/loading change
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

    try {
      const useAgent = agentEnabled && aiMode === "DEEPSEEK";
      const resp = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          topN: 10,
          mode: aiMode,
          agent: useAgent,
          persistJournal: true,
          journalDays: 10,
          journalLimit: 20,
        }),
      });

      const data = (await resp.json().catch(() => ({}))) as AiChatApiResponse;

      if (!resp.ok) {
        const errText = data.error?.message ?? `请求失败（HTTP ${resp.status}）`;
        setMessages((prev) => [
          ...prev,
          { id: uid(), role: "assistant", content: `❌ ${errText}` },
        ]);
        return;
      }

      const answer = typeof data.answer === "string" ? data.answer : null;
      const journalEntryId =
        typeof data.journalEntryId === "string" ? data.journalEntryId : undefined;

      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: answer ?? "模型未返回有效答案，请稍后重试。",
          journalEntryId,
          usedMatchIds: Array.isArray(data.usedMatchIds) ? data.usedMatchIds : undefined,
          limitations: Array.isArray(data.limitations) ? data.limitations : undefined,
          agent: data.agent,
        },
      ]);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "请求失败，请稍后再试。";
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "assistant", content: `❌ ${errMsg}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-bg-page pt-16">
      {/* 顶栏 */}
      <div className="flex-none px-3 sm:px-6 pt-4 pb-2">
        <div className="max-w-4xl mx-auto card-glow">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-accent-primary" />
              <div>
                <div className="font-semibold text-text-primary">AI 问答</div>
                <div className="text-xs text-text-secondary">
                  实时 live 快照 + 历史判断记忆；Agent 模式由 DeepSeek 多轮调用数据工具
                </div>
              </div>
            </div>
            <button
              type="button"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-default text-text-secondary hover:text-text-primary hover:bg-bg-component transition-all disabled:opacity-50 text-xs"
              disabled={loading || messages.length <= 1}
              onClick={() => {
                setMessages([{ id: uid(), role: "assistant", content: WELCOME }]);
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              清空
            </button>
          </div>
        </div>
      </div>

      {/* 消息区 — flex-1 撑满剩余高度 */}
      <div className="flex-1 overflow-hidden px-3 sm:px-6 py-2">
        <div
          ref={scrollRef}
          className="max-w-4xl mx-auto h-full card bg-bg-card/70 backdrop-blur-sm overflow-y-auto"
        >
          <div className="space-y-3 p-1">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`group relative px-3 py-2.5 rounded-lg ${
                  m.role === "user"
                    ? "bg-accent-primary/10 border border-accent-primary/20"
                    : "bg-bg-component border border-border-default"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-text-muted">
                    {m.role === "user" ? "你" : "助手"}
                  </span>
                  {m.role === "assistant" && <CopyButton text={m.content} />}
                </div>

                {m.role === "assistant" ? (
                  <div className="prose-chat">
                    <MarkdownContent content={m.content} />
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap text-sm text-text-primary">
                    {m.content}
                  </div>
                )}

                {m.role === "assistant" && m.usedMatchIds && m.usedMatchIds.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.usedMatchIds.slice(0, 8).map((id) => (
                      <span
                        key={id}
                        className="pill pill-muted font-mono text-xs bg-bg-component/60"
                        title={`matchId=${id}`}
                      >
                        #{id}
                      </span>
                    ))}
                  </div>
                )}

                {m.role === "assistant" && m.limitations && m.limitations.length > 0 && (
                  <div className="mt-2 text-xs text-accent-warning/90 space-y-0.5">
                    {m.limitations.map((x, i) => (
                      <div key={`${m.id}-lim-${i}`}>• {x}</div>
                    ))}
                  </div>
                )}

                {m.role === "assistant" && m.journalEntryId && (
                  <div className="mt-1.5 text-xs text-text-muted font-mono opacity-60">
                    📝 journal: {m.journalEntryId}
                  </div>
                )}

                {m.role === "assistant" && m.agent && (
                  <div className="mt-1.5 text-xs text-text-muted font-mono opacity-60">
                    🤖 工具轮次 {m.agent.toolRounds} · API-Football{" "}
                    {m.agent.footballCallsUsed}/{m.agent.maxFootballCalls}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="px-3 py-2.5 rounded-lg bg-bg-component border border-border-default">
                <div className="flex items-center gap-2 text-sm text-text-secondary">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  思考中…
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 输入区 — flex-none 固定在底部 */}
      <div className="flex-none px-3 sm:px-6 pb-4 pt-2">
        <div className="max-w-4xl mx-auto card space-y-2">
          <div className="flex items-center gap-3">
            <div className="text-xs text-text-secondary">模型</div>
            <select
              className="bg-bg-component border border-border-default rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent-primary"
              value={aiMode}
              onChange={(e) => {
                const v = e.target.value as AiMode;
                setAiMode(v);
                if (v !== "DEEPSEEK") setAgentEnabled(false);
              }}
            >
              <option value="DEEPSEEK">DeepSeek（推荐）</option>
              <option value="HYBRID">HYBRID（Perplexity + DeepSeek）</option>
              <option value="PERPLEXITY">仅 Perplexity</option>
            </select>

            <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer select-none ml-auto">
              <input
                type="checkbox"
                className="rounded border-border-default"
                checked={agentEnabled && aiMode === "DEEPSEEK"}
                disabled={loading || aiMode !== "DEEPSEEK"}
                onChange={(e) => setAgentEnabled(e.target.checked)}
              />
              <span title="多轮调用 KV 与 API-Football，仅 DEEPSEEK 模式">
                Agent 模式
              </span>
            </label>
          </div>

          <div className="flex items-end gap-2">
            <textarea
              className="flex-1 min-h-[44px] max-h-[120px] bg-bg-component border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-primary resize-none"
              placeholder="输入问题，Enter 发送，Shift+Enter 换行…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              disabled={loading}
            />
            <button
              type="button"
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-accent-primary text-bg-page hover:brightness-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              onClick={() => void send()}
              disabled={loading || input.trim().length === 0}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              发送
            </button>
          </div>

          {usedMatchPills.length > 0 && (
            <div className="text-xs text-text-secondary flex flex-wrap items-center gap-1.5">
              <span>上次引用：</span>
              {usedMatchPills.slice(0, 10).map((id) => (
                <span key={`pill-${id}`} className="pill pill-muted font-mono">
                  #{id}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
