#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <WiFi.h>
#include <WebServer.h>
#include "esp_camera.h"

static const char *DEVICE_NAME = "Stardust Sense";
static const char *PROTOCOL_VERSION = "0.1.0";
static const char *SERVICE_UUID = "7b3f4a10-9d62-4a7d-a0d9-2ffb9239c4d1";
static const char *STATUS_CHARACTERISTIC_UUID = "7b3f4a11-9d62-4a7d-a0d9-2ffb9239c4d1";
static const char *EVENT_CHARACTERISTIC_UUID = "7b3f4a12-9d62-4a7d-a0d9-2ffb9239c4d1";
static const char *COMMAND_CHARACTERISTIC_UUID = "7b3f4a13-9d62-4a7d-a0d9-2ffb9239c4d1";
static const char *MANIFEST_CHARACTERISTIC_UUID = "7b3f4a14-9d62-4a7d-a0d9-2ffb9239c4d1";
static const char *PHOTO_CHARACTERISTIC_UUID = "7b3f4a15-9d62-4a7d-a0d9-2ffb9239c4d1";
static const size_t PHOTO_CHUNK_SIZE = 45;
static const char *BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

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

BLECharacteristic *statusCharacteristic = nullptr;
BLECharacteristic *eventCharacteristic = nullptr;
BLECharacteristic *manifestCharacteristic = nullptr;
BLECharacteristic *photoCharacteristic = nullptr;
WebServer httpServer(80);

bool deviceConnected = false;
bool cameraReady = false;
bool httpServerStarted = false;
String wifiState = "idle";
uint32_t eventCounter = 0;
uint32_t bootId = 0;
uint32_t lastButtonReadAt = 0;
int lastButtonState = HIGH;
String lastEventType = "boot";
String lastEventContent = "Stardust Sense ready";

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

String base64EncodeBytes(const uint8_t *data, size_t length) {
  String encoded = "";
  encoded.reserve(((length + 2) / 3) * 4);

  for (size_t index = 0; index < length; index += 3) {
    const uint8_t byte1 = data[index];
    const uint8_t byte2 = index + 1 < length ? data[index + 1] : 0;
    const uint8_t byte3 = index + 2 < length ? data[index + 2] : 0;
    const uint32_t chunk = (byte1 << 16) | (byte2 << 8) | byte3;

    encoded += BASE64_CHARS[(chunk >> 18) & 0x3f];
    encoded += BASE64_CHARS[(chunk >> 12) & 0x3f];
    encoded += index + 1 < length ? BASE64_CHARS[(chunk >> 6) & 0x3f] : '=';
    encoded += index + 2 < length ? BASE64_CHARS[chunk & 0x3f] : '=';
  }

  return encoded;
}

String statusPayload() {
  const bool wifiConnected = WiFi.status() == WL_CONNECTED;
  String payload = "{";
  payload += "\"battery\":null,";
  payload += "\"firmware\":\"0.1.0\",";
  payload += "\"protocolVersion\":\"" + String(PROTOCOL_VERSION) + "\",";
  payload += "\"cameraReady\":" + String(cameraReady ? "true" : "false") + ",";
  payload += "\"network\":{\"state\":\"" + jsonEscape(wifiConnected ? "connected" : wifiState) + "\",";
  payload += "\"ip\":\"" + String(wifiConnected ? WiFi.localIP().toString() : "") + "\",";
  payload += "\"captureUrl\":\"" + String(wifiConnected ? "http://" + WiFi.localIP().toString() + "/capture.jpg" : "") + "\"},";
  payload += "\"storage\":\"reserved\",";
  payload += "\"uptimeMs\":" + String(millis()) + ",";
  payload += "\"bootId\":\"" + String(bootId, HEX) + "\"";
  payload += "}";
  return payload;
}

String manifestPayload() {
  const bool wifiConnected = WiFi.status() == WL_CONNECTED;
  String payload = "{";
  payload += "\"protocolVersion\":\"" + String(PROTOCOL_VERSION) + "\",";
  payload += "\"deviceKind\":\"xiao-esp32s3-sense\",";
  payload += "\"capabilities\":[\"ble-metadata\",\"button-capture\",\"serial-capture\",\"command-capture\",\"command-sync\",\"command-sleep\",\"ble-photo\",\"wifi-provision\",\"wifi-http-photo\"],";
  payload += "\"captureSources\":[\"button\",\"serial\",\"command\",\"camera\"],";
  payload += "\"media\":{\"photoTransfer\":\"" + String(wifiConnected ? "http" : "ble") + "\",\"mimeType\":\"image/jpeg\",\"chunkSize\":" + String(PHOTO_CHUNK_SIZE) + ",\"cameraReady\":" + String(cameraReady ? "true" : "false") + ",";
  payload += "\"captureUrl\":\"" + String(wifiConnected ? "http://" + WiFi.localIP().toString() + "/capture.jpg" : "") + "\"},";
  payload += "\"eventCount\":" + String(eventCounter) + ",";
  payload += "\"bootId\":\"" + String(bootId, HEX) + "\",";
  payload += "\"lastEventType\":\"" + jsonEscape(lastEventType) + "\"";
  payload += "}";
  return payload;
}

void refreshDeviceCharacteristics() {
  if (statusCharacteristic) {
    statusCharacteristic->setValue(statusPayload().c_str());
  }
  if (manifestCharacteristic) {
    manifestCharacteristic->setValue(manifestPayload().c_str());
  }
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

void publishEvent(const String &type, const String &content, const String &metadata = "{}") {
  if (!eventCharacteristic) return;

  eventCounter += 1;
  lastEventType = type;
  lastEventContent = content;
  String payload = eventPayload(
    "sense-" + String(bootId, HEX) + "-" + String(eventCounter),
    type,
    content,
    metadata
  );

  eventCharacteristic->setValue(payload.c_str());
  refreshDeviceCharacteristics();
  if (deviceConnected) {
    eventCharacteristic->notify();
  }
  Serial.println(payload);
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
  if (!cameraReady) {
    httpServer.send(503, "text/plain", "camera unavailable");
    return;
  }

  camera_fb_t *frame = esp_camera_fb_get();
  if (!frame) {
    httpServer.send(500, "text/plain", "capture failed");
    return;
  }

  httpServer.sendHeader("Cache-Control", "no-store");
  httpServer.setContentLength(frame->len);
  httpServer.send(200, "image/jpeg", "");
  httpServer.client().write(frame->buf, frame->len);
  esp_camera_fb_return(frame);
}

void startHttpServer() {
  if (httpServerStarted) return;

  httpServer.on("/health", HTTP_GET, []() {
    httpServer.send(200, "application/json", "{\"ok\":true}");
  });
  httpServer.on("/capture.jpg", HTTP_GET, handleHttpCapture);
  httpServer.begin();
  httpServerStarted = true;
}

void connectWifi(const String &ssid, const String &password) {
  if (ssid.length() == 0) {
    publishEvent("wifi", "Wi-Fi SSID is empty", "{\"status\":\"failed\"}");
    return;
  }

  wifiState = "connecting";
  refreshDeviceCharacteristics();
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
    wifiState = "failed";
    refreshDeviceCharacteristics();
    publishEvent("wifi", "Wi-Fi connection failed", "{\"status\":\"failed\"}");
    return;
  }

  wifiState = "connected";
  startHttpServer();
  refreshDeviceCharacteristics();
  publishEvent(
    "wifi",
    "Wi-Fi connected",
    "{\"status\":\"connected\",\"ip\":\"" + WiFi.localIP().toString() + "\",\"captureUrl\":\"http://" + WiFi.localIP().toString() + "/capture.jpg\"}"
  );
}

void capturePhoto(const String &source) {
  if (!cameraReady || !photoCharacteristic) {
    publishEvent("capture", "Camera capture unavailable", "{\"source\":\"" + jsonEscape(source) + "\",\"cameraReady\":false}");
    return;
  }

  camera_fb_t *frame = esp_camera_fb_get();
  if (!frame) {
    publishEvent("capture", "Camera capture failed", "{\"source\":\"" + jsonEscape(source) + "\",\"cameraReady\":true,\"status\":\"failed\"}");
    return;
  }

  const String photoId = "p-" + String(eventCounter + 1);
  const size_t chunkCount = (frame->len + PHOTO_CHUNK_SIZE - 1) / PHOTO_CHUNK_SIZE;
  String metadata = "{";
  metadata += "\"source\":\"" + jsonEscape(source) + "\",";
  metadata += "\"p\":{\"id\":\"" + photoId + "\",";
  metadata += "\"n\":" + String(frame->len) + ",";
  metadata += "\"c\":" + String(chunkCount) + ",";
  metadata += "\"w\":" + String(frame->width) + ",";
  metadata += "\"h\":" + String(frame->height) + "}";
  metadata += "}";
  publishEvent("capture", "Photo", metadata);
  delay(500);

  size_t chunkIndex = 0;
  for (size_t offset = 0; offset < frame->len; offset += PHOTO_CHUNK_SIZE) {
    const size_t remaining = frame->len - offset;
    const size_t chunkLength = remaining < PHOTO_CHUNK_SIZE ? remaining : PHOTO_CHUNK_SIZE;
    const String chunkPayload = base64EncodeBytes(frame->buf + offset, chunkLength);
    publishEvent(
      "photo-chunk",
      chunkPayload,
      "{\"p\":\"" + photoId + "\",\"i\":" + String(chunkIndex) + "}"
    );
    chunkIndex += 1;
    delay(24);
  }

  esp_camera_fb_return(frame);
  publishEvent("capture", "Photo capture transferred", "{\"source\":\"" + jsonEscape(source) + "\",\"photoId\":\"" + photoId + "\",\"status\":\"transferred\"}");
}

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *server) override {
    deviceConnected = true;
    refreshDeviceCharacteristics();
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

    if (commandType == "capture") {
      capturePhoto("command");
      return;
    }

    if (commandType == "sync") {
      publishEvent("sync", "Stardust Sense sync heartbeat", "{\"source\":\"command\"}");
      return;
    }

    if (commandType == "wifi") {
      connectWifi(stringFieldFromJson(value, "ssid"), stringFieldFromJson(value, "password"));
      return;
    }

    if (commandType == "sleep") {
      publishEvent("sleep", "Sleep command received", "{\"source\":\"command\"}");
      delay(120);
      esp_deep_sleep_start();
    }
  }
};

void setupBle() {
  BLEDevice::init(DEVICE_NAME);
  BLEDevice::setMTU(247);

  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());

  BLEService *service = server->createService(SERVICE_UUID);

  statusCharacteristic = service->createCharacteristic(
    STATUS_CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ
  );
  statusCharacteristic->setValue(statusPayload().c_str());

  eventCharacteristic = service->createCharacteristic(
    EVENT_CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
  );
  eventCharacteristic->addDescriptor(new BLE2902());
  eventCharacteristic->setValue(
    eventPayload("sense-" + String(bootId, HEX) + "-boot", "boot", "Stardust Sense ready", "{\"source\":\"boot\"}").c_str()
  );

  BLECharacteristic *commandCharacteristic = service->createCharacteristic(
    COMMAND_CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR
  );
  commandCharacteristic->setCallbacks(new CommandCallbacks());

  manifestCharacteristic = service->createCharacteristic(
    MANIFEST_CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ
  );
  manifestCharacteristic->setValue(manifestPayload().c_str());

  photoCharacteristic = service->createCharacteristic(
    PHOTO_CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
  );
  photoCharacteristic->addDescriptor(new BLE2902());

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
  delay(300);
  bootId = esp_random();

  pinMode(CAPTURE_BUTTON_PIN, INPUT_PULLUP);
  cameraReady = setupCamera();
  setupBle();

  Serial.println("Stardust Sense BLE peripheral started.");
}

void loop() {
  const uint32_t now = millis();

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
      publishEvent("serial", line, "{\"source\":\"serial\"}");
    }
  }

  if (httpServerStarted) {
    httpServer.handleClient();
  }

  delay(10);
}
