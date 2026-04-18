import { Room } from './Room.ts';

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
}
