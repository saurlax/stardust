package config

import (
	"os"
	"strings"
)

type Config struct {
	Port             string
	CORSAllowOrigins []string
}

func Load() Config {
	return Config{
		Port:             getEnv("PORT", "8080"),
		CORSAllowOrigins: splitCSV(getEnv("CORS_ALLOW_ORIGINS", "http://localhost:3000,http://localhost:8081,http://127.0.0.1:3000,http://127.0.0.1:8081")),
	}
}

func (c Config) Address() string {
	return ":" + c.Port
}

func getEnv(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}

	return value
}

func splitCSV(value string) []string {
	parts := strings.Split(value, ",")
	items := make([]string, 0, len(parts))

	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			items = append(items, trimmed)
		}
	}

	return items
}
