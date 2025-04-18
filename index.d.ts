declare module 'electron-reload-esm' {
  export interface ReloadOptions { /* … */ }
  export function electronReload(glob: string, options?: ReloadOptions): void;
  export default electronReload;
}