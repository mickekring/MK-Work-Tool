declare global {
  interface Window {
    api: {
      invoke: <T>(channel: string, ...args: unknown[]) => Promise<T>
      on: (channel: string, callback: (...args: unknown[]) => void) => () => void
      getFilePath: (file: File) => string
    }
  }
}

export {}
