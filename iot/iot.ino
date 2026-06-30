#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <FS.h>
#include <LittleFS.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WebServer.h>
#include "esp_camera.h"

static const char *DEVICE_NAME = "Stardust Sense";
static const char *PROTOCOL_VERSION = "0.1.0";
static const char *SERVICE_UUID = "7b3f4a10-9d62-4a7d-a0d9-2ffb9239c4d1";
static const char *PROVISION_CHARACTERISTIC_UUID = "7b3f4a13-9d62-4a7d-a0d9-2ffb9239c4d1";
static const char *WIFI_PREFS_NAMESPACE = "stardust";
static const int STATUS_LED_PIN = 21;
static const bool STATUS_LED_ACTIVE_LOW = true;
static const uint32_t STATUS_LED_PWM_WINDOW_MS = 20;
static const uint32_t PHOTO_RING_SLOTS = 48;
static const uint32_t AUTO_CAPTURE_INTERVAL_MS = 5UL * 60UL * 1000UL;

#define CAMERA_PIN_PWDN -1
#define CAMERA_PIN_RESET -1
#define CAMERA_PIN_XCLK 10
#define CAMERA_PIN_SIOD 40
#define CAMERA_PIN_SIOC 39
#define CAMERA_PIN_D7 48
#define CAMERA_PIN_D6 11
#define CAMERA_PIN_D5 12
#define CAMERA_PIN_D4 14
#define CAMERA_PIN_D3 16
#define CAMERA_PIN_D2 18
#define CAMERA_PIN_D1 17
#define CAMERA_PIN_D0 15
#define CAMERA_PIN_VSYNC 38
#define CAMERA_PIN_HREF 47
#define CAMERA_PIN_PCLK 13

#if defined(D1)
static const int CAPTURE_BUTTON_PIN = D1;
#else
static const int CAPTURE_BUTTON_PIN = 2;
#endif

BLECharacteristic *provisionCharacteristic = nullptr;
WebServer httpServer(80);
Preferences wifiPrefs;

bool deviceConnected = false;
bool cameraReady = false;
bool storageReady = false;
bool httpServerStarted = false;
String wifiState = "idle";
String provisioningState = "{\"status\":\"idle\"}";
String eventLog = "[]";
uint32_t eventCounter = 0;
uint32_t bootId = 0;
uint32_t lastButtonReadAt = 0;
uint32_t lastHeartbeatAt = 0;
uint32_t lastLedUpdateAt = 0;
uint32_t lastAutoCaptureAt = 0;
int lastButtonState = HIGH;
String lastEventType = "boot";
String lastEventContent = "Stardust Sense ready";

String capturePhoto(const String &source);
void resetWifiCredentials();

String jsonEscape(const String &value) {
  String escaped = "";
  for (size_t i = 0; i < value.length(); i++) {
    char c = value[i];
    if (c == '"' || c == '\\') {
      escaped += '\\';
    }
    escaped += c;
  }
  return escaped;
}

String baseUrl() {
  return WiFi.status() == WL_CONNECTED ? "http://" + WiFi.localIP().toString() : "";
}

String statusPayload() {
  const bool wifiConnected = WiFi.status() == WL_CONNECTED;
  const String base = baseUrl();
  String payload = "{";
  payload += "\"battery\":null,";
  payload += "\"firmware\":\"0.1.0\",";
  payload += "\"protocolVersion\":\"" + String(PROTOCOL_VERSION) + "\",";
  payload += "\"cameraReady\":" + String(cameraReady ? "true" : "false") + ",";
  payload += "\"network\":{\"state\":\"" + jsonEscape(wifiConnected ? "connected" : wifiState) + "\",";
  payload += "\"ip\":\"" + String(wifiConnected ? WiFi.localIP().toString() : "") + "\",";
  payload += "\"baseUrl\":\"" + jsonEscape(base) + "\",";
  payload += "\"captureUrl\":\"" + jsonEscape(base.length() ? base + "/capture" : "") + "\",";
  payload += "\"eventsUrl\":\"" + jsonEscape(base.length() ? base + "/events" : "") + "\",";
  payload += "\"manifestUrl\":\"" + jsonEscape(base.length() ? base + "/manifest" : "") + "\",";
  payload += "\"staticBaseUrl\":\"" + jsonEscape(base.length() ? base + "/static" : "") + "\"},";
  payload += "\"storage\":{\"state\":\"" + String(storageReady ? "ready" : "unavailable") + "\",";
  payload += "\"medium\":\"flash-ring\",";
  payload += "\"staticPath\":\"/static\",";
  payload += "\"ringSlots\":" + String(PHOTO_RING_SLOTS) + ",";
  payload += "\"totalBytes\":" + String(storageReady ? LittleFS.totalBytes() : 0) + ",";
  payload += "\"usedBytes\":" + String(storageReady ? LittleFS.usedBytes() : 0) + "},";
  payload += "\"uptimeMs\":" + String(millis()) + ",";
  payload += "\"bootId\":\"" + String(bootId, HEX) + "\"";
  payload += "}";
  return payload;
}

String manifestPayload() {
  const bool wifiConnected = WiFi.status() == WL_CONNECTED;
  const String base = baseUrl();
  String payload = "{";
  payload += "\"protocolVersion\":\"" + String(PROTOCOL_VERSION) + "\",";
  payload += "\"deviceKind\":\"xiao-esp32s3-sense\",";
  payload += "\"capabilities\":[\"ble-wifi-provision\",\"button-capture\",\"serial-capture\",\"http-capture\",\"http-events\",\"flash-ring-storage\",\"static-files\"],";
  payload += "\"captureSources\":[\"button\",\"serial\",\"manual\",\"auto\"],";
  payload += "\"autoCaptureIntervalMs\":" + String(AUTO_CAPTURE_INTERVAL_MS) + ",";
  payload += "\"media\":{\"photoTransfer\":\"static-http\",\"mimeType\":\"image/jpeg\",\"cameraReady\":" + String(cameraReady ? "true" : "false") + ",";
  payload += "\"captureUrl\":\"" + jsonEscape(base.length() ? base + "/capture" : "") + "\",";
  payload += "\"staticBaseUrl\":\"" + jsonEscape(base.length() ? base + "/static" : "") + "\"},";
  payload += "\"eventCount\":" + String(eventCounter) + ",";
  payload += "\"bootId\":\"" + String(bootId, HEX) + "\",";
  payload += "\"lastEventType\":\"" + jsonEscape(lastEventType) + "\"";
  payload += "}";
  return payload;
}

void refreshProvisionCharacteristic() {
  if (provisionCharacteristic) {
    provisionCharacteristic->setValue(provisioningState.c_str());
  }
}

void writeStatusLed(bool on) {
  digitalWrite(STATUS_LED_PIN, STATUS_LED_ACTIVE_LOW ? !on : on);
}

void writeStatusLedBrightness(uint8_t brightness) {
  const uint32_t phase = millis() % STATUS_LED_PWM_WINDOW_MS;
  const bool on = brightness > (phase * 255 / STATUS_LED_PWM_WINDOW_MS);
  writeStatusLed(on);
}

void updateStatusLed() {
  const uint32_t now = millis();
  const bool wifiConnected = WiFi.status() == WL_CONNECTED;

  if (wifiConnected) {
    writeStatusLed(true);
    return;
  }

  if (wifiState == "connecting") {
    writeStatusLed((now / 100) % 2 == 0);
    return;
  }

  const uint32_t breath = now % 1000;
  const uint32_t half = breath < 500 ? breath : 1000 - breath;
  const uint8_t brightness = 8 + (half * 247 / 500);
  writeStatusLedBrightness(brightness);
}

String commandTypeFromJson(const String &payload) {
  int keyIndex = payload.indexOf("\"type\"");
  if (keyIndex < 0) return "";

  int colonIndex = payload.indexOf(':', keyIndex);
  if (colonIndex < 0) return "";

  int startQuoteIndex = payload.indexOf('"', colonIndex + 1);
  if (startQuoteIndex < 0) return "";

  int endQuoteIndex = payload.indexOf('"', startQuoteIndex + 1);
  if (endQuoteIndex < 0) return "";

  return payload.substring(startQuoteIndex + 1, endQuoteIndex);
}

String stringFieldFromJson(const String &payload, const String &key) {
  int keyIndex = payload.indexOf("\"" + key + "\"");
  if (keyIndex < 0) return "";

  int colonIndex = payload.indexOf(':', keyIndex);
  if (colonIndex < 0) return "";

  int startQuoteIndex = payload.indexOf('"', colonIndex + 1);
  if (startQuoteIndex < 0) return "";

  String result = "";
  bool escaping = false;
  for (int i = startQuoteIndex + 1; i < payload.length(); i++) {
    const char c = payload[i];
    if (escaping) {
      result += c;
      escaping = false;
      continue;
    }
    if (c == '\\') {
      escaping = true;
      continue;
    }
    if (c == '"') return result;
    result += c;
  }

  return "";
}

String eventPayload(const String &id, const String &type, const String &content, const String &metadata = "{}") {
  String payload = "{";
  payload += "\"id\":\"" + jsonEscape(id) + "\",";
  payload += "\"type\":\"" + jsonEscape(type) + "\",";
  payload += "\"content\":\"" + jsonEscape(content) + "\",";
  payload += "\"ts\":\"" + String(millis()) + "\",";
  payload += "\"metadata\":" + metadata;
  payload += "}";
  return payload;
}

String publishEvent(const String &type, const String &content, const String &metadata = "{}") {
  eventCounter += 1;
  lastEventType = type;
  lastEventContent = content;
  String payload = eventPayload(
    "sense-" + String(bootId, HEX) + "-" + String(eventCounter),
    type,
    content,
    metadata
  );

  if (eventLog == "[]") {
    eventLog = "[" + payload + "]";
  } else {
    eventLog.remove(eventLog.length() - 1);
    eventLog += "," + payload + "]";
  }
  if (eventLog.length() > 24000) {
    eventLog = "[" + payload + "]";
  }
  Serial.println(payload);
  return payload;
}

bool setupCamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = CAMERA_PIN_D0;
  config.pin_d1 = CAMERA_PIN_D1;
  config.pin_d2 = CAMERA_PIN_D2;
  config.pin_d3 = CAMERA_PIN_D3;
  config.pin_d4 = CAMERA_PIN_D4;
  config.pin_d5 = CAMERA_PIN_D5;
  config.pin_d6 = CAMERA_PIN_D6;
  config.pin_d7 = CAMERA_PIN_D7;
  config.pin_xclk = CAMERA_PIN_XCLK;
  config.pin_pclk = CAMERA_PIN_PCLK;
  config.pin_vsync = CAMERA_PIN_VSYNC;
  config.pin_href = CAMERA_PIN_HREF;
  config.pin_sccb_sda = CAMERA_PIN_SIOD;
  config.pin_sccb_scl = CAMERA_PIN_SIOC;
  config.pin_pwdn = CAMERA_PIN_PWDN;
  config.pin_reset = CAMERA_PIN_RESET;
  config.xclk_freq_hz = 20000000;
  config.frame_size = psramFound() ? FRAMESIZE_QVGA : FRAMESIZE_QQVGA;
  config.pixel_format = PIXFORMAT_JPEG;
  config.grab_mode = CAMERA_GRAB_LATEST;
  config.fb_location = psramFound() ? CAMERA_FB_IN_PSRAM : CAMERA_FB_IN_DRAM;
  config.jpeg_quality = 24;
  config.fb_count = psramFound() ? 2 : 1;

  esp_err_t error = esp_camera_init(&config);
  if (error != ESP_OK) {
    Serial.printf("Camera init failed: 0x%x\n", error);
    return false;
  }

  sensor_t *sensor = esp_camera_sensor_get();
  if (sensor) {
    sensor->set_vflip(sensor, 1);
    sensor->set_hmirror(sensor, 1);
  }

  return true;
}

void handleHttpCapture() {
  const String event = capturePhoto("manual");
  httpServer.sendHeader("Cache-Control", "no-store");
  httpServer.send(event.indexOf("\"status\":\"failed\"") >= 0 ? 500 : 200, "application/json", event);
}

void handleHttpWifiReset() {
  resetWifiCredentials();
  httpServer.sendHeader("Cache-Control", "no-store");
  httpServer.send(200, "application/json", provisioningState);
}

void handleStaticFile() {
  if (!storageReady) {
    httpServer.send(503, "text/plain", "storage unavailable");
    return;
  }

  String path = httpServer.uri();
  if (!path.startsWith("/static/")) {
    httpServer.send(404, "text/plain", "not found");
    return;
  }

  File file = LittleFS.open(path, FILE_READ);
  if (!file || file.isDirectory()) {
    httpServer.send(404, "text/plain", "not found");
    return;
  }

  httpServer.sendHeader("Cache-Control", "public, max-age=31536000");
  httpServer.streamFile(file, "image/jpeg");
  file.close();
}

bool setupStorage() {
  Serial.println("Mounting LittleFS...");
  if (!LittleFS.begin(true)) {
    Serial.println("LittleFS mount failed.");
    return false;
  }

  LittleFS.mkdir("/static");
  Serial.printf(
    "LittleFS ready: total=%lu used=%lu free=%lu bytes\n",
    static_cast<unsigned long>(LittleFS.totalBytes()),
    static_cast<unsigned long>(LittleFS.usedBytes()),
    static_cast<unsigned long>(LittleFS.totalBytes() - LittleFS.usedBytes())
  );
  return true;
}

uint32_t nextPhotoSlot() {
  wifiPrefs.begin(WIFI_PREFS_NAMESPACE, false);
  const uint32_t counter = wifiPrefs.getUInt("photoCounter", 0);
  wifiPrefs.putUInt("photoCounter", counter + 1);
  wifiPrefs.end();
  return counter % PHOTO_RING_SLOTS;
}

String capturePhoto(const String &source) {
  if (!cameraReady) {
    return publishEvent("capture", "Camera capture unavailable", "{\"source\":\"" + jsonEscape(source) + "\",\"cameraReady\":false,\"status\":\"failed\"}");
  }

  if (!storageReady) {
    return publishEvent("capture", "Photo storage unavailable", "{\"source\":\"" + jsonEscape(source) + "\",\"cameraReady\":true,\"storageReady\":false,\"status\":\"failed\"}");
  }

  camera_fb_t *frame = esp_camera_fb_get();
  if (source == "manual" && frame) {
    esp_camera_fb_return(frame);
    delay(120);
    frame = esp_camera_fb_get();
  }
  if (!frame) {
    return publishEvent("capture", "Camera capture failed", "{\"source\":\"" + jsonEscape(source) + "\",\"cameraReady\":true,\"status\":\"failed\"}");
  }

  const uint32_t photoSlot = nextPhotoSlot();
  const String photoId = "photo-" + String(photoSlot);
  const String staticPath = "/static/" + photoId + ".jpg";
  LittleFS.remove(staticPath);
  File file = LittleFS.open(staticPath, FILE_WRITE);
  if (!file) {
    esp_camera_fb_return(frame);
    return publishEvent("capture", "Photo file open failed", "{\"source\":\"" + jsonEscape(source) + "\",\"status\":\"failed\"}");
  }

  const size_t written = file.write(frame->buf, frame->len);
  file.close();
  esp_camera_fb_return(frame);

  if (written == 0) {
    LittleFS.remove(staticPath);
    return publishEvent("capture", "Photo file write failed", "{\"source\":\"" + jsonEscape(source) + "\",\"status\":\"failed\"}");
  }

  const String mediaUrl = baseUrl().length() ? baseUrl() + staticPath : "";
  String metadata = "{";
  metadata += "\"source\":\"" + jsonEscape(source) + "\",";
  metadata += "\"cameraReady\":true,";
  metadata += "\"storage\":\"flash-ring\",";
  metadata += "\"photoId\":\"" + photoId + "\",";
  metadata += "\"photoSlot\":" + String(photoSlot) + ",";
  metadata += "\"staticPath\":\"" + jsonEscape(staticPath) + "\",";
  metadata += "\"mediaUrl\":\"" + jsonEscape(mediaUrl) + "\",";
  metadata += "\"mimeType\":\"image/jpeg\",";
  metadata += "\"byteLength\":" + String(written) + ",";
  metadata += "\"storageUsedBytes\":" + String(LittleFS.usedBytes()) + ",";
  metadata += "\"storageTotalBytes\":" + String(LittleFS.totalBytes()) + ",";
  metadata += "\"photoTransfer\":\"static-http\"";
  metadata += "}";
  return publishEvent("capture", "Photo", metadata);
}

void startHttpServer() {
  if (httpServerStarted) return;

  httpServer.on("/health", HTTP_GET, []() {
    httpServer.send(200, "application/json", "{\"ok\":true}");
  });
  httpServer.on("/status", HTTP_GET, []() {
    httpServer.sendHeader("Cache-Control", "no-store");
    httpServer.send(200, "application/json", statusPayload());
  });
  httpServer.on("/manifest", HTTP_GET, []() {
    httpServer.sendHeader("Cache-Control", "no-store");
    httpServer.send(200, "application/json", manifestPayload());
  });
  httpServer.on("/events", HTTP_GET, []() {
    httpServer.sendHeader("Cache-Control", "no-store");
    httpServer.send(200, "application/json", eventLog);
  });
  httpServer.on("/capture", HTTP_GET, handleHttpCapture);
  httpServer.on("/capture", HTTP_POST, handleHttpCapture);
  httpServer.on("/wifi/reset", HTTP_POST, handleHttpWifiReset);
  httpServer.on("/wifi/reset", HTTP_GET, handleHttpWifiReset);
  httpServer.onNotFound([]() {
    if (httpServer.uri().startsWith("/static/")) {
      handleStaticFile();
      return;
    }
    httpServer.send(404, "text/plain", "not found");
  });
  httpServer.begin();
  httpServerStarted = true;
}

void saveWifiCredentials(const String &ssid, const String &password) {
  wifiPrefs.begin(WIFI_PREFS_NAMESPACE, false);
  wifiPrefs.putString("ssid", ssid);
  wifiPrefs.putString("password", password);
  wifiPrefs.end();
}

void resetWifiCredentials() {
  wifiPrefs.begin(WIFI_PREFS_NAMESPACE, false);
  wifiPrefs.remove("ssid");
  wifiPrefs.remove("password");
  wifiPrefs.end();
  WiFi.disconnect(true, true);
  wifiState = "idle";
  provisioningState = "{\"status\":\"idle\"}";
  refreshProvisionCharacteristic();
  publishEvent("wifi", "Wi-Fi credentials reset", "{\"status\":\"reset\",\"source\":\"command\"}");
}

bool loadWifiCredentials(String &ssid, String &password) {
  wifiPrefs.begin(WIFI_PREFS_NAMESPACE, true);
  ssid = wifiPrefs.getString("ssid", "");
  password = wifiPrefs.getString("password", "");
  wifiPrefs.end();
  return ssid.length() > 0;
}

void connectWifi(const String &ssid, const String &password, bool remember = true) {
  if (ssid.length() == 0) {
    Serial.println("Wi-Fi provisioning failed: empty SSID.");
    publishEvent("wifi", "Wi-Fi SSID is empty", "{\"status\":\"failed\"}");
    return;
  }

  Serial.printf("Connecting Wi-Fi SSID: %s\n", ssid.c_str());
  wifiState = "connecting";
  provisioningState = "{\"status\":\"connecting\"}";
  refreshProvisionCharacteristic();
  WiFi.disconnect(true, true);
  delay(350);
  WiFi.mode(WIFI_STA);
  delay(100);
  WiFi.begin(ssid.c_str(), password.c_str());

  const uint32_t startedAt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startedAt < 16000) {
    delay(250);
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Wi-Fi connection failed.");
    wifiState = "failed";
    provisioningState = "{\"status\":\"failed\"}";
    refreshProvisionCharacteristic();
    publishEvent("wifi", "Wi-Fi connection failed", "{\"status\":\"failed\"}");
    return;
  }

  wifiState = "connected";
  if (remember) {
    saveWifiCredentials(ssid, password);
  }
  startHttpServer();
  Serial.printf("Wi-Fi connected: %s\n", WiFi.localIP().toString().c_str());
  provisioningState = "{\"status\":\"connected\",\"baseUrl\":\"" + jsonEscape(baseUrl()) + "\",\"captureUrl\":\"" + jsonEscape(baseUrl() + "/capture") + "\"}";
  refreshProvisionCharacteristic();
  publishEvent(
    "wifi",
    "Wi-Fi connected",
    "{\"status\":\"connected\",\"ip\":\"" + WiFi.localIP().toString() + "\",\"baseUrl\":\"" + jsonEscape(baseUrl()) + "\",\"captureUrl\":\"" + jsonEscape(baseUrl() + "/capture") + "\"}"
  );
}

void connectSavedWifi() {
  String ssid;
  String password;
  if (!loadWifiCredentials(ssid, password)) {
    Serial.println("No saved Wi-Fi credentials.");
    return;
  }

  Serial.printf("Connecting saved Wi-Fi SSID: %s\n", ssid.c_str());
  connectWifi(ssid, password, false);
}

bool handleSerialCommand(const String &line) {
  if (!line.startsWith("wifi ")) return false;

  const int passwordStart = line.indexOf(' ', 5);
  if (passwordStart < 0) {
    Serial.println("Usage: wifi <ssid> <password>");
    return true;
  }

  const String ssid = line.substring(5, passwordStart);
  const String password = line.substring(passwordStart + 1);
  connectWifi(ssid, password, true);
  return true;
}

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *server) override {
    deviceConnected = true;
    refreshProvisionCharacteristic();
  }

  void onDisconnect(BLEServer *server) override {
    deviceConnected = false;
    BLEDevice::startAdvertising();
  }
};

class CommandCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    String value = characteristic->getValue().c_str();
    if (value.length() == 0) return;

    String commandType = commandTypeFromJson(value);

    if (commandType == "wifi") {
      connectWifi(stringFieldFromJson(value, "ssid"), stringFieldFromJson(value, "password"));
      return;
    }

    if (commandType == "sleep") {
      publishEvent("sleep", "Sleep command received", "{\"source\":\"command\"}");
      delay(120);
      esp_deep_sleep_start();
    }

    if (commandType == "wifi-reset") {
      resetWifiCredentials();
      return;
    }
  }
};

void setupBle() {
  BLEDevice::init(DEVICE_NAME);
  BLEDevice::setMTU(247);

  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());

  BLEService *service = server->createService(SERVICE_UUID);

  provisionCharacteristic = service->createCharacteristic(
    PROVISION_CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR
  );
  provisionCharacteristic->setCallbacks(new CommandCallbacks());
  provisionCharacteristic->setValue(provisioningState.c_str());

  service->start();

  BLEAdvertising *advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(true);
  advertising->setMinPreferred(0x06);
  advertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();
}

void setup() {
  Serial.begin(115200);
  delay(2000);
  Serial.println();
  Serial.println("Stardust Sense booting...");
  bootId = esp_random();
  Serial.printf("Boot ID: %08lx\n", bootId);

  pinMode(CAPTURE_BUTTON_PIN, INPUT_PULLUP);
  pinMode(STATUS_LED_PIN, OUTPUT);
  writeStatusLed(false);
  Serial.println("Initializing camera...");
  cameraReady = setupCamera();
  Serial.printf("Camera ready: %s\n", cameraReady ? "yes" : "no");
  storageReady = setupStorage();
  Serial.printf("Storage ready: %s\n", storageReady ? "yes" : "no");
  Serial.println("Starting BLE provisioning service...");
  setupBle();
  Serial.println("BLE provisioning service started.");
  publishEvent("boot", "Stardust Sense ready", "{\"source\":\"boot\"}");
  connectSavedWifi();

  Serial.println("Stardust Sense BLE peripheral started.");
}

void loop() {
  const uint32_t now = millis();

  if (now - lastLedUpdateAt > 5) {
    lastLedUpdateAt = now;
    updateStatusLed();
  }

  if (now - lastHeartbeatAt > 2000) {
    lastHeartbeatAt = now;
    Serial.printf(
      "heartbeat wifi=%s ip=%s camera=%s storage=%s events=%lu\n",
      WiFi.status() == WL_CONNECTED ? "connected" : wifiState.c_str(),
      WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString().c_str() : "-",
      cameraReady ? "ready" : "unavailable",
      storageReady ? "ready" : "unavailable",
      eventCounter
    );
  }

  if (WiFi.status() == WL_CONNECTED && cameraReady && storageReady && now - lastAutoCaptureAt > AUTO_CAPTURE_INTERVAL_MS) {
    lastAutoCaptureAt = now;
    capturePhoto("auto");
  }

  if (now - lastButtonReadAt > 60) {
    lastButtonReadAt = now;
    const int currentState = digitalRead(CAPTURE_BUTTON_PIN);

    if (lastButtonState == HIGH && currentState == LOW) {
      capturePhoto("button");
    }

    lastButtonState = currentState;
  }

  if (Serial.available()) {
    String line = Serial.readStringUntil('\n');
    line.trim();
    if (line.length() > 0) {
      if (!handleSerialCommand(line)) {
        publishEvent("serial", line, "{\"source\":\"serial\"}");
      }
    }
  }

  if (httpServerStarted) {
    httpServer.handleClient();
  }

  delay(10);
}
