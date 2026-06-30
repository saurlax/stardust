import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = join(import.meta.dirname, "..");
const iotDir = join(root, "iot");
const sketchPath = join(root, "iot", "iot.ino");
const arduinoConfigPath = join(root, "iot", "arduino-cli.yaml");
const mobileBlePath = join(root, "apps", "mobile", "lib", "devices", "ble.ts");
const readmePath = join(root, "README.md");
const agentsPath = join(root, "AGENTS.md");
const gitmodulesPath = join(root, ".gitmodules");
const nestedIotGitPath = join(iotDir, ".git");

const sketch = readFileSync(sketchPath, "utf8");
const arduinoConfig = readFileSync(arduinoConfigPath, "utf8");
const mobileBle = readFileSync(mobileBlePath, "utf8");
const readme = readFileSync(readmePath, "utf8");
const agents = readFileSync(agentsPath, "utf8");

if (existsSync(gitmodulesPath)) {
  throw new Error("IoT firmware must live in the main repository, not in a git submodule.");
}

if (existsSync(nestedIotGitPath)) {
  throw new Error("IoT firmware must be merged into the main repository, not kept as a nested git repository.");
}

assertIncludes(
  arduinoConfig,
  "https://espressif.github.io/arduino-esp32/package_esp32_index.json",
  "IoT Arduino CLI config must include the ESP32 board manager URL.",
);
assertIncludes(readme, "iot/iot.ino", "README must document the in-repo IoT firmware sketch.");
assertIncludes(readme, "├── iot/", "README project tree must show IoT firmware as part of the main repository.");
assertIncludes(readme, "暂不走 BLE", "README must keep large media transfer out of BLE v1.");
assertIncludes(readme, "Wi-Fi 局域网传输", "README must describe large media transfer as future Wi-Fi work.");
assertIncludes(agents, "in-repository `iot` firmware", "AGENTS.md must describe IoT firmware as part of the main repository.");
assertNotIncludes(agents, "`iot` submodule", "AGENTS.md must not describe IoT firmware as a submodule.");

const expected = {
  STARDUST_DEVICE_NAME: "Stardust Sense",
  SERVICE_UUID: "7b3f4a10-9d62-4a7d-a0d9-2ffb9239c4d1",
  PROVISION_CHARACTERISTIC_UUID: "7b3f4a13-9d62-4a7d-a0d9-2ffb9239c4d1",
};

const firmwareConstantNames = {
  STARDUST_DEVICE_NAME: "DEVICE_NAME",
  SERVICE_UUID: "SERVICE_UUID",
  PROVISION_CHARACTERISTIC_UUID: "PROVISION_CHARACTERISTIC_UUID",
};

function assertIncludes(source, value, message) {
  if (!source.includes(value)) {
    throw new Error(message);
  }
}

function assertNotIncludes(source, value, message) {
  if (source.includes(value)) {
    throw new Error(message);
  }
}

function readQuotedConst(source, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(
    new RegExp(`(?:static\\s+)?const\\s+(?:char\\s*\\*\\s*)?${escapedName}\\s*=\\s*"([^"]+)"`),
  );
  if (!match) {
    throw new Error(`Missing constant: ${name}`);
  }
  return match[1];
}

for (const [name, value] of Object.entries(expected)) {
  const firmwareName = firmwareConstantNames[name];
  const firmwareValue = readQuotedConst(sketch, firmwareName);
  const mobileValue = readQuotedConst(mobileBle, name);
  if (firmwareValue !== value) {
    throw new Error(`Unexpected firmware ${firmwareName}: ${firmwareValue}`);
  }
  if (mobileValue !== value) {
    throw new Error(`Unexpected mobile ${name}: ${mobileValue}`);
  }
}

for (const command of ["wifi", "wifi-reset"]) {
  assertIncludes(sketch, `commandType == "${command}"`, `Firmware does not handle ${command} commands.`);
  assertIncludes(mobileBle, `"${command}"`, `Mobile BLE layer does not expose ${command} commands.`);
}

for (const removed of [
  "STATUS_CHARACTERISTIC_UUID",
  "EVENT_CHARACTERISTIC_UUID",
  "MANIFEST_CHARACTERISTIC_UUID",
  "sendStardustDeviceCommand",
  "restoreStardustDeviceSubscriptions",
]) {
  assertNotIncludes(mobileBle, removed, `Mobile BLE layer must not retain removed BLE API: ${removed}`);
}

for (const required of [
  "LittleFS.begin(true)",
  "PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE",
  "PROTOCOL_VERSION",
  "protocolVersion",
  "deviceKind",
  "capabilities",
  "captureSources",
  "bootId",
  "eventCount",
  "ble-wifi-provision",
  "button-capture",
  "serial-capture",
  "http-capture",
  "http-events",
  "flash-ring-storage",
  "static-files",
  "esp_camera_fb_get",
  "LittleFS.open(staticPath, FILE_WRITE)",
  "PHOTO_RING_SLOTS",
  "AUTO_CAPTURE_INTERVAL_MS",
  "httpServer.on(\"/status\"",
  "httpServer.on(\"/manifest\"",
  "httpServer.on(\"/events\"",
  "httpServer.on(\"/capture\"",
  "httpServer.on(\"/wifi/reset\"",
  "handleStaticFile",
  "handleHttpWifiReset",
  "\"/static/\"",
  "handleHttpCapture",
  "xiao-esp32s3-sense",
  "eventPayload(",
  "{\\\"source\\\":\\\"boot\\\"}",
  "capturePhoto(\"button\")",
  "capturePhoto(\"auto\")",
  "capturePhoto(\"manual\")",
  "publishEvent(\"serial\"",
]) {
  assertIncludes(sketch, required, `Firmware is missing expected BLE capture behavior: ${required}`);
}

const arduinoCli = spawnSync("arduino-cli", ["version"], {
  encoding: "utf8",
  windowsHide: true,
});

if (arduinoCli.error?.code === "ENOENT") {
  console.log("IoT static protocol checks passed.");
  console.log("Arduino compile skipped: arduino-cli is not installed or not on PATH.");
  process.exit(0);
}

if (arduinoCli.status !== 0) {
  throw new Error(`arduino-cli is present but failed to run:\n${arduinoCli.stderr || arduinoCli.stdout}`);
}

const fqbn = process.env.STARDUST_IOT_FQBN ?? "esp32:esp32:XIAO_ESP32S3";
const compile = spawnSync("arduino-cli", ["--config-file", arduinoConfigPath, "compile", "--fqbn", fqbn, sketchPath], {
  encoding: "utf8",
  windowsHide: true,
});

if (compile.status !== 0) {
  throw new Error(
    [
      `Arduino compile failed for ${fqbn}.`,
      "Install the ESP32 board package and XIAO ESP32S3 support, or set STARDUST_IOT_FQBN to the board FQBN you use.",
      compile.stdout,
      compile.stderr,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

console.log(`IoT static protocol checks passed and Arduino compile succeeded for ${fqbn}.`);
