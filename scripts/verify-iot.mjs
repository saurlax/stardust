import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = join(import.meta.dirname, "..");
const sketchPath = join(root, "iot", "iot.ino");
const mobileBlePath = join(root, "apps", "mobile", "lib", "devices", "ble.ts");

const sketch = readFileSync(sketchPath, "utf8");
const mobileBle = readFileSync(mobileBlePath, "utf8");

const expected = {
  STARDUST_DEVICE_NAME: "Stardust Sense",
  SERVICE_UUID: "7b3f4a10-9d62-4a7d-a0d9-2ffb9239c4d1",
  STATUS_CHARACTERISTIC_UUID: "7b3f4a11-9d62-4a7d-a0d9-2ffb9239c4d1",
  EVENT_CHARACTERISTIC_UUID: "7b3f4a12-9d62-4a7d-a0d9-2ffb9239c4d1",
  COMMAND_CHARACTERISTIC_UUID: "7b3f4a13-9d62-4a7d-a0d9-2ffb9239c4d1",
  MANIFEST_CHARACTERISTIC_UUID: "7b3f4a14-9d62-4a7d-a0d9-2ffb9239c4d1",
};

const firmwareConstantNames = {
  STARDUST_DEVICE_NAME: "DEVICE_NAME",
  SERVICE_UUID: "SERVICE_UUID",
  STATUS_CHARACTERISTIC_UUID: "STATUS_CHARACTERISTIC_UUID",
  EVENT_CHARACTERISTIC_UUID: "EVENT_CHARACTERISTIC_UUID",
  COMMAND_CHARACTERISTIC_UUID: "COMMAND_CHARACTERISTIC_UUID",
  MANIFEST_CHARACTERISTIC_UUID: "MANIFEST_CHARACTERISTIC_UUID",
};

function assertIncludes(source, value, message) {
  if (!source.includes(value)) {
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

for (const command of ["capture", "sync", "sleep"]) {
  assertIncludes(sketch, `commandType == "${command}"`, `Firmware does not handle ${command} commands.`);
  assertIncludes(mobileBle, `"${command}"`, `Mobile BLE layer does not expose ${command} commands.`);
}

for (const required of [
  "BLE2902",
  "PROPERTY_NOTIFY",
  "PROTOCOL_VERSION",
  "protocolVersion",
  "deviceKind",
  "capabilities",
  "captureSources",
  "bootId",
  "eventCount",
  "ble-metadata",
  "button-capture",
  "serial-capture",
  "command-capture",
  "xiao-esp32s3-sense",
  "\\\"camera\\\":\\\"reserved\\\"",
  "\\\"microphone\\\":\\\"reserved\\\"",
  "\\\"microSD\\\":\\\"reserved\\\"",
  "\\\"largeTransfer\\\":\\\"future-wifi\\\"",
  "publishEvent(\"button\"",
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
const compile = spawnSync("arduino-cli", ["compile", "--fqbn", fqbn, sketchPath], {
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
