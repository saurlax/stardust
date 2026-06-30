# Stardust Sense

Arduino sketch for Seeed Studio XIAO ESP32S3 Sense as a screen-off Stardust capture device.

## Behavior

- Advertises as `Stardust Sense`.
- Exposes BLE service `7b3f4a10-9d62-4a7d-a0d9-2ffb9239c4d1`.
- Uses BLE only for Wi-Fi provisioning.
- Stores captured JPEG files in a fixed-size LittleFS ring under `/static`.
- Serves device APIs over local Wi-Fi: `/status`, `/manifest`, `/events`, `/capture`, and `/static/<file>`.
- Reports a `protocolVersion`, `deviceKind`, HTTP/media `capabilities`, `captureSources`, and static file URLs in HTTP payloads.
- Persists successful Wi-Fi credentials locally and reconnects on boot.
- Drives the XIAO ESP32S3 user LED on GPIO 21 as the status indicator: solid when Wi-Fi is connected, fast blink while connecting, and a 1s breathing pattern when offline. The red `CHG0` LED is a battery charging indicator, not an app-controlled status LED.

## Characteristics

- BLE `provision`: write Wi-Fi credentials and read the resulting provisioning state.
- Serial `wifi <ssid> <password>`: debug Wi-Fi provisioning from a USB serial monitor.
- HTTP `/status`: read device, storage, and network metadata.
- HTTP `/manifest`: read protocol, capability, media, and event summary metadata.
- HTTP `/events`: read captured fragment events.
- HTTP `/capture`: capture a photo to the flash ring and return its event JSON.
- HTTP `/static/<file>`: serve stored flash-ring files.

Events use the shape `{ id, type, content, ts, metadata }`. The boot event is readable before notifications begin, and capture events use ids scoped by `bootId` plus an event counter so the mobile app can deduplicate repeated syncs.

## Event Types

- `boot`: device startup heartbeat.
- `button`: hardware button capture signal.
- `serial`: serial-console capture fragment.
- `capture`: mobile-triggered screen-off capture request.
Only capture-like events are meant to become memory candidates in the mobile app. Manifest, command, and connection records are operational audit events.

## Upload

Use Arduino IDE with the XIAO ESP32S3 board support installed, open `iot.ino`, select the XIAO ESP32S3 board and port, then upload.

For command-line builds, this directory includes `arduino-cli.yaml` with the ESP32 board manager URL. From the repository root, run `pnpm verify:iot`; when Arduino CLI is available, the verifier compiles this sketch with the local config file.
