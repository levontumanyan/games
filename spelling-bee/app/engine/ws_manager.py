"""
WebSocket connection manager for multiplayer rooms.
"""

import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
	def __init__(self):
		# room_code -> {player_id: WebSocket}
		self._rooms: dict[str, dict[str, WebSocket]] = {}

	async def connect(self, room_code: str, player_id: str, websocket: WebSocket) -> None:
		await websocket.accept()
		if room_code not in self._rooms:
			self._rooms[room_code] = {}
		self._rooms[room_code][player_id] = websocket

	def disconnect(self, room_code: str, player_id: str) -> None:
		if room_code in self._rooms and player_id in self._rooms[room_code]:
			del self._rooms[room_code][player_id]
			if not self._rooms[room_code]:
				del self._rooms[room_code]

	async def send_personal(self, room_code: str, player_id: str, message: dict[str, Any]) -> None:
		if room_code in self._rooms and player_id in self._rooms[room_code]:
			ws = self._rooms[room_code][player_id]
			try:
				await ws.send_json(message)
			except Exception as exc:
				logger.debug(
					f"Failed to send personal WS message to {player_id} in {room_code}: {exc}"
				)

	async def broadcast(
		self, room_code: str, message: dict[str, Any], exclude_player_id: str | None = None
	) -> None:
		if room_code not in self._rooms:
			return
		dead_players = []
		for pid, ws in list(self._rooms[room_code].items()):
			if exclude_player_id and pid == exclude_player_id:
				continue
			try:
				await ws.send_json(message)
			except Exception as exc:
				logger.debug(f"Failed broadcast to {pid} in {room_code}: {exc}")
				dead_players.append(pid)
		for pid in dead_players:
			self.disconnect(room_code, pid)


ws_manager = ConnectionManager()
