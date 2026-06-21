import { useSQLiteContext } from "expo-sqlite";
import { useEffect } from "react";
import { Platform } from "react-native";

import {
  getStardustBleStatus,
  restoreStardustDeviceSubscriptions,
} from "@/lib/devices/ble";

export function DeviceSubscriptionRestorer() {
  const db = useSQLiteContext();

  useEffect(() => {
    if (Platform.OS === "web") return;
    let active = true;

    void getStardustBleStatus()
      .then((status) => {
        if (!active || status !== "poweredOn") return undefined;
        return restoreStardustDeviceSubscriptions(db);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [db]);

  return null;
}
