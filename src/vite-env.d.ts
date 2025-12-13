/// <reference types="vite/client" />

declare module 'virtual:terminal' {
  export const terminal: {
    log: (...args: any[]) => void
    error: (...args: any[]) => void
    warn: (...args: any[]) => void
    info: (...args: any[]) => void
  }
  export default terminal
}
