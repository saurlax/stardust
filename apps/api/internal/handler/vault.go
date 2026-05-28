package handler

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/gofiber/fiber/v3"

	"stardust/api/internal/config"
)

// VaultHandler 代理 OpenViking 文件系统
type VaultHandler struct {
	cfg        config.Config
	httpClient *http.Client
}

func NewVaultHandler(cfg config.Config) *VaultHandler {
	return &VaultHandler{
		cfg:        cfg,
		httpClient: &http.Client{},
	}
}

// Get 列目录 / 读文件 / 语义检索，由 path 和 ?q= 决定
func (h *VaultHandler) Get(c fiber.Ctx) error {
	rawPath := c.Params("*")
	if rawPath == "" {
		rawPath = "/"
	}

	vikingURI := "viking://user/" + strings.TrimPrefix(rawPath, "/")

	q := c.Query("q")

	if q != "" {
		return h.search(c, vikingURI, q)
	}

	if strings.HasSuffix(rawPath, "/") || !strings.Contains(rawPath, ".") {
		return h.listDir(c, vikingURI)
	}

	return h.readFile(c, vikingURI)
}

// listDir 调用 OpenViking /api/v1/fs/ls
func (h *VaultHandler) listDir(c fiber.Ctx, vikingURI string) error {
	ovURL := fmt.Sprintf("%s/api/v1/fs/ls?uri=%s",
		h.cfg.OpenVikingBaseURL,
		url.QueryEscape(vikingURI),
	)

	resp, err := h.httpClient.Get(ovURL)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "OpenViking 不可达: " + err.Error()})
	}
	defer resp.Body.Close()

	return h.proxyResponse(c, resp)
}

// readFile 调用 OpenViking /api/v1/content/read
func (h *VaultHandler) readFile(c fiber.Ctx, vikingURI string) error {
	ovURL := fmt.Sprintf("%s/api/v1/content/read?uri=%s",
		h.cfg.OpenVikingBaseURL,
		url.QueryEscape(vikingURI),
	)

	resp, err := h.httpClient.Get(ovURL)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "OpenViking 不可达: " + err.Error()})
	}
	defer resp.Body.Close()

	return h.proxyResponse(c, resp)
}

// search 调用 OpenViking /api/v1/search/search
func (h *VaultHandler) search(c fiber.Ctx, vikingURI string, query string) error {
	ovURL := fmt.Sprintf("%s/api/v1/search/search", h.cfg.OpenVikingBaseURL)

	body := fmt.Sprintf(`{"uri":%q,"query":%q}`, vikingURI, query)
	resp, err := h.httpClient.Post(ovURL, "application/json", strings.NewReader(body))
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "OpenViking 不可达: " + err.Error()})
	}
	defer resp.Body.Close()

	return h.proxyResponse(c, resp)
}

// proxyResponse 透传 OpenViking 响应
func (h *VaultHandler) proxyResponse(c fiber.Ctx, resp *http.Response) error {
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "读取 OpenViking 响应失败"})
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/json"
	}

	return c.Status(resp.StatusCode).Type(contentType).Send(body)
}
