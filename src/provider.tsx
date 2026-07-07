/**
 * Provider + hook that give every component a single, typed w6w API client.
 *
 * Consumers wrap their app once and every component under it can grab the
 * client via `useW6wApi()` — no more per-component callback prop drilling.
 *
 *   const api = createW6wApi({ baseUrl: "/api", token });
 *   <W6wUIProvider api={api}>...</W6wUIProvider>
 */
import { type ReactNode, createContext, useContext } from "react";
import type { ActionDef, AppSummary, AuthDef, ConnectionSummary } from "./types.ts";

/**
 * The surface every w6w-io component may call. Grows as we add components;
 * new members are added at the end so consumer implementations only need to
 * grow when they want to use the new component.
 */
export interface W6wApi {
  /** List registered apps to pick from in the connection modal. */
  listApps(): Promise<AppSummary[]>;

  /** Load auth methods declared by an app's manifest, with availability flags. */
  getAppAuth(appId: string): Promise<AuthDef[]>;

  /** Create a non-OAuth connection with a user-supplied credential. */
  createConnection(
    appId: string,
    body: {
      authKey: string;
      credential: Record<string, unknown>;
      displayName?: string;
      profile?: Record<string, unknown>;
    },
  ): Promise<ConnectionSummary>;

  /**
   * Start an OAuth 2.0 flow. Server builds the provider's authorize URL and
   * returns it; the caller opens it in a popup and awaits the server's
   * callback message (see `startOAuthPopup`).
   */
  startAppOAuthFlow(
    appId: string,
    authKey: string,
    body: { displayName?: string },
  ): Promise<{ authorizationUrl: string }>;

  /** List the actions an app exposes, to pick from in the step builder. */
  getAppActions(appId: string): Promise<ActionDef[]>;

  /** List the connections that already exist for a given app. */
  listConnectionsForApp(appId: string): Promise<ConnectionSummary[]>;
}

const Ctx = createContext<W6wApi | null>(null);

export interface W6wUIProviderProps {
  api: W6wApi;
  children: ReactNode;
}

/** Provides the w6w API client to every component under it. */
export function W6wUIProvider({ api, children }: W6wUIProviderProps) {
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

/**
 * Access the w6w API client. Throws a helpful error if used outside a
 * `<W6wUIProvider>` — the common mistake is forgetting to wrap the app root.
 */
export function useW6wApi(): W6wApi {
  const api = useContext(Ctx);
  if (!api) {
    throw new Error(
      "useW6wApi must be used inside <W6wUIProvider>. " +
        "Wrap your app root with <W6wUIProvider api={api}>...</W6wUIProvider>.",
    );
  }
  return api;
}
