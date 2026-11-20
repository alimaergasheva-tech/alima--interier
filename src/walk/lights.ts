// Свет в прогулке (SPEC D-08, D-11, задача 24.4): число одновременно светящих источников ограничено,
// выбираются включённые светильники ближайших к игроку комнат. Логика чистая.

export const WALK_LIGHT_LIMIT = 4;

export interface RoomLightSpot {
  roomId: string;
  xCm: number;
  zCm: number;
  on: boolean;
}

/** Не более `limit` включённых светильников, ближайших к игроку; порядок — по близости. */
export function pickWalkLights(spots: RoomLightSpot[], player: { xCm: number; zCm: number }, limit: number = WALK_LIGHT_LIMIT): RoomLightSpot[] {
  return spots
    .filter((spot) => spot.on)
    .map((spot) => ({ spot, distance: Math.hypot(spot.xCm - player.xCm, spot.zCm - player.zCm) }))
    .sort((a, b) => a.distance - b.distance || a.spot.roomId.localeCompare(b.spot.roomId))
    .slice(0, Math.max(0, limit))
    .map((item) => item.spot);
}
