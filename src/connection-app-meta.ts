/**
 * Which app meta (name/icon/brand) a connection renders with. PURE and free of
 * runtime imports so `node --test` can load it.
 *
 * The server inlines `app` on each connection summary. Three states:
 *   - an object  -> render from it; no lookup.
 *   - `null`     -> the server found no app row; render the `appId` fallback and
 *                   never look it up (a lookup would only miss again).
 *   - `undefined`-> an older server that does not inline it; use the by-id record
 *                   the apps provider resolved.
 */

/** The display fields every renderer of a connection's app reads. */
export interface InlineAppMeta {
  displayName?: string;
  iconSvg?: string;
  iconSvgDark?: string;
  brandColor?: string;
  brandColorDark?: string;
}

interface ConnectionLike {
  appId: string;
  app?: InlineAppMeta | null;
}

/** The meta to render a connection with, or `undefined` for the `appId` fallback. */
export function resolveConnectionAppMeta<A extends InlineAppMeta>(
  connection: ConnectionLike,
  byId: ReadonlyMap<string, A>,
): InlineAppMeta | undefined {
  if (connection.app) return connection.app;
  if (connection.app === null) return undefined;
  return byId.get(connection.appId);
}

/**
 * The app ids to look up by id: the unique `appId`s, first-seen order, of the
 * connections whose `app` is `undefined`. Rows with an object or `null` are
 * excluded.
 */
export function connectionAppIdsToLookUp(connections: readonly ConnectionLike[]): string[] {
  const seen = new Set<string>();
  for (const c of connections) {
    if (c.app === undefined) seen.add(c.appId);
  }
  return [...seen];
}
