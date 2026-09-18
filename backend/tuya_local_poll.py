#!/usr/bin/env python3
"""TOMZN smart meter poller — local tinytuya daemon.

Reads JSON requests from stdin, writes JSON responses to stdout.
Live data comes from a persistent TCP connection to the device (protocol v3.5).
A background pump sends status/UPDATEDPS and merges every inbound DPS packet,
so leftover Tuya frames cannot stall or freeze the live loop.

The Tuya cloud SDK is used only as a fallback when local TCP is stale, so IoT
Core API quota is not spent on the 2.5s live loop.

Protocol:
  stdin:  {"cmd": "poll"}\n
  stdin:  {"cmd": "poll", "force": true}\n
  stdout: {"energyKwh": ..., "source": "local"|"cloud_fallback"}\n
  stdout: {"error": "..."}\n
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

import tinytuya

DEVICE_ID = "bfe285c48ecd96460b5zfm"
DEVICE_IP = os.environ.get("TOMZN_DEVICE_IP", "113.203.197.44")
LOCAL_KEY = os.environ.get("TOMZN_LOCAL_KEY", "KDdxg#}[Y_j@1UP@")
PORT = int(os.environ.get("TOMZN_DEVICE_PORT", "6668"))

sys.path.insert(0, os.path.expanduser("~/tuya-local-key"))
from tuya_devices import load_session, build_manager

SESSION_FILE = os.path.expanduser("~/.config/tuya-smartlife/session.json")
_CLOUD_CACHE_TTL = 60
_STATUS_EVERY_S = 2.0
_PHASE_EVERY_S = 1.0
_LOCAL_STALE_S = 12
_WARMUP_S = 7.0

_tuya_device = None
_cloud_manager = None
_cloud_device = None
_cloud_cache = {"data": None, "ts": 0}
_local_dps = {}
_last_local_rx = 0.0
_phase_ts = 0.0
_local_fail = 0
_force_reset = False
_stop = threading.Event()
_pump_thread = None
_dps_lock = threading.Lock()
_init_lock = threading.Lock()


def _extract_dps(data):
    if not isinstance(data, dict):
        return {}
    dps = data.get("dps")
    if isinstance(dps, dict) and dps:
        return dps
    inner = data.get("data")
    if isinstance(inner, dict):
        inner_dps = inner.get("dps")
        if isinstance(inner_dps, dict):
            return inner_dps
    return {}


def _merge_dps(data):
    global _last_local_rx, _phase_ts
    dps = _extract_dps(data)
    if not dps:
        return False
    now = time.time()
    changed = False
    with _dps_lock:
        for key, value in dps.items():
            if value is None:
                continue
            _local_dps[str(key)] = value
            changed = True
            if str(key) == "6":
                if decode_phase_a(value) is None:
                    continue
                _phase_ts = now
        if changed:
            _last_local_rx = now
    return changed


def _snapshot_dps():
    with _dps_lock:
        return dict(_local_dps), _last_local_rx, _phase_ts


def _clear_dps():
    global _last_local_rx, _phase_ts
    with _dps_lock:
        _local_dps.clear()
        _last_local_rx = 0.0
        _phase_ts = 0.0


def _init_local():
    global _tuya_device
    with _init_lock:
        if _tuya_device is not None:
            return
        try:
            device = tinytuya.Device(
                dev_id=DEVICE_ID,
                address=DEVICE_IP,
                local_key=LOCAL_KEY,
                version=3.5,
                port=PORT,
                connection_timeout=1.5,
                persist=True,
                connection_retry_limit=1,
                connection_retry_delay=0.4,
            )
            device.set_socketPersistent(True)
            device.set_socketRetryLimit(1)
            device.set_socketTimeout(1.5)
            _tuya_device = device
        except Exception as exc:
            print(json.dumps({"error": f"tuya local init failed: {exc}"}), file=sys.stderr)
            _tuya_device = None


def _close_local():
    global _tuya_device
    with _init_lock:
        device = _tuya_device
        _tuya_device = None
    if not device:
        return
    try:
        device.close()
    except Exception:
        pass


def _reset_local():
    _close_local()
    _clear_dps()


def _refresh_device_ref():
    global _cloud_device
    if _cloud_manager is None:
        _cloud_device = None
        return
    for dev in list(_cloud_manager.device_map.values()):
        if dev.id == DEVICE_ID:
            _cloud_device = dev
            return
    _cloud_device = None


def _init_cloud():
    global _cloud_manager, _cloud_device
    with _init_lock:
        if _cloud_manager is not None:
            return
        try:
            session = load_session(SESSION_FILE)
            if not session:
                print(json.dumps({"error": "no Tuya session found"}), file=sys.stderr)
                return
            _cloud_manager = build_manager(session, SESSION_FILE)
            _cloud_manager.update_device_cache()
            _refresh_device_ref()
        except Exception as exc:
            print(json.dumps({"error": f"cloud init failed: {exc}"}), file=sys.stderr)
            _cloud_manager = None
            _cloud_device = None


def _reset_cloud():
    global _cloud_manager, _cloud_device
    with _init_lock:
        _cloud_manager = None
        _cloud_device = None
        _cloud_cache["data"] = None
        _cloud_cache["ts"] = 0


def _pump_loop():
    global _force_reset
    last_status = 0.0
    last_phase = 0.0
    while not _stop.is_set():
        try:
            if _force_reset:
                _reset_local()
                last_status = 0.0
                last_phase = 0.0
                _force_reset = False
            _init_local()
            if _tuya_device is None:
                time.sleep(0.8)
                continue
            now = time.time()
            if now - last_status >= _STATUS_EVERY_S:
                _tuya_device.status(nowait=True)
                last_status = now
            if now - last_phase >= _PHASE_EVERY_S:
                _tuya_device.updatedps([6], nowait=True)
                last_phase = now
            data = _tuya_device.receive()
            if data:
                _merge_dps(data)
        except Exception as exc:
            print(json.dumps({"debug": f"local pump: {exc}"}), file=sys.stderr)
            _reset_local()
            last_status = 0.0
            last_phase = 0.0
            time.sleep(0.5)


def _start_pump():
    global _pump_thread
    with _init_lock:
        if _pump_thread and _pump_thread.is_alive():
            return
        _stop.clear()
        _pump_thread = threading.Thread(target=_pump_loop, name="tomzn-local-pump", daemon=True)
        _pump_thread.start()


def get_cloud_status(force=False):
    now = time.time()
    if not force and _cloud_cache["data"] and now - _cloud_cache["ts"] < _CLOUD_CACHE_TTL:
        return _cloud_cache["data"]
    try:
        if _cloud_manager is None:
            _init_cloud()
        if _cloud_manager is None:
            return None
        _cloud_manager.update_device_cache()
        _refresh_device_ref()
        if _cloud_device:
            status = _cloud_device.status if hasattr(_cloud_device, "status") else {}
            if status:
                _cloud_cache["data"] = status
                _cloud_cache["ts"] = now
                return status
    except Exception as exc:
        print(json.dumps({"debug": f"cloud status error: {exc}"}), file=sys.stderr)
        _reset_cloud()
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


def _result_from_dps(dps, source):
    phase = decode_phase_a(dps.get("6", ""))
    energy_raw = dps.get("1") or 0
    freq_raw = dps.get("32") or 500
    online_state = dps.get("35", "online")
    switch_on = bool(dps.get("16", False))
    fault_code = dps.get("9") or 0
    # Local TCP answered — the meter is reachable. DP 35 is cloud-ish and can
    # flap; do not let it zero a good local phase_a reading.
    is_online = True
    voltage_v = phase["voltage_v"] if phase else 0
    current_a = phase["current_a"] if phase else 0
    power_w = phase["power_w"] if phase else 0
    return {
        "energyKwh": round((energy_raw / 100) if energy_raw else 0, 2),
        "voltageV": voltage_v,
        "currentA": round(current_a, 2),
        "powerW": power_w,
        "frequencyHz": round((freq_raw / 10) if freq_raw else 50, 1),
        "isOnline": is_online,
        "switchOn": switch_on,
        "faultCode": fault_code,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "source": source,
    }


def _poll_cloud(force=False):
    cloud = get_cloud_status(force=force) or {}
    if not cloud:
        return None
    phase = decode_phase_a(cloud.get("phase_a", ""))
    energy_raw = cloud.get("forward_energy_total", 0)
    freq_raw = cloud.get("supply_frequency", 500)
    is_online = cloud.get("online_state", "offline") == "online"
    voltage_v = phase["voltage_v"] if phase else 0
    current_a = phase["current_a"] if phase else 0
    power_w = phase["power_w"] if phase else 0
    if not is_online:
        voltage_v = 0
        current_a = 0
        power_w = 0
    return {
        "energyKwh": round((energy_raw / 100) if energy_raw else 0, 2),
        "voltageV": voltage_v,
        "currentA": round(current_a, 2),
        "powerW": power_w,
        "frequencyHz": round((freq_raw / 10) if freq_raw else 50, 1),
        "isOnline": is_online,
        "switchOn": bool(cloud.get("switch", False)),
        "faultCode": cloud.get("fault", 0) or 0,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "source": "cloud_fallback",
    }


def poll_device(force=False):
    """Return latest local DPS. Cloud only if local cache is empty/stale.

    `force` is kept for the Node protocol (bypass Node's 2.5s cache). It must
    NOT reset the local TCP session — the live loop sends force every 2.5s.
    """
    global _local_fail
    _start_pump()
    _, existing_rx, _ = _snapshot_dps()
    deadline = time.time() + (_WARMUP_S if existing_rx == 0 else 0.05)
    dps, last_rx, _phase = {}, 0.0, 0.0
    while True:
        dps, last_rx, _phase = _snapshot_dps()
        if "1" in dps and "6" in dps:
            break
        if time.time() >= deadline:
            break
        time.sleep(0.05)

    now = time.time()
    local_fresh = last_rx > 0 and (now - last_rx) < _LOCAL_STALE_S and "1" in dps
    if local_fresh:
        _local_fail = 0
        return _result_from_dps(dps, "local")

    _local_fail += 1
    print(json.dumps({"debug": f"local cache stale/empty (fail={_local_fail}) dps={sorted(dps.keys())}"}), file=sys.stderr)
    cloud_result = _poll_cloud(force=True)
    if cloud_result:
        return cloud_result
    if "1" in dps:
        return _result_from_dps(dps, "local")
    raise Exception("local poll failed: no DPS yet")


def run_daemon():
    _start_pump()

    def _shutdown(signum, frame):
        _stop.set()
        _close_local()
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
                result = poll_device(force=req.get("force", False))
                print(json.dumps(result))
            except Exception as exc:
                print(json.dumps({"error": str(exc)}))
            sys.stdout.flush()
        elif req.get("cmd") == "exit":
            break
        else:
            print(json.dumps({"error": f"unknown command: {req.get('cmd')}"}))
            sys.stdout.flush()

    _stop.set()
    _close_local()


def run_oneshot():
    try:
        result = poll_device(force=False)
        print(json.dumps(result))
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
    finally:
        _stop.set()
        _close_local()


if __name__ == "__main__":
    if "--daemon" in sys.argv:
        run_daemon()
    else:
        run_oneshot()
