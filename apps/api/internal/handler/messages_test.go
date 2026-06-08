package handler

import (
	"bufio"
	"bytes"
	"encoding/json"
	"io"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"

	"stardust/api/internal/config"
)

func TestNormalizeAssistantOutput(t *testing.T) {
	text := "Hello there.\n\n<!--CANDIDATES\n[{\"id\":\"c1\",\"type\":\"memory\",\"content\":\"Likes tea\"}]\nCANDIDATES-->"

	message, candidates := normalizeAssistantOutput(text)

	if message != "Hello there." {
		t.Fatalf("expected visible message to exclude candidate block, got %q", message)
	}

	if len(candidates) != 1 {
		t.Fatalf("expected 1 candidate, got %d", len(candidates))
	}

	if candidates[0].Content != "Likes tea" {
		t.Fatalf("expected candidate content to be preserved, got %q", candidates[0].Content)
	}
}

func TestSendResponseNonStreamSeparatesCandidates(t *testing.T) {
	chatStore = map[string]*Chat{
		"chat-1": {
			ID:       "chat-1",
			Messages: []Message{},
		},
	}

	handler := NewLLMHandler(config.Config{})
	handler.streamLLMFunc = func(w *bufio.Writer, messages []Message, buf *bytes.Buffer, msgID string) error {
		_, err := io.WriteString(buf, "Visible answer\n\n<!--CANDIDATES\n[{\"id\":\"c1\",\"type\":\"memory\",\"content\":\"Likes tea\"}]\nCANDIDATES-->")
		return err
	}

	app := fiber.New()
	app.Get("/", func(c fiber.Ctx) error {
		return handler.sendResponse(c, "chat-1", nil, false, false)
	})

	req := httptest.NewRequest("GET", "/", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != fiber.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var body struct {
		ChatID     string            `json:"chatId"`
		Message    string            `json:"message"`
		Content    string            `json:"content"`
		Candidates []MemoryCandidate `json:"candidates"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if body.Message != "Visible answer" {
		t.Fatalf("expected sanitized message, got %q", body.Message)
	}

	if body.Content != body.Message {
		t.Fatalf("expected legacy content field to mirror message, got message=%q content=%q", body.Message, body.Content)
	}

	if len(body.Candidates) != 1 {
		t.Fatalf("expected 1 candidate, got %d", len(body.Candidates))
	}

	stored := chatStore["chat-1"]
	if len(stored.Messages) != 1 {
		t.Fatalf("expected 1 stored assistant message, got %d", len(stored.Messages))
	}

	if stored.Messages[0].Content != "Visible answer" {
		t.Fatalf("expected stored assistant message to exclude candidate block, got %q", stored.Messages[0].Content)
	}
}
