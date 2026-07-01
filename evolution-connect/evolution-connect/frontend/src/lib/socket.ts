import { io, Socket } from "socket.io-client";

const BACKEND_URL =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ||
  "http://localhost:4000";

export const socket: Socket = io(BACKEND_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 800,
  reconnectionDelayMax: 4000,
});

export function emitAck<TResponse = any>(
  event: string,
  payload: Record<string, unknown> = {}
): Promise<TResponse> {
  return new Promise((resolve) => {
    socket.emit(event, payload, (response: TResponse) => resolve(response));
  });
}

export { BACKEND_URL };
