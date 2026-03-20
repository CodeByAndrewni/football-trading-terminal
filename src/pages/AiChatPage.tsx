import { Bot, Loader2, Send, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type ChatRole = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  usedMatchIds?: number[];
  limitations?: string[];
  /** Agent 模式：服务端返回的工具轮次与 API-Football 用量 */
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

export default function AiChatPage() {
  const [input, setInput] = useState("");
  type AiMode = "MINIMAX" | "PERPLEXITY" | "HYBRID";
  const [aiMode, setAiMode] = useState<AiMode>("HYBRID");
  /** 仅 MINIMAX + Agent：多轮工具调用 KV / API-Football */
  const [agentEnabled, setAgentEnabled] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: uid(),
      role: "assistant",
      content:
        "我可以基于当前 live 聚合比赛数据，帮你做问答式分析。\n\n你可以问：\n- 哪几场当前更像“进球机会”？\n- 角球/射门/红牌风险分别是什么？\n- 你的过滤条件下有哪些候选？\n\n注意：角球目前只有“总数”，没有分钟级时间戳，所以“85 分钟后角球概率/角球分钟级统计”无法直接精确计算。",
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const usedMatchPills = useMemo(() => {
    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m.role === "assistant");
    return lastAssistant?.usedMatchIds ?? [];
  }, [messages]);

  // 消息或 loading 变化时容器高度会变，需要滚到底部
  // biome-ignore lint/correctness/useExhaustiveDependencies: 依赖 messages/loading 以同步滚动
  useEffect(() => {
    // 滚到底部，保证新消息可见
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    setErrorBanner(null);
    setLoading(true);
    setInput("");

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      content: text,
    };

    setMessages((prev) => [...prev, userMsg]);

    try {
      const useAgent = agentEnabled && aiMode === "MINIMAX";

      const resp = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          topN: 10,
          mode: aiMode,
          agent: useAgent,
        }),
      });

      const data = (await resp.json().catch(() => ({}))) as AiChatApiResponse;
      if (!resp.ok) {
        setErrorBanner(
          data.error?.message ?? `请求失败（HTTP ${resp.status}）`,
        );
        setMessages((prev) => prev.slice(0, -1));
        return;
      }

      const answer = typeof data.answer === "string" ? data.answer : null;

      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content:
            answer ??
            "模型未返回有效答案。你可以稍后再试，或换一个问题（例如更具体的“数据拆解/风险点”。）",
          usedMatchIds: Array.isArray(data.usedMatchIds)
            ? data.usedMatchIds
            : undefined,
          limitations: Array.isArray(data.limitations)
            ? data.limitations
            : undefined,
          agent: data.agent,
        },
      ]);
    } catch (e) {
      setErrorBanner(e instanceof Error ? e.message : "请求失败，请稍后再试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg-page pt-16 px-3 sm:px-6 pb-10">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="card-glow">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-accent-primary" />
              <div>
                <div className="font-semibold text-text-primary">AI 问答</div>
                <div className="text-xs text-text-secondary">
                  默认单次上下文；开启 Agent 后由模型多轮调用 KV / API-Football
                  工具（仅 MINIMAX）。
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border-default text-text-secondary hover:text-text-primary hover:bg-bg-component transition-all disabled:opacity-50"
                disabled={loading || messages.length <= 1}
                onClick={() => {
                  setMessages([
                    {
                      id: uid(),
                      role: "assistant",
                      content:
                        "我可以基于当前 live 聚合比赛数据，帮你做问答式分析。\n\n注意：角球目前只有“总数”，没有分钟级时间戳，所以“85 分钟后角球概率/角球分钟级统计”无法直接精确计算。",
                    },
                  ]);
                  setErrorBanner(null);
                }}
              >
                <Trash2 className="w-4 h-4" />
                清空
              </button>
            </div>
          </div>
        </div>

        {errorBanner && (
          <div className="card border border-accent-danger/40 bg-accent-danger/10 text-accent-danger">
            {errorBanner}
          </div>
        )}

        <div
          ref={scrollRef}
          className="card bg-bg-card/70 backdrop-blur-sm h-[60vh] overflow-auto"
        >
          <div className="space-y-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`px-3 py-2 rounded-lg ${
                  m.role === "user"
                    ? "bg-accent-primary/10 border border-accent-primary/20"
                    : "bg-bg-component border border-border-default"
                }`}
              >
                <div className="text-xs text-text-muted mb-1">
                  {m.role === "user" ? "你" : "助手"}
                </div>
                <div className="whitespace-pre-wrap text-sm text-text-primary">
                  {m.content}
                </div>

                {m.role === "assistant" &&
                  m.usedMatchIds &&
                  m.usedMatchIds.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {m.usedMatchIds.slice(0, 8).map((id) => (
                        <span
                          key={id}
                          className="pill pill-muted font-mono bg-bg-component/60"
                          title={`matchId=${id}`}
                        >
                          #{id}
                        </span>
                      ))}
                    </div>
                  )}

                {m.role === "assistant" &&
                  m.limitations &&
                  m.limitations.length > 0 && (
                    <div className="mt-2 text-xs text-accent-warning/90">
                      {m.limitations.map((x, i) => (
                        <div key={`${m.id}-lim-${i}`} className="mt-1">
                          • {x}
                        </div>
                      ))}
                    </div>
                  )}

                {m.role === "assistant" && m.agent && (
                  <div className="mt-2 text-xs text-text-muted font-mono">
                    Agent：工具轮次 {m.agent.toolRounds} · API-Football{" "}
                    {m.agent.footballCallsUsed}/{m.agent.maxFootballCalls}
                    {typeof m.agent.maxToolRounds === "number"
                      ? ` · 最大轮次 ${m.agent.maxToolRounds}`
                      : ""}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="px-3 py-2 rounded-lg bg-bg-component border border-border-default">
                <div className="flex items-center gap-2 text-sm text-text-secondary">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  思考中...
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-text-secondary">模型模式</div>
            <div className="flex items-center gap-2">
              <select
                className="bg-bg-component border border-border-default rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-accent-primary"
                value={aiMode}
                onChange={(e) => {
                  const v = e.target.value as AiMode;
                  setAiMode(v);
                  if (v !== "MINIMAX") setAgentEnabled(false);
                }}
              >
                <option value="HYBRID">
                  HYBRID（Perplexity 方法论 + Minimax JSON 结论）
                </option>
                <option value="MINIMAX">MINIMAX（仅 Minimax）</option>
                <option value="PERPLEXITY">PERPLEXITY（仅 Perplexity）</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-text-secondary">Agent 工具循环</div>
            <label className="flex items-center gap-2 text-xs text-text-primary cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded border-border-default"
                checked={agentEnabled && aiMode === "MINIMAX"}
                disabled={loading || aiMode !== "MINIMAX"}
                onChange={(e) => setAgentEnabled(e.target.checked)}
              />
              <span title="多轮调用 KV 与 API-Football 端点，仅支持 MINIMAX 模式">
                启用（多轮工具，耗配额）
              </span>
            </label>
          </div>

          <div className="flex items-end gap-2">
            <textarea
              className="flex-1 min-h-[44px] max-h-[140px] bg-bg-component border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-primary resize-none"
              placeholder="输入问题，例如：85分钟后哪些比赛角球更可能？"
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
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-accent-primary text-bg-page hover:brightness-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => void send()}
              disabled={loading || input.trim().length === 0}
              title="发送"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              发送
            </button>
          </div>

          <div className="text-xs text-text-secondary">
            提示：你可以问“基于当前屏幕/Top 10
            候选，哪个更适合追进球？”或直接问某个联赛/球队。Agent
            模式下由模型按需拉取数据，耗时与 API 调用次数更高。
          </div>

          {usedMatchPills.length > 0 && (
            <div className="text-xs text-text-secondary">
              最近一次回答引用的比赛：
              <span className="ml-2 inline-flex flex-wrap gap-2">
                {usedMatchPills.slice(0, 10).map((id) => (
                  <span
                    key={`pill-${id}`}
                    className="pill pill-muted font-mono"
                  >
                    #{id}
                  </span>
                ))}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
