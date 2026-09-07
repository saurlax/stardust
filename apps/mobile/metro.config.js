const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const { createProxyMiddleware } = require("http-proxy-middleware");

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push("wasm");

const metroConfig = withNativeWind(config, { input: "./global.css", inlineRem: 16 });
const enhanceMiddleware = metroConfig.server.enhanceMiddleware;

metroConfig.server.enhanceMiddleware = (middleware, server) => {
  const nextMiddleware = enhanceMiddleware
    ? enhanceMiddleware(middleware, server)
    : middleware;
  const apiProxy = createProxyMiddleware({
    target: process.env.DEV_API_PROXY_TARGET || "http://127.0.0.1:8080",
    changeOrigin: true,
    pathFilter: (pathname) =>
      pathname === "/api" || pathname.startsWith("/api/") || pathname === "/health",
  });

  return (req, res, next) =>
    apiProxy(req, res, () => nextMiddleware(req, res, next));
};

module.exports = metroConfig;
