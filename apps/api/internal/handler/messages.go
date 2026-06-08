package handler

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"stardust/api/internal/config"
)

// MemoryCandidate 候选记忆条目
type MemoryCandidate struct {
	ID      string `json:"id"`
	Type    string `json:"type"` // preference | memory | task | opinion
	Content string `json:"content"`
}

// LLMHandler 负责调用 LLM
type LLMHandler struct {
	cfg           config.Config
	streamLLMFunc func(w *bufio.Writer, messages []Message, buf *bytes.Buffer, msgID string) error
}

func NewLLMHandler(cfg config.Config) *LLMHandler {
	handler := &LLMHandler{cfg: cfg}
	handler.streamLLMFunc = handler.streamLLM
	return handler
}

// sendResponse 流式或非流式返回 LLM 回复，isNewChat 时额外发送 data-chatId 事件
func (h *LLMHandler) sendResponse(c fiber.Ctx, chatID string, msgSnapshot []Message, stream bool, isNewChat bool) error {
	assistantMsgID := uuid.New().String()

	if !stream {
		var buf bytes.Buffer
		nopWriter := bufio.NewWriter(io.Discard)
		if err := h.streamLLMFunc(nopWriter, msgSnapshot, &buf, assistantMsgID); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
		message, candidates := normalizeAssistantOutput(buf.String())
		assistantMsg := Message{
			ID:        assistantMsgID,
			Role:      "assistant",
			Content:   message,
			CreatedAt: time.Now(),
		}
		chatStoreMu.Lock()
		if ch, ok := chatStore[chatID]; ok {
			ch.Messages = append(ch.Messages, assistantMsg)
			ch.UpdatedAt = time.Now()
		}
		chatStoreMu.Unlock()
		return c.JSON(fiber.Map{
			"chatId":     chatID,
			"message":    message,
			"content":    message,
			"candidates": candidates,
		})
	}

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("X-Accel-Buffering", "no")
	c.Set("x-vercel-ai-ui-message-stream", "v1")

	return c.SendStreamWriter(func(w *bufio.Writer) {
		var fullContent bytes.Buffer

		writeUIEvent(w, map[string]any{"type": "start", "messageId": assistantMsgID})
		if isNewChat {
			writeUIEvent(w, map[string]any{"type": "data-chatId", "id": uuid.New().String(), "data": chatID})
		}
		w.Flush()

		err := h.streamLLMFunc(w, msgSnapshot, &fullContent, assistantMsgID)
		if err != nil {
			writeUIEvent(w, map[string]any{"type": "error", "errorText": err.Error()})
			fmt.Fprintf(w, "data: [DONE]\n\n")
			w.Flush()
			return
		}

		message, _ := normalizeAssistantOutput(fullContent.String())
		assistantMsg := Message{
			ID:        assistantMsgID,
			Role:      "assistant",
			Content:   message,
			CreatedAt: time.Now(),
		}
		chatStoreMu.Lock()
		if ch, ok := chatStore[chatID]; ok {
			ch.Messages = append(ch.Messages, assistantMsg)
			ch.UpdatedAt = time.Now()
		}
		chatStoreMu.Unlock()

		writeUIEvent(w, map[string]any{"type": "finish"})
		fmt.Fprintf(w, "data: [DONE]\n\n")
		w.Flush()
	})
}

// streamLLM 调用 LLM 流式接口，将事件写入 SSE，完整内容写入 buf
func (h *LLMHandler) streamLLM(w *bufio.Writer, messages []Message, buf *bytes.Buffer, msgID string) error {
	type llmMessage struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}
	type llmRequest struct {
		Model    string       `json:"model"`
		Messages []llmMessage `json:"messages"`
		Stream   bool         `json:"stream"`
	}

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

	textPartID := uuid.New().String()
	writeUIEvent(w, map[string]any{"type": "text-start", "id": textPartID})
	w.Flush()

	writeTextEnd := func() {
		writeUIEvent(w, map[string]any{"type": "text-end", "id": textPartID})
		w.Flush()
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
		writeUIEvent(w, map[string]any{"type": "text-delta", "id": textPartID, "delta": delta})
		w.Flush()
	}

	writeTextEnd()

	if err := scanner.Err(); err != nil {
		return err
	}

	fullText := buf.String()
	candidates := extractCandidates(fullText)
	if len(candidates) > 0 {
		writeUIEvent(w, map[string]any{
			"type": "data-memoryCandidate",
			"id":   uuid.New().String(),
			"data": candidates,
		})
		w.Flush()
	}

	return nil
}

func normalizeAssistantOutput(text string) (string, []MemoryCandidate) {
	candidates := extractCandidates(text)
	if len(candidates) == 0 {
		return text, nil
	}

	const startTag = "<!--CANDIDATES\n"
	const endTag = "\nCANDIDATES-->"

	start := bytes.Index([]byte(text), []byte(startTag))
	if start == -1 {
		return text, candidates
	}

	end := bytes.Index([]byte(text[start:]), []byte(endTag))
	if end == -1 {
		return text, candidates
	}

	message := text[:start] + text[start+end+len(endTag):]
	return strings.TrimSpace(message), candidates
}

// extractCandidates 从回复中提取 CANDIDATES 块
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

// writeUIEvent 向 SSE 流写入一个事件
func writeUIEvent(w *bufio.Writer, event map[string]any) {
	payload, _ := json.Marshal(event)
	fmt.Fprintf(w, "data: %s\n\n", string(payload))
}
