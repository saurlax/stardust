package http

import (
	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/logger"
	"github.com/gofiber/fiber/v3/middleware/recover"

	"stardust/api/internal/config"
	"stardust/api/internal/handler"
)

func New(cfg config.Config) *fiber.App {
	app := fiber.New()

	app.Use(recover.New())
	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins: cfg.CORSAllowOrigins,
		AllowMethods: []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders: []string{"Origin", "Content-Type", "Accept", "Authorization"},
	}))

	app.Get("/health", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	// 初始化 handlers
	msgHandler := handler.NewLLMHandler(cfg)
	chatHandler := handler.NewChatHandler(msgHandler)
	vaultHandler := handler.NewVaultHandler(cfg)

	v1 := app.Group("/api/v1")

	v1.Get("/ping", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{"message": "pong"})
	})

	// Chat（统一端点）
	// GET    /api/v1/chat?chatId=xxx  → 获取会话历史
	// POST   /api/v1/chat             → 新建会话 或 发送消息（body 带 content）
	// DELETE /api/v1/chat?chatId=xxx  → 删除会话
	v1.Get("/chat", chatHandler.Get)
	v1.Post("/chat", chatHandler.Post)
	v1.Delete("/chat", chatHandler.Delete)

	// Vault（代理 OpenViking）
	v1.Get("/vault/*", vaultHandler.Get)

	return app
}
