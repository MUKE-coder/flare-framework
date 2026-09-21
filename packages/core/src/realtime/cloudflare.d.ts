/**
 * Minimal ambient types for `cloudflare:workers` — the subset the realtime
 * primitive uses, so @flare/core typechecks (and emits d.ts) without pulling
 * in @cloudflare/workers-types globally (whose DOM types would clash with the
 * DOM lib the rest of core uses).
 *
 * Build-time declaration only: the import stays external in the published ES
 * module and is resolved by the Workers runtime / vite plugin when a consumer
 * app bundles it. Apps that already type `cloudflare:workers` (vinext apps via
 * vinext/types + generated worker-configuration.d.ts) supply the authoritative
 * shapes at their own compile time.
 *
 * The `DurableObject` base deliberately declares only `ctx`/`env`: the runtime
 * discovers `fetch`, `webSocketMessage`, `webSocketClose`, `webSocketError` and
 * `webSocketHibernationAbort` on subclasses by duck typing, and declaring them
 * here would force property<->method override conflicts for consumers.
 */
declare module "cloudflare:workers" {
  export interface Env {
    [key: string]: unknown;
  }

  export interface DurableObjectId {
    toString(): string;
  }

  export type DurableObjectStorage = {
    get<T = unknown>(key: string): Promise<T | undefined>;
    put(key: string, value: unknown): Promise<void>;
    delete(key: string): Promise<void>;
    list<T = unknown>(options?: { prefix?: string }): Promise<Map<string, T>>;
  };

  export interface DurableObjectState {
    readonly id: DurableObjectId;
    readonly storage: DurableObjectStorage;
    blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
    acceptWebSocket(websocket: HibernatableWebSocket, tags?: string[]): void;
    getWebSockets(tag?: string): HibernatableWebSocket[];
    getTagsByWebSocket(websocket: HibernatableWebSocket): string[];
  }

  export class DurableObject<State = DurableObjectState, EnvType = Env> {
    protected constructor(state: State, env: EnvType);
    protected ctx: State;
    protected env: EnvType;
  }

  export interface DurableObjectNamespace<T = DurableObject> {
    get(id: DurableObjectId): T;
    idFromName(name: string): DurableObjectId;
    idFromString(id: string): DurableObjectId;
    newUniqueId(): DurableObjectId;
  }

  export type HibernatableWebSocket = WebSocket & {
    serializeAttachment(value: unknown): void;
    deserializeAttachment<T = unknown>(): T;
  };

  export class WebSocketPair {
    0: HibernatableWebSocket;
    1: HibernatableWebSocket;
  }
}