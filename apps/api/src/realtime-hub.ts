import { EventEmitter } from "node:events";
import type { LiveUserEvent } from "@nnact/shared";

const bus = new EventEmitter();
bus.setMaxListeners(5000);

export function publishUserLiveEvent(userId: string, event: LiveUserEvent): void {
  bus.emit(`user:${userId}`, event);
}

export function subscribeUserLiveEvents(
  userId: string,
  listener: (event: LiveUserEvent) => void,
): () => void {
  const channel = `user:${userId}`;
  bus.on(channel, listener);
  return () => bus.off(channel, listener);
}
