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
	convHandler := &handler.ConversationsHandler{}
	msgHandler := handler.NewMessagesHandler(cfg)
	vaultHandler := handler.NewVaultHandler(cfg)

	v1 := app.Group("/api/v1")

	// Conversations
	v1.Post("/conversations", convHandler.Create)
	v1.Get("/conversations", convHandler.List)
	v1.Delete("/conversations/:id", convHandler.Delete)

	// Messages（SSE 流式）
	v1.Post("/conversations/:id/messages", msgHandler.Send)

	// Vault（代理 OpenViking）
	v1.Get("/vault/*", vaultHandler.Get)

	return app
}
