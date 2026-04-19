import { Room } from './Room.ts';

export interface OpenRoomInfo {
  roomId: string;
  creatorName: string;
  playerCount: number;
  maxPlayers: number;
  mode: string;
}

export class RoomManager {
  private rooms: Map<string, Room> = new Map();

  createRoom(): Room {
    const id = Math.random().toString(36).slice(2, 8);
    const room = new Room(id);
    this.rooms.set(id, room);
    return room;
  }

  getRoom(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  deleteRoom(id: string): void {
    this.rooms.delete(id);
  }

  listOpenRooms(): OpenRoomInfo[] {
    const result: OpenRoomInfo[] = [];
    for (const room of this.rooms.values()) {
      if (room.players.size > 0 && !room.isFull && room.state === null) {
        result.push({
          roomId: room.id,
          creatorName: room.creatorName,
          playerCount: room.players.size,
          maxPlayers: 2,
          mode: '1v1',
        });
      }
    }
    return result;
  }
}
