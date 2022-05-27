declare module 'medium' {
  export type Channel = any
  export const chan: (concurrency?: number) => Channel
  export interface ChannelBuffers {
    fixed: Function
  }
  export const buffers: ChannelBuffers
  export function close(ch: Channel): void
  export function put<T = any>(channel: Channel, obj: T): Promise<boolean>
  export function take<T = any>(channel: Channel): Promise<T>
}
