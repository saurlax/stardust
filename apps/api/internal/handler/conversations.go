package handler

import (
	"sync"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
)

// Conversation 表示一个对话会话
type Conversation struct {
	ID        string    `json:"id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	// 消息列表，用于传给 LLM 的上下文
	Messages []Message `json:"messages"`
}

// Message 表示对话中的一条消息
type Message struct {
	ID      string `json:"id"`
	Role    string `json:"role"` // user | assistant | tool_result
	Content string `json:"content"`
	// tool_result 专用字段
	ToolCallID string    `json:"tool_call_id,omitempty"`
	Confirmed  *bool     `json:"confirmed,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}

// conversationStore 内存存储，后续可替换为数据库
var (
	conversationStore   = map[string]*Conversation{}
	conversationStoreMu sync.RWMutex
)

// ConversationsHandler 管理 conversations 相关路由
type ConversationsHandler struct{}

// Create 创建新会话
// POST /v1/conversations
func (h *ConversationsHandler) Create(c fiber.Ctx) error {
	now := time.Now()
	conv := &Conversation{
		ID:        uuid.New().String(),
		CreatedAt: now,
		UpdatedAt: now,
		Messages:  []Message{},
	}

	conversationStoreMu.Lock()
	conversationStore[conv.ID] = conv
	conversationStoreMu.Unlock()

	return c.Status(fiber.StatusCreated).JSON(conv)
}

// List 列出所有会话（按更新时间倒序）
// GET /v1/conversations
func (h *ConversationsHandler) List(c fiber.Ctx) error {
	conversationStoreMu.RLock()
	list := make([]*Conversation, 0, len(conversationStore))
	for _, conv := range conversationStore {
		list = append(list, conv)
	}
	conversationStoreMu.RUnlock()

	// 按 UpdatedAt 倒序排列
	for i := 0; i < len(list)-1; i++ {
		for j := i + 1; j < len(list); j++ {
			if list[i].UpdatedAt.Before(list[j].UpdatedAt) {
				list[i], list[j] = list[j], list[i]
			}
		}
	}

	return c.JSON(fiber.Map{"conversations": list})
}

// Delete 删除指定会话
// DELETE /v1/conversations/:id
func (h *ConversationsHandler) Delete(c fiber.Ctx) error {
	id := c.Params("id")

	conversationStoreMu.Lock()
	_, exists := conversationStore[id]
	if exists {
		delete(conversationStore, id)
	}
	conversationStoreMu.Unlock()

	if !exists {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "conversation not found"})
	}

	return c.SendStatus(fiber.StatusNoContent)
}
