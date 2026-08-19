"""
Post-deployment live smoke test script for Spelling Bee.
Verifies HTTP endpoints, HTML headers, and live WebSocket connectivity through proxy.
"""

import asyncio
import json
import os
import sys
import httpx
import websockets

BASE_URL = os.getenv("TARGET_URL", "https://levon.ajwest.ca/spelling")


async def main():
	base = BASE_URL.rstrip("/")
	print(f"[*] Running smoke test against: {base}")

	async with httpx.AsyncClient(follow_redirects=True) as client:
		# 1. Test index & Cache-Control headers
		print("[1/3] Testing HTML index and cache headers...")
		res = await client.get(f"{base}/")
		if res.status_code != 200:
			print(f"[FAIL] HTTP {res.status_code} on index")
			sys.exit(1)

		cache_hdr = res.headers.get("Cache-Control", "")
		print(f"      Status: 200 OK | Cache-Control: {cache_hdr or 'None'}")

		# 2. Test Room Creation REST API
		print("[2/3] Creating test multiplayer room...")
		res_room = await client.post(f"{base}/api/rooms", json={
			"host_id": "smoke_host",
			"host_name": "SmokeHost",
		})
		if res_room.status_code != 200:
			print(f"[FAIL] Failed to create room: HTTP {res_room.status_code}")
			sys.exit(1)

		room_data = res_room.json()
		code = room_data.get("code")
		print(f"      Created room: {code}")

	# 3. Test Live WebSocket Handshake & Snapshot
	print("[3/3] Establishing live WebSocket handshake...")
	ws_proto = "wss" if base.startswith("https") else "ws"
	host_part = base.split("://", 1)[1]
	ws_url = f"{ws_proto}://{host_part}/ws/room/{code}?player_id=smoke_guest"

	try:
		async with websockets.connect(ws_url) as ws:
			raw_msg = await asyncio.wait_for(ws.recv(), timeout=6)
			msg = json.loads(raw_msg)
			if msg.get("type") != "room_state":
				print(f"[FAIL] Unexpected message type: {msg.get('type')}")
				sys.exit(1)

			snapshot = msg.get("payload", {}).get("snapshot", {})
			host_id = snapshot.get("host_id")
			if host_id != "smoke_host":
				print(f"[FAIL] Host ID mismatch in snapshot: {host_id}")
				sys.exit(1)

			print(f"      Live WebSocket connected successfully! Host verified: {host_id}")
	except Exception as exc:
		print(f"[FAIL] WebSocket handshake error: {exc}")
		sys.exit(1)

	print("[SUCCESS] All smoke tests passed successfully!")


if __name__ == "__main__":
	asyncio.run(main())
