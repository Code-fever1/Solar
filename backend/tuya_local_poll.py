#!/usr/bin/env python3
"""TOMZN smart meter poller — persistent daemon mode.

Reads JSON requests from stdin, writes JSON responses to stdout.
Keeps the tinytuya TCP connection and cloud SDK session alive across polls,
eliminating Python startup + import + connection overhead per poll.

Protocol:
  stdin:  {"cmd": "poll"}\n
  stdout: {"energyKwh": ...}\n   (success)
  stdout: {"error": "..."}\n     (failure)

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

# Persistent device + cloud session (initialized once, reused across polls)
_tuya_device = None
_cloud_device = None
_init_lock = threading.Lock()


def _init_connections():
    """Initialize the persistent tinytuya device + cloud session."""
    global _tuya_device, _cloud_device
    with _init_lock:
        if _tuya_device is None:
            try:
                _tuya_device = tinytuya.Device(
                    dev_id=DEVICE_ID,
                    address=DEVICE_IP,
                    local_key=LOCAL_KEY,
                    version=3.5,
                    connection_timeout=5,
                    persist=True,  # keep TCP socket open between polls
                )
                _tuya_device.set_socketPersistent(True)
                _tuya_device.set_socketRetryLimit(2)
            except Exception as e:
                print(json.dumps({"error": f"tuya init failed: {e}"}), file=sys.stderr)
                _tuya_device = None

        if _cloud_device is None:
            try:
                session = load_session(SESSION_FILE)
                if session:
                    devices = devices_from_session(session, SESSION_FILE)
                    for dev in devices:
                        if dev.id == DEVICE_ID:
                            _cloud_device = dev
                            break
            except Exception as e:
                print(json.dumps({"error": f"cloud init failed: {e}"}), file=sys.stderr)
                _cloud_device = None


def _reset_connections():
    """Reset connections on persistent failure (socket dropped, session expired)."""
    global _tuya_device, _cloud_device
    with _init_lock:
        if _tuya_device:
            try:
                _tuya_device.close()
            except Exception:
                pass
            _tuya_device = None
        _cloud_device = None
        _cloud_cache["data"] = None
        _cloud_cache["ts"] = 0


def get_cloud_status():
    """Get cloud status with 5s cache. Uses persistent cloud device."""
    global _cloud_device
    now = time.time()
    if _cloud_cache["data"] and now - _cloud_cache["ts"] < _CLOUD_CACHE_TTL:
        return _cloud_cache["data"]
    try:
        if _cloud_device is None:
            _init_connections()
        if _cloud_device:
            status = _cloud_device.status if hasattr(_cloud_device, "status") else {}
            if status:
                _cloud_cache["data"] = status
                _cloud_cache["ts"] = now
                return status
    except Exception:
        # Cloud session may have expired — reset for next init
        _cloud_device = None
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


def poll_device():
    """Poll the TOMZN device. Returns a result dict or raises Exception."""
    # Ensure connections are initialized
    if _tuya_device is None:
        _init_connections()

    local_dps = {}
    local_ok = False

    # Poll local Tuya (persistent socket — no TCP connect overhead)
    if _tuya_device:
        try:
            data = _tuya_device.status()
            if data and "Err" in data and data["Err"] != "0":
                # Socket may have dropped — reset for next poll
                _reset_connections()
                raise Exception(f"tuya status error: {data.get('Err')}")
            local_dps = data.get("dps", {}) if data else {}
            local_ok = True
        except Exception as e:
            # Socket dropped or device unreachable — reset connection
            _reset_connections()
            raise Exception(f"local poll failed: {e}")
    else:
        raise Exception("tuya device not initialized")

    # Cloud status (with cache — only hits API every 5s)
    cloud = get_cloud_status() if local_ok else {}
    cloud = cloud or {}

    # Decode phase_a for voltage/current/power
    phase = decode_phase_a(cloud.get("phase_a", ""))

    # Build result using correct DP mapping
    energy_raw = local_dps.get("1", cloud.get("forward_energy_total", 0))
    energy_kwh = energy_raw / 100 if energy_raw else 0

    freq_raw = local_dps.get("32", cloud.get("supply_frequency", 500))
    freq_hz = freq_raw / 10 if freq_raw else 50

    voltage_v = phase["voltage_v"] if phase else 0
    current_a = phase["current_a"] if phase else 0
    power_w = phase["power_w"] if phase else 0

    if not local_ok:
        is_online = False
        voltage_v = 0
        current_a = 0
        power_w = 0
    else:
        online_state = local_dps.get("35", cloud.get("online_state", "offline"))
        is_online = online_state == "online"

    switch_on = local_dps.get("16", cloud.get("switch", False))
    fault_code = local_dps.get("9", cloud.get("fault", 0))

    return {
        "energyKwh": round(energy_kwh, 2),
        "voltageV": voltage_v,
        "currentA": round(current_a, 2),
        "powerW": power_w,
        "frequencyHz": round(freq_hz, 1),
        "isOnline": is_online,
        "switchOn": switch_on,
        "faultCode": fault_code,
        "fetchedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
    }


def run_daemon():
    """Persistent daemon mode — read requests from stdin, write to stdout."""
    # Initialize connections on startup
    _init_connections()

    # Graceful shutdown
    running = [True]

    def _shutdown(signum, frame):
        running[0] = False
        # Close socket cleanly
        if _tuya_device:
            try:
                _tuya_device.close()
            except Exception:
                pass
        sys.exit(0)

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT, _shutdown)

    # Read requests from stdin, one JSON object per line
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
                result = poll_device()
                print(json.dumps(result))
            except Exception as e:
                print(json.dumps({"error": str(e)}))
            sys.stdout.flush()
        elif req.get("cmd") == "exit":
            break
        else:
            print(json.dumps({"error": f"unknown command: {req.get('cmd')}"}))
            sys.stdout.flush()

    # Cleanup
    if _tuya_device:
        try:
            _tuya_device.close()
        except Exception:
            pass


def run_oneshot():
    """Backward-compatible one-shot mode (original behavior)."""
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

    cloud = get_cloud_status() if local_ok else {}
    cloud = cloud or {}

    phase = decode_phase_a(cloud.get("phase_a", ""))

    energy_raw = local_dps.get("1", cloud.get("forward_energy_total", 0))
    energy_kwh = energy_raw / 100 if energy_raw else 0

    freq_raw = local_dps.get("32", cloud.get("supply_frequency", 500))
    freq_hz = freq_raw / 10 if freq_raw else 50

    voltage_v = phase["voltage_v"] if phase else 0
    current_a = phase["current_a"] if phase else 0
    power_w = phase["power_w"] if phase else 0

    if not local_ok:
        is_online = False
        voltage_v = 0
        current_a = 0
        power_w = 0
    else:
        online_state = local_dps.get("35", cloud.get("online_state", "offline"))
        is_online = online_state == "online"

    switch_on = local_dps.get("16", cloud.get("switch", False))
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
        "fetchedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
    }
    print(json.dumps(result))


if __name__ == "__main__":
    # Daemon mode if --daemon flag is passed, one-shot otherwise
    if "--daemon" in sys.argv:
        run_daemon()
    else:
        run_oneshot()
