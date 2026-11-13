// Types the reused engine expects from its host, which in the extension is plain Node: the clock and the
// store are the only surfaces drawMap's neighbours never touch at runtime here, but map.ts re-exports them.
declare module 'claude-code' {
  export type Shaped<T> = T
  export interface EngineInterface {}
  export interface Register {}
  export function atom(...args: never[]): never
  export function read(...args: never[]): never
  export function update(...args: never[]): never
}
