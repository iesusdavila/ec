"use client";

import { create } from "zustand";
import type { GameResult, Player, Role, SessionStatus } from "@/core/types";
import { canTransition } from "@/core/session/sessionMachine";
import type { ConnectionState } from "@/core/realtime/usePresenceChannel";

interface SessionStoreState {
  role: Role | null;
  pin: string | null;
  myId: string | null;
  status: SessionStatus;
  selectedGameId: string | null;
  players: Player[];
  hostPresent: boolean;
  connectionState: ConnectionState;
  lastResult: GameResult | null;

  init: (role: Role, pin: string, myId: string) => void;
  setPlayers: (players: Player[]) => void;
  setHostPresent: (present: boolean) => void;
  setConnectionState: (state: ConnectionState) => void;
  setSelectedGameId: (id: string | null) => void;
  /** Usado por el host: valida la transición antes de aplicarla. */
  requestStatus: (status: SessionStatus) => boolean;
  /** Usado por jugadores (y el propio host) al recibir un snapshot remoto. */
  applyRemoteSnapshot: (snapshot: { status: SessionStatus; selectedGameId: string | null }) => void;
  setLastResult: (result: GameResult | null) => void;
  reset: () => void;
}

const initialState = {
  role: null as Role | null,
  pin: null as string | null,
  myId: null as string | null,
  status: "CREATED" as SessionStatus,
  selectedGameId: null as string | null,
  players: [] as Player[],
  hostPresent: false,
  connectionState: "idle" as ConnectionState,
  lastResult: null as GameResult | null,
};

export const useSessionStore = create<SessionStoreState>((set, get) => ({
  ...initialState,

  init: (role, pin, myId) => set({ ...initialState, role, pin, myId }),

  setPlayers: (players) => set({ players }),
  setHostPresent: (hostPresent) => set({ hostPresent }),
  setConnectionState: (connectionState) => set({ connectionState }),
  setSelectedGameId: (selectedGameId) => set({ selectedGameId }),

  requestStatus: (status) => {
    const current = get().status;
    if (!canTransition(current, status)) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(`Transición de sesión inválida: ${current} -> ${status}`);
      }
      return false;
    }
    set({ status });
    return true;
  },

  applyRemoteSnapshot: ({ status, selectedGameId }) => set({ status, selectedGameId }),

  setLastResult: (lastResult) => set({ lastResult }),

  reset: () => set({ ...initialState }),
}));
