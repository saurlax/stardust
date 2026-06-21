#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

static const char *DEVICE_NAME = "Stardust Sense";
static const char *PROTOCOL_VERSION = "0.1.0";
static const char *SERVICE_UUID = "7b3f4a10-9d62-4a7d-a0d9-2ffb9239c4d1";
static const char *STATUS_CHARACTERISTIC_UUID = "7b3f4a11-9d62-4a7d-a0d9-2ffb9239c4d1";
static const char *EVENT_CHARACTERISTIC_UUID = "7b3f4a12-9d62-4a7d-a0d9-2ffb9239c4d1";
static const char *COMMAND_CHARACTERISTIC_UUID = "7b3f4a13-9d62-4a7d-a0d9-2ffb9239c4d1";
static const char *MANIFEST_CHARACTERISTIC_UUID = "7b3f4a14-9d62-4a7d-a0d9-2ffb9239c4d1";

#if defined(D1)
static const int CAPTURE_BUTTON_PIN = D1;
#else
static const int CAPTURE_BUTTON_PIN = 2;
#endif

BLECharacteristic *statusCharacteristic = nullptr;
BLECharacteristic *eventCharacteristic = nullptr;
BLECharacteristic *manifestCharacteristic = nullptr;

bool deviceConnected = false;
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

String statusPayload() {
  String payload = "{";
  payload += "\"battery\":null,";
  payload += "\"firmware\":\"0.1.0\",";
  payload += "\"protocolVersion\":\"" + String(PROTOCOL_VERSION) + "\",";
  payload += "\"storage\":\"reserved\",";
  payload += "\"uptimeMs\":" + String(millis()) + ",";
  payload += "\"bootId\":\"" + String(bootId, HEX) + "\"";
  payload += "}";
  return payload;
}

String manifestPayload() {
  String payload = "{";
  payload += "\"protocolVersion\":\"" + String(PROTOCOL_VERSION) + "\",";
  payload += "\"deviceKind\":\"xiao-esp32s3-sense\",";
  payload += "\"capabilities\":[\"ble-metadata\",\"button-capture\",\"serial-capture\",\"command-capture\",\"command-sync\",\"command-sleep\"],";
  payload += "\"captureSources\":[\"button\",\"serial\",\"command\"],";
  payload += "\"pending\":0,";
  payload += "\"eventCount\":" + String(eventCounter) + ",";
  payload += "\"lastEventType\":\"" + jsonEscape(lastEventType) + "\",";
  payload += "\"lastEventContent\":\"" + jsonEscape(lastEventContent) + "\",";
  payload += "\"uptimeMs\":" + String(millis()) + ",";
  payload += "\"bootId\":\"" + String(bootId, HEX) + "\",";
  payload += "\"transport\":\"ble-metadata\",";
  payload += "\"transferPlan\":{";
  payload += "\"metadata\":\"ble\",";
  payload += "\"storage\":\"microSD\",";
  payload += "\"largeMedia\":\"future-wifi-lan\"";
  payload += "},";
  payload += "\"media\":{";
  payload += "\"camera\":\"reserved\",";
  payload += "\"microphone\":\"reserved\",";
  payload += "\"microSD\":\"reserved\",";
  payload += "\"largeTransfer\":\"future-wifi\"";
  payload += "}";
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
      publishEvent("capture", "Manual screen-off capture requested", "{\"source\":\"command\"}");
      return;
    }

    if (commandType == "sync") {
      publishEvent("sync", "Stardust Sense sync heartbeat", "{\"source\":\"command\"}");
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
  setupBle();

  Serial.println("Stardust Sense BLE peripheral started.");
}

void loop() {
  const uint32_t now = millis();

  if (now - lastButtonReadAt > 60) {
    lastButtonReadAt = now;
    const int currentState = digitalRead(CAPTURE_BUTTON_PIN);

    if (lastButtonState == HIGH && currentState == LOW) {
      publishEvent("button", "Screen-off capture button pressed", "{\"source\":\"button\"}");
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

  delay(10);
}
