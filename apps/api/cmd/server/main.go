package main

import (
	"log"
	"os"
	"path/filepath"

	"github.com/joho/godotenv"

	"stardust/api/internal/config"
	httprouter "stardust/api/internal/http"
)

// loadEnv 从当前目录向上最多查找 3 层 .env 文件并加载
func loadEnv() {
	dir, _ := os.Getwd()
	for i := 0; i < 3; i++ {
		candidate := filepath.Join(dir, ".env")
		if _, err := os.Stat(candidate); err == nil {
			_ = godotenv.Load(candidate)
			return
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
}

func main() {
	loadEnv()

	cfg := config.Load()
	app := httprouter.New(cfg)

	log.Printf("api listening on %s", cfg.Address())
	log.Fatal(app.Listen(cfg.Address()))
}
