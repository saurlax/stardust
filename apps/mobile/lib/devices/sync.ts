import type { SQLiteDatabase } from "expo-sqlite";

import { listDevices } from "@/lib/db";
import { syncStardustDeviceHttp } from "@/lib/devices/http";

export type StardustDeviceSyncResult = {
  deviceCount: number;
  syncedCount: number;
};

export const syncAllStardustDevices = async (
  db: SQLiteDatabase,
): Promise<StardustDeviceSyncResult> => {
  const devices = await listDevices(db);
  const networkDevices = devices.filter((device) => device.networkCaptureUrl);
  const results = await Promise.allSettled(
    networkDevices.map((device) => syncStardustDeviceHttp(db, device)),
  );
  return {
    deviceCount: networkDevices.length,
    syncedCount: results.filter((result) => result.status === "fulfilled").length,
  };
};
