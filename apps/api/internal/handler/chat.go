package handler

import (
	"sort"
	"sync"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
)

type Chat struct {
	ID        string    `json:"chatId"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	Messages  []Message `json:"messages"`
}

type Message struct {
	ID         string    `json:"id"`
	Role       string    `json:"role"` // user | assistant | tool_result
	Content    string    `json:"content"`
	ToolCallID string    `json:"tool_call_id,omitempty"`
	Confirmed  *bool     `json:"confirmed,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}

var (
	chatStore   = map[string]*Chat{}
	chatStoreMu sync.RWMutex
)

type ChatHandler struct {
	msgHandler *LLMHandler
}

func NewChatHandler(msgHandler *LLMHandler) *ChatHandler {
	return &ChatHandler{msgHandler: msgHandler}
}

// GET /v1/chat?chatId=xxx 返回指定会话，不传则返回全部列表
func (h *ChatHandler) Get(c fiber.Ctx) error {
	chatID := c.Query("chatId")

	if chatID != "" {
		chatStoreMu.RLock()
		chat, exists := chatStore[chatID]
		chatStoreMu.RUnlock()
		if !exists {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "chat not found"})
		}
		return c.JSON(chat)
	}

	chatStoreMu.RLock()
	list := make([]*Chat, 0, len(chatStore))
	for _, chat := range chatStore {
		list = append(list, chat)
	}
	chatStoreMu.RUnlock()

	sort.Slice(list, func(i, j int) bool {
		return list[i].UpdatedAt.After(list[j].UpdatedAt)
	})

	return c.JSON(fiber.Map{"chats": list})
}

// POST /v1/chat
// - 无 content：新建会话，返回 {chatId}
// - 有 content：发送消息，chatId 为空时自动新建
func (h *ChatHandler) Post(c fiber.Ctx) error {
	type postRequest struct {
		ChatID  string `json:"chatId,omitempty"`
		Content string `json:"content,omitempty"`
		Stream  *bool  `json:"stream,omitempty"`
	}

	var req postRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	if req.Content == "" {
		now := time.Now()
		chat := &Chat{
			ID:        uuid.New().String(),
			CreatedAt: now,
			UpdatedAt: now,
			Messages:  []Message{},
		}
		chatStoreMu.Lock()
		chatStore[chat.ID] = chat
		chatStoreMu.Unlock()

		return c.Status(fiber.StatusCreated).JSON(fiber.Map{"chatId": chat.ID})
	}

	chatStoreMu.Lock()
	var chat *Chat
	if req.ChatID != "" {
		chat = chatStore[req.ChatID]
		if chat == nil {
			chatStoreMu.Unlock()
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "chat not found"})
		}
	} else {
		now := time.Now()
		chat = &Chat{
			ID:        uuid.New().String(),
			CreatedAt: now,
			UpdatedAt: now,
			Messages:  []Message{},
		}
		chatStore[chat.ID] = chat
	}
	chatID := chat.ID

	userMsg := Message{
		ID:        uuid.New().String(),
		Role:      "user",
		Content:   req.Content,
		CreatedAt: time.Now(),
	}
	chat.Messages = append(chat.Messages, userMsg)
	chat.UpdatedAt = time.Now()

	msgSnapshot := make([]Message, len(chat.Messages))
	copy(msgSnapshot, chat.Messages)
	chatStoreMu.Unlock()

	stream := req.Stream != nil && *req.Stream

	return h.msgHandler.sendResponse(c, chatID, msgSnapshot, stream, req.ChatID == "")
}

// DELETE /v1/chat?chatId=xxx
func (h *ChatHandler) Delete(c fiber.Ctx) error {
	chatID := c.Query("chatId")
	if chatID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "chatId is required"})
	}

	chatStoreMu.Lock()
	_, exists := chatStore[chatID]
	if exists {
		delete(chatStore, chatID)
	}
	chatStoreMu.Unlock()

	if !exists {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "chat not found"})
	}

	return c.SendStatus(fiber.StatusNoContent)
}
