package handler

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"stardust/api/internal/config"
)

// SSE 事件类型
const (
	EventTextDelta       = "text_delta"
	EventMemoryCandidate = "memory_candidate"
	EventContextLoaded   = "context_loaded"
	EventDone            = "done"
	EventError           = "error"
)

// MemoryCandidate 是 Agent 从对话中提取的候选记忆条目
type MemoryCandidate struct {
	ID      string `json:"id"`
	Type    string `json:"type"` // preference | memory | task | opinion
	Content string `json:"content"`
}

// SendMessageRequest 是发送消息的请求体
type SendMessageRequest struct {
	Role       string `json:"role"` // user | tool_result
	Content    string `json:"content"`
	ToolCallID string `json:"tool_call_id,omitempty"` // tool_result 时使用
	Confirmed  *bool  `json:"confirmed,omitempty"`    // tool_result 时使用
}

// MessagesHandler 管理 messages 相关路由
type MessagesHandler struct {
	cfg config.Config
}

func NewMessagesHandler(cfg config.Config) *MessagesHandler {
	return &MessagesHandler{cfg: cfg}
}

// Send 发送消息并以 SSE 流式返回 Agent 回复
// POST /v1/conversations/:id/messages
func (h *MessagesHandler) Send(c fiber.Ctx) error {
	convID := c.Params("id")

	// 查找会话
	conversationStoreMu.Lock()
	conv, exists := conversationStore[convID]
	if !exists {
		conversationStoreMu.Unlock()
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "conversation not found"})
	}

	var req SendMessageRequest
	if err := c.Bind().JSON(&req); err != nil {
		conversationStoreMu.Unlock()
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	// 将用户消息追加到会话历史
	userMsg := Message{
		ID:         uuid.New().String(),
		Role:       req.Role,
		Content:    req.Content,
		ToolCallID: req.ToolCallID,
		Confirmed:  req.Confirmed,
		CreatedAt:  time.Now(),
	}
	conv.Messages = append(conv.Messages, userMsg)
	conv.UpdatedAt = time.Now()

	// 构建发给 LLM 的消息列表（快照，避免长时间持锁）
	msgSnapshot := make([]Message, len(conv.Messages))
	copy(msgSnapshot, conv.Messages)
	conversationStoreMu.Unlock()

	// 设置 SSE 响应头
	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("X-Accel-Buffering", "no")

	// 流式写入
	assistantMsgID := uuid.New().String()

	return c.SendStreamWriter(func(w *bufio.Writer) {
		var fullContent bytes.Buffer

		// 调用 LLM 流式接口
		err := h.streamLLM(w, msgSnapshot, &fullContent)
		if err != nil {
			writeSSE(w, EventError, fiber.Map{"message": err.Error()})
			w.Flush()
			return
		}

		// 将 assistant 回复写入会话历史
		assistantMsg := Message{
			ID:        assistantMsgID,
			Role:      "assistant",
			Content:   fullContent.String(),
			CreatedAt: time.Now(),
		}
		conversationStoreMu.Lock()
		if c, ok := conversationStore[convID]; ok {
			c.Messages = append(c.Messages, assistantMsg)
			c.UpdatedAt = time.Now()
		}
		conversationStoreMu.Unlock()

		// 发送 done 事件
		writeSSE(w, EventDone, fiber.Map{"message_id": assistantMsgID})
		w.Flush()
	})
}

// streamLLM 调用 LLM 的流式接口，将 text_delta 事件写入 SSE，并把完整内容写入 buf
func (h *MessagesHandler) streamLLM(w *bufio.Writer, messages []Message, buf *bytes.Buffer) error {
	// 构建 OpenAI 兼容的请求体
	type llmMessage struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}
	type llmRequest struct {
		Model    string       `json:"model"`
		Messages []llmMessage `json:"messages"`
		Stream   bool         `json:"stream"`
	}

	// 系统提示：指导 Agent 在回复中识别可记录的内容
	systemPrompt := `你是 Stardust，用户的个人 AI 伴侣。
你的职责是陪伴用户对话，同时悄悄留意对话中值得长期记录的内容。
在回复用户时，如果你发现了值得记录的内容（偏好、记忆、任务、观点），
请在回复末尾附加一个 JSON 块，格式如下（不要在正文中提及这个块）：

<!--CANDIDATES
[{"id":"<uuid>","type":"preference|memory|task|opinion","content":"<简洁描述>"}]
CANDIDATES-->

如果没有值得记录的内容，则不附加该块。`

	llmMsgs := []llmMessage{
		{Role: "system", Content: systemPrompt},
	}
	for _, m := range messages {
		role := m.Role
		if role == "tool_result" {
			role = "user"
		}
		llmMsgs = append(llmMsgs, llmMessage{Role: role, Content: m.Content})
	}

	reqBody, _ := json.Marshal(llmRequest{
		Model:    h.cfg.OpenAIModel,
		Messages: llmMsgs,
		Stream:   true,
	})

	httpReq, err := http.NewRequest("POST", h.cfg.OpenAIBaseURL+"/chat/completions", bytes.NewReader(reqBody))
	if err != nil {
		return fmt.Errorf("构建 LLM 请求失败: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+h.cfg.OpenAIAPIKey)

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return fmt.Errorf("调用 LLM 失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("LLM 返回错误 %d: %s", resp.StatusCode, string(body))
	}

	// 解析 SSE 流
	type streamDelta struct {
		Content string `json:"content"`
	}
	type streamChoice struct {
		Delta        streamDelta `json:"delta"`
		FinishReason *string     `json:"finish_reason"`
	}
	type streamChunk struct {
		Choices []streamChoice `json:"choices"`
	}

	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" || line == "data: [DONE]" {
			continue
		}
		if len(line) < 6 || line[:6] != "data: " {
			continue
		}

		var chunk streamChunk
		if err := json.Unmarshal([]byte(line[6:]), &chunk); err != nil {
			continue
		}
		if len(chunk.Choices) == 0 {
			continue
		}

		delta := chunk.Choices[0].Delta.Content
		if delta == "" {
			continue
		}

		buf.WriteString(delta)
		writeSSE(w, EventTextDelta, fiber.Map{"delta": delta})
		w.Flush()
	}

	// 解析完整回复中的 CANDIDATES 块
	fullText := buf.String()
	candidates := extractCandidates(fullText)
	if len(candidates) > 0 {
		writeSSE(w, EventMemoryCandidate, fiber.Map{"candidates": candidates})
		w.Flush()
	}

	return scanner.Err()
}

// extractCandidates 从 LLM 回复中提取 <!--CANDIDATES ... CANDIDATES--> 块
func extractCandidates(text string) []MemoryCandidate {
	const startTag = "<!--CANDIDATES\n"
	const endTag = "\nCANDIDATES-->"

	start := bytes.Index([]byte(text), []byte(startTag))
	if start == -1 {
		return nil
	}
	end := bytes.Index([]byte(text[start:]), []byte(endTag))
	if end == -1 {
		return nil
	}

	jsonStr := text[start+len(startTag) : start+end]
	var candidates []MemoryCandidate
	if err := json.Unmarshal([]byte(jsonStr), &candidates); err != nil {
		return nil
	}
	return candidates
}

// writeSSE 向 SSE 流写入一个事件
func writeSSE(w *bufio.Writer, event string, data any) {
	payload, _ := json.Marshal(data)
	fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, string(payload))
}
