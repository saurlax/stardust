# Stardust Sense

Arduino sketch for Seeed Studio XIAO ESP32S3 Sense as a screen-off Stardust capture device.

## Behavior

- Advertises as `Stardust Sense`.
- Exposes BLE service `7b3f4a10-9d62-4a7d-a0d9-2ffb9239c4d1`.
- Publishes lightweight JSON events over the notify characteristic, including stable per-boot event ids.
- Accepts JSON commands for `sync`, `capture`, and `sleep`.
- Reports a `protocolVersion`, `deviceKind`, capture/command `capabilities`, `captureSources`, and media placeholders in status and manifest payloads.
- Keeps BLE focused on lightweight metadata and event sync; the manifest exposes a `transferPlan` where media payloads remain on microSD for later Wi-Fi LAN transfer.
- Reserves camera, microphone, and microSD media transfer for later firmware iterations.

## Characteristics

- `device_status`: read device metadata.
- `event_stream`: read/notify screen-off capture events.
- `command`: write commands from the mobile app.
- `manifest`: read a lightweight media/event manifest with protocol version, device kind, capabilities, capture sources, event counts, and media placeholders.

Events use the shape `{ id, type, content, ts, metadata }`. The boot event is readable before notifications begin, and capture events use ids scoped by `bootId` plus an event counter so the mobile app can deduplicate repeated syncs.

## Event Types

- `boot`: device startup heartbeat.
- `button`: hardware button capture signal.
- `serial`: serial-console capture fragment.
- `capture`: mobile-triggered screen-off capture request.
- `sync`: mobile-triggered manifest/event sync heartbeat.
- `sleep`: mobile-triggered sleep request.

Only capture-like events are meant to become memory candidates in the mobile app. Manifest, command, and connection records are operational audit events.

## Upload

Use Arduino IDE with the XIAO ESP32S3 board support installed, open `iot.ino`, select the XIAO ESP32S3 board and port, then upload.
