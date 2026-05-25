package main

import (
	"log"

	"stardust/api/internal/config"
	httprouter "stardust/api/internal/http"
)

func main() {
	cfg := config.Load()
	app := httprouter.New(cfg)

	log.Printf("api listening on %s", cfg.Address())
	log.Fatal(app.Listen(cfg.Address()))
}
