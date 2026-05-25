package http

import (
	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/logger"
	"github.com/gofiber/fiber/v3/middleware/recover"

	"stardust/api/internal/config"
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

	api := app.Group("/api")
	v1 := api.Group("/v1")
	v1.Get("/ping", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{"message": "pong"})
	})

	return app
}
