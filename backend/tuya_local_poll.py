#!/usr/bin/env python3
"""TOMZN smart meter poller.
Uses device-sharing SDK for phase_a (voltage/current/power) + cloud status,
and local Tuya protocol for real-time energy/frequency.
Called by Node.js backend as a child process.
Outputs JSON to stdout, errors to stderr.
"""
import sys
import os
import json
import base64
import struct
import time
import threading

# ── Local Tuya (real-time energy/frequency) ──
import tinytuya

DEVICE_ID = "bfe285c48ecd96460b5zfm"
DEVICE_IP = "113.203.197.44"
LOCAL_KEY = "KDdxg#}[Y_j@1UP@"
PORT = 6668

# ── Device-sharing SDK (phase_a / cloud status) ──
sys.path.insert(0, os.path.expanduser("~/tuya-local-key"))
from tuya_devices import load_session, devices_from_session

SESSION_FILE = os.path.expanduser("~/.config/tuya-smartlife/session.json")

# Cache cloud status for 5 seconds to avoid hammering the API
_cloud_cache = {"data": None, "ts": 0}
_CLOUD_CACHE_TTL = 5


def get_cloud_status():
    now = time.time()
    if _cloud_cache["data"] and now - _cloud_cache["ts"] < _CLOUD_CACHE_TTL:
        return _cloud_cache["data"]
    try:
        session = load_session(SESSION_FILE)
        if not session:
            return None
        devices = devices_from_session(session, SESSION_FILE)
        for dev in devices:
            if dev.id == DEVICE_ID:
                status = dev.status if hasattr(dev, "status") else {}
                _cloud_cache["data"] = status
                _cloud_cache["ts"] = now
                return status
    except Exception:
        pass
    return None


def decode_phase_a(b64):
    try:
        buf = base64.b64decode(b64)
        if len(buf) < 8:
            return None
        return {
            "voltage_v": struct.unpack(">H", buf[0:2])[0] / 10,
            "current_a": ((buf[2] << 16) | (buf[3] << 8) | buf[4]) / 1000,
            "power_w": (buf[5] << 16) | (buf[6] << 8) | buf[7],
        }
    except Exception:
        return None


def main():
    # ── Local Tuya poll (real-time) ──
    local_dps = {}
    local_ok = False

    def _poll_tuya():
        nonlocal local_dps, local_ok
        try:
            d = tinytuya.Device(
                dev_id=DEVICE_ID,
                address=DEVICE_IP,
                local_key=LOCAL_KEY,
                version=3.5,
                connection_timeout=5,
            )
            data = d.status()
            local_dps = data.get("dps", {})
            local_ok = True
        except Exception as e:
            print(json.dumps({"error": f"local poll failed: {e}"}), file=sys.stderr)

    t = threading.Thread(target=_poll_tuya, daemon=True)
    t.start()
    t.join(timeout=7)
    if t.is_alive():
        print(json.dumps({"error": "local poll timeout (7s)"}), file=sys.stderr)

    # ── Cloud status (phase_a with voltage/current/power) ──
    # Only call cloud SDK when local poll succeeded — when the device is
    # unreachable, cloud data is stale and the script should return fast.
    cloud = get_cloud_status() if local_ok else {}
    cloud = cloud or {}

    # Decode phase_a for voltage/current/power
    phase = decode_phase_a(cloud.get("phase_a", ""))

    # ── Build result using correct DP mapping ──
    # DP 1 = forward_energy_total, scale=2 (raw / 100 = kWh)
    energy_raw = local_dps.get("1", cloud.get("forward_energy_total", 0))
    energy_kwh = energy_raw / 100 if energy_raw else 0

    # DP 32 = supply_frequency, scale=1 (raw / 10 = Hz)
    freq_raw = local_dps.get("32", cloud.get("supply_frequency", 500))
    freq_hz = freq_raw / 10 if freq_raw else 50

    # Voltage/Current/Power: from phase_a (cloud device-sharing SDK)
    voltage_v = phase["voltage_v"] if phase else 0
    current_a = phase["current_a"] if phase else 0
    power_w = phase["power_w"] if phase else 0

    # DP 35 = online_state — when local poll fails, device is unreachable
    if not local_ok:
        is_online = False
        voltage_v = 0
        current_a = 0
        power_w = 0
    else:
        online_state = local_dps.get("35", cloud.get("online_state", "offline"))
        is_online = online_state == "online"

    # DP 16 = switch
    switch_on = local_dps.get("16", cloud.get("switch", False))

    # DP 9 = fault
    fault_code = local_dps.get("9", cloud.get("fault", 0))

    result = {
        "energyKwh": round(energy_kwh, 2),
        "voltageV": voltage_v,
        "currentA": round(current_a, 2),
        "powerW": power_w,
        "frequencyHz": round(freq_hz, 1),
        "isOnline": is_online,
        "switchOn": switch_on,
        "faultCode": fault_code,
        "fetchedAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    }
    print(json.dumps(result))


if __name__ == "__main__":
    main()
