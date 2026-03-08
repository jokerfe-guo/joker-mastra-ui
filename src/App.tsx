import { FormEvent, useEffect, useRef, useState } from "react";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  status?: "streaming" | "done" | "error";
};

type AgentEvent = {
  type?: string;
  payload?: Record<string, unknown>;
  output?: {
    text?: string;
  };
};

const starterPrompts = ["你好", "请总结今天的工作重点", "帮我写一份周报提纲"];
const STREAM_API_URL =
  "https://joker-mastra-2.jokul0518.workers.dev/api/stream";

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function toPlainMessage(message: ChatMessage) {
  return {
    role: message.role,
    content: message.content
  };
}

function parseEventChunk(chunk: string) {
  const lines = chunk.split("\n");
  const dataLines = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());

  if (dataLines.length === 0) {
    return null;
  }

  return dataLines.join("\n");
}

function extractAssistantDelta(event: AgentEvent) {
  const payload = event.payload ?? {};

  const directCandidates = [
    payload.textDelta,
    payload.delta,
    payload.text,
    payload.content,
    payload.answer
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }

  const outputText = event.output?.text;

  if (typeof outputText === "string" && outputText.length > 0) {
    return outputText;
  }

  return "";
}

function extractErrorMessage(event: AgentEvent) {
  const payload = event.payload ?? {};
  const error = payload.error;

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = error.message;

    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  return "流式调用失败。";
}

async function consumeSseStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (rawData: string) => void
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const eventData = parseEventChunk(chunk);

      if (!eventData) {
        continue;
      }

      onEvent(eventData);
    }
  }

  const rest = buffer.trim();
  const lastEvent = rest ? parseEventChunk(rest) : null;

  if (lastEvent) {
    onEvent(lastEvent);
  }
}

export default function App() {
  const [draft, setDraft] = useState("你好");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState("等待发送");
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const chatViewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatViewportRef.current?.scrollTo({
      top: chatViewportRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [messages]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const content = draft.trim();

    if (!content || isStreaming) {
      return;
    }

    const userMessage: ChatMessage = {
      id: createId("user"),
      role: "user",
      content
    };

    const assistantMessageId = createId("assistant");
    const assistantPlaceholder: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      status: "streaming"
    };

    const nextMessages = [...messages, userMessage, assistantPlaceholder];
    const controller = new AbortController();

    abortRef.current = controller;
    setDraft("");
    setError("");
    setStatus("正在连接 Worker...");
    setMessages(nextMessages);
    setIsStreaming(true);

    try {
      const response = await fetch(STREAM_API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          messages: nextMessages
            .filter((item) => item.role === "user" || item.role === "assistant")
            .map(toPlainMessage)
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`请求失败，HTTP ${response.status}`);
      }

      if (!response.body) {
        throw new Error("响应中没有可读取的流。");
      }

      setStatus("流式输出中");

      await consumeSseStream(response.body, (rawData) => {
        if (rawData === "[DONE]") {
          setStatus("流已结束");
          return;
        }

        let parsed: AgentEvent;

        try {
          parsed = JSON.parse(rawData) as AgentEvent;
        } catch {
          parsed = {
            type: "raw",
            payload: {
              text: rawData
            }
          };
        }

        const eventType = parsed.type ?? "unknown";
        if (eventType === "error") {
          const message = extractErrorMessage(parsed);

          setError(message);
          setStatus("流式调用报错");
          setMessages((current) =>
            current.map((item) =>
              item.id === assistantMessageId
                ? {
                    ...item,
                    content: item.content || message,
                    status: "error"
                  }
                : item
            )
          );
          return;
        }

        const delta = extractAssistantDelta(parsed);

        if (!delta) {
          return;
        }

        setMessages((current) =>
          current.map((item) => {
            if (item.id !== assistantMessageId) {
              return item;
            }

            const shouldReplace = parsed.type === "finish" && !item.content;

            return {
              ...item,
              content: shouldReplace ? delta : `${item.content}${delta}`,
              status: "streaming"
            };
          })
        );
      });

      setMessages((current) =>
        current.map((item) =>
          item.id === assistantMessageId
            ? {
                ...item,
                content: item.content || "本次流没有返回文本内容。",
                status: item.status === "error" ? "error" : "done"
              }
            : item
        )
      );
    } catch (requestError) {
      if (controller.signal.aborted) {
        setStatus("已手动停止");
        setMessages((current) =>
          current.map((item) =>
            item.id === assistantMessageId
              ? {
                  ...item,
                  content: item.content || "已停止本次生成。",
                  status: "done"
                }
              : item
          )
        );
      } else {
        const message =
          requestError instanceof Error ? requestError.message : "未知错误";

        setError(message);
        setStatus("请求失败");
        setMessages((current) =>
          current.map((item) =>
            item.id === assistantMessageId
              ? {
                  ...item,
                  content: item.content || message,
                  status: "error"
                }
              : item
          )
        );
      }
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  }

  function stopStream() {
    abortRef.current?.abort();
  }

  function clearSession() {
    if (isStreaming) {
      abortRef.current?.abort();
    }

    setMessages([]);
    setError("");
    setStatus("等待发送");
  }

  return (
    <div className="app-shell">
      <div className="backdrop backdrop-left" />
      <div className="backdrop backdrop-right" />

      <main className="layout">
        <section className="panel hero-panel">
          <div className="hero-copy">
            <p className="eyebrow">Cloudflare Workers + React + Vite</p>
            <h1>Agent 流式调试台</h1>
            <p className="hero-text">
              页面会直接请求远端的 <code>{STREAM_API_URL}</code>，并在当前窗口里展示
              agent 的 SSE 流式输出。
            </p>
          </div>

          <div className="meta-grid">
            <article className="meta-card">
              <span className="meta-label">当前状态</span>
              <strong>{status}</strong>
            </article>
            <article className="meta-card">
              <span className="meta-label">消息数</span>
              <strong>{messages.length}</strong>
            </article>
            <article className="meta-card">
              <span className="meta-label">调用方式</span>
              <strong>SSE</strong>
            </article>
          </div>

          <div className="starter-list">
            {starterPrompts.map((prompt) => (
              <button
                key={prompt}
                className="ghost-chip"
                type="button"
                onClick={() => setDraft(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>
        </section>

        <section className="panel chat-panel">
          <div className="panel-header">
            <div>
              <h2>对话</h2>
              <p>输入消息后，agent 会在同一窗口里实时输出。</p>
            </div>
            <div className="action-row">
              <button
                className="secondary-button"
                type="button"
                onClick={clearSession}
              >
                清空
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={stopStream}
                disabled={!isStreaming}
              >
                停止
              </button>
            </div>
          </div>

          <div className="chat-viewport" ref={chatViewportRef}>
            {messages.length === 0 ? (
              <div className="empty-state">
                <p>输入一条消息后开始流式调用。</p>
              </div>
            ) : (
              messages.map((message) => (
                <article
                  key={message.id}
                  className={`bubble bubble-${message.role}`}
                >
                  <div className="bubble-meta">
                    <span>{message.role === "user" ? "User" : "Agent"}</span>
                    {message.status ? (
                      <span className={`status status-${message.status}`}>
                        {message.status}
                      </span>
                    ) : null}
                  </div>
                  <p>{message.content || "..."}</p>
                </article>
              ))
            )}
          </div>

          <form className="composer" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="prompt">
              输入消息
            </label>
            <textarea
              id="prompt"
              rows={4}
              placeholder="输入你要发给 agent 的内容"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <div className="composer-footer">
              <span className="hint">
                请求体会按 <code>{`{ messages }`}</code> 结构发送。
              </span>
              <button className="primary-button" type="submit" disabled={isStreaming}>
                {isStreaming ? "生成中..." : "发送消息"}
              </button>
            </div>
          </form>
        </section>
      </main>

      {error ? <div className="floating-error">{error}</div> : null}
    </div>
  );
}
