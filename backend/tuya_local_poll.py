#!/usr/bin/env python3
"""TOMZN smart meter poller — cloud-only daemon.

Reads JSON requests from stdin, writes JSON responses to stdout.
All data comes from the Tuya device-sharing cloud SDK (no local TCP).

Protocol:
  stdin:  {"cmd": "poll"}\n              — cached poll (10s TTL)
  stdin:  {"cmd": "poll", "force": true}\n — force-refresh from cloud
  stdout: {"energyKwh": ...}\n           (success)
  stdout: {"error": "..."}\n             (failure)

Also supports one-shot mode (no args → single poll → exit) for backward
compatibility with the old execFile call pattern.
"""
import sys
import os
import json
import base64
import struct
import time
import threading
import signal
from datetime import datetime, timezone

# ── Device-sharing SDK (all data comes from Tuya cloud) ──
sys.path.insert(0, os.path.expanduser("~/tuya-local-key"))
from tuya_devices import load_session, build_manager

DEVICE_ID = "bfe285c48ecd96460b5zfm"
SESSION_FILE = os.path.expanduser("~/.config/tuya-smartlife/session.json")

# Cloud cache TTL — the Tuya cloud SDK caches device status on its servers.
# update_device_cache() fetches fresh data from the cloud API. 10s balances
# freshness with API rate limits. The app's refresh button sends force=true
# to bust this cache for an instant update.
_CLOUD_CACHE_TTL = 10

# Persistent cloud manager + device (initialized once, reused across polls)
_cloud_manager = None
_cloud_device = None
_cloud_cache = {"data": None, "ts": 0}
_init_lock = threading.Lock()


def _init_connections():
    """Initialize the persistent cloud SDK session."""
    global _cloud_manager, _cloud_device
    with _init_lock:
        if _cloud_manager is None:
            try:
                session = load_session(SESSION_FILE)
                if not session:
                    print(json.dumps({"error": "no Tuya session found"}), file=sys.stderr)
                    return
                _cloud_manager = build_manager(session, SESSION_FILE)
                _cloud_manager.update_device_cache()
                _refresh_device_ref()
            except Exception as e:
                print(json.dumps({"error": f"cloud init failed: {e}"}), file=sys.stderr)
                _cloud_manager = None
                _cloud_device = None


def _refresh_device_ref():
    """Re-fetch the device object from device_map after update_device_cache().
    update_device_cache() may replace device objects with fresh ones, so the
    old _cloud_device reference would point to stale status."""
    global _cloud_device
    if _cloud_manager is None:
        _cloud_device = None
        return
    for dev in list(_cloud_manager.device_map.values()):
        if dev.id == DEVICE_ID:
            _cloud_device = dev
            return
    _cloud_device = None


def _reset_connections():
    """Reset cloud session on persistent failure (token expired, API down)."""
    global _cloud_manager, _cloud_device
    with _init_lock:
        _cloud_manager = None
        _cloud_device = None
        _cloud_cache["data"] = None
        _cloud_cache["ts"] = 0


def get_cloud_status(force=False):
    """Get cloud device status. Uses a 10s cache to avoid API rate limits.
    When force=True, busts the cache and fetches fresh data from the cloud."""
    global _cloud_device, _cloud_manager
    now = time.time()
    if not force and _cloud_cache["data"] and now - _cloud_cache["ts"] < _CLOUD_CACHE_TTL:
        return _cloud_cache["data"]
    try:
        if _cloud_manager is None:
            _init_connections()
        if _cloud_manager is None:
            return None
        # Fetch fresh device status from the Tuya cloud API.
        _cloud_manager.update_device_cache()
        _refresh_device_ref()
        if _cloud_device:
            status = _cloud_device.status if hasattr(_cloud_device, "status") else {}
            if status:
                _cloud_cache["data"] = status
                _cloud_cache["ts"] = now
                return status
    except Exception as e:
        print(json.dumps({"debug": f"cloud status error: {e}"}), file=sys.stderr)
        _reset_connections()
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


def poll_device(force=False):
    """Poll the TOMZN device from the Tuya cloud. Returns result dict or raises.
    All fields (energy, power, voltage, current, frequency, online, switch,
    fault) come from the cloud device status."""
    cloud = get_cloud_status(force=force)
    cloud = cloud or {}

    # Decode phase_a for voltage/current/power
    phase = decode_phase_a(cloud.get("phase_a", ""))

    # All fields from cloud status
    energy_raw = cloud.get("forward_energy_total", 0)
    energy_kwh = energy_raw / 100 if energy_raw else 0

    freq_raw = cloud.get("supply_frequency", 500)
    freq_hz = freq_raw / 10 if freq_raw else 50

    voltage_v = phase["voltage_v"] if phase else 0
    current_a = phase["current_a"] if phase else 0
    power_w = phase["power_w"] if phase else 0

    online_state = cloud.get("online_state", "offline")
    is_online = online_state == "online"

    switch_on = cloud.get("switch", False)
    fault_code = cloud.get("fault", 0)

    # If the cloud reports the device as offline, zero out the live readings
    if not is_online:
        voltage_v = 0
        current_a = 0
        power_w = 0

    return {
        "energyKwh": round(energy_kwh, 2),
        "voltageV": voltage_v,
        "currentA": round(current_a, 2),
        "powerW": power_w,
        "frequencyHz": round(freq_hz, 1),
        "isOnline": is_online,
        "switchOn": switch_on,
        "faultCode": fault_code,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
    }


def run_daemon():
    """Persistent daemon mode — read requests from stdin, write to stdout."""
    _init_connections()

    def _shutdown(signum, frame):
        sys.exit(0)

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT, _shutdown)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            print(json.dumps({"error": "invalid JSON request"}))
            sys.stdout.flush()
            continue

        if req.get("cmd") == "poll":
            try:
                force = req.get("force", False)
                result = poll_device(force=force)
                print(json.dumps(result))
            except Exception as e:
                print(json.dumps({"error": str(e)}))
            sys.stdout.flush()
        elif req.get("cmd") == "exit":
            break
        else:
            print(json.dumps({"error": f"unknown command: {req.get('cmd')}"}))
            sys.stdout.flush()


def run_oneshot():
    """Backward-compatible one-shot mode."""
    try:
        result = poll_device()
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))


if __name__ == "__main__":
    if "--daemon" in sys.argv:
        run_daemon()
    else:
        run_oneshot()
