/**
 * Change notification pushed to all clients watching an event. Clients refetch what changed;
 * the message itself carries no data, so public and admin views can share one stream.
 */
export interface ChangeMessage {
  eventId: string;
  type: 'event' | 'tables' | 'persons' | 'competition' | 'match';
  id: string;
}

type Listener = (message: ChangeMessage) => void;

/** In-process pub/sub. One app instance serves a tournament; a shared bus (e.g. Postgres NOTIFY) can replace it later. */
export class Broadcaster {
  private readonly listeners = new Map<string, Set<Listener>>();

  subscribe(eventId: string, listener: Listener): () => void {
    const set = this.listeners.get(eventId) ?? new Set();
    set.add(listener);
    this.listeners.set(eventId, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(eventId);
    };
  }

  publish(message: ChangeMessage): void {
    for (const listener of this.listeners.get(message.eventId) ?? []) listener(message);
  }

  subscriberCount(eventId: string): number {
    return this.listeners.get(eventId)?.size ?? 0;
  }
}
