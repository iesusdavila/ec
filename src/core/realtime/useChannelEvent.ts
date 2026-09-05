"use client";

import { useEffect, useRef } from "react";
import type { Channel } from "pusher-js";

/**
 * Se suscribe a un evento de canal mientras el componente está montado y
 * limpia el binding automáticamente al desmontar o si el canal/evento
 * cambian. El handler puede cambiar entre renders sin re-suscribirse.
 */
export function useChannelEvent<T>(
  channel: Channel | null,
  eventName: string,
  handler: (data: T) => void
): void {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!channel) return;
    const listener = (data: T) => handlerRef.current(data);
    channel.bind(eventName, listener);
    return () => {
      channel.unbind(eventName, listener);
    };
  }, [channel, eventName]);
}

/**
 * Envía un evento de cliente ("client-*") de forma segura: si el canal aún
 * no está suscrito o los eventos de cliente no están habilitados en el
 * dashboard de Pusher, falla en silencio en vez de romper el juego.
 */
export function sendClientEvent(channel: Channel | null, eventName: string, data: unknown): void {
  if (!channel || !channel.subscribed) return;
  try {
    const sent = channel.trigger(eventName, data);
    if (!sent && process.env.NODE_ENV !== "production") {
      console.warn(
        `${eventName} no se envió: revisa que "Enable client events" esté activo en el dashboard de Pusher.`
      );
    }
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`No se pudo enviar ${eventName}:`, err);
    }
  }
}
