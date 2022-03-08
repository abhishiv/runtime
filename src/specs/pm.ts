import { IFileSystem } from '@gratico/fs'
import { ILogicalTree } from './runtime'
import { IRuntime } from './runtime'
type Fetch = Window['fetch']

export interface IPackageManagerProps {
  fs: IFileSystem
  workingDirectory: string
  fetch: Fetch
  evalFunction: Function
}
export interface IPackageManager {
  props: IPackageManagerProps
  logicalTree: ILogicalTree | null
  runtime?: IRuntime
  boot: () => Promise<void>
  syncFileSystem: (runtime: IRuntime) => Promise<void>
  getModule: <T>(path: string) => Promise<T>
}
