export interface Pkg {
  name: string
  version: string
}
export interface Application {
  id: string
  meta: {
    name: string
    icon: string
  }
}
export interface Configuration {
  id: string
  matchers: [string, number]
}
export interface Syntax {
  id: string
  exports: {
    javascript: string
  }
}
export interface GraticoManifest {
  applications: Array<Application>
  configurations: Array<Configuration>
  syntax: Array<Syntax>
}
export interface PkgManifest {
  name: string
  version: string
  main: string
  browser: string
  module: string
  jspm: any
  map: any
  gratico: GraticoManifest
  typings: string
  dependencies: { [key: string]: string }
  devDependencies: { [key: string]: string }
}

export interface PkgData extends Pkg {
  filesList: Array<string>
  vendorFiles: {
    [key: string]: string
  }
}

export interface PkgMeta extends Pkg {
  fileList: Array<string>
  meta: { gratico: boolean; types: boolean }
  manifest: PkgManifest
}

export interface LockFileDescriptor {
  name: string
  version: string
  requires: {
    [pkgName: string]: string
  }
  dependencies: {
    [pkgName: string]: LockFileDescriptor
  }
}
export interface NodeModulesState {
  manifest: {
    dependencies: {
      [pkgName: string]: string
    }
    devDependencies: {
      [pkgName: string]: string
    }
  }
  dependencyTree: LockFileDescriptor
  packageMeta: Array<PkgMeta>
  packageData: Array<PkgData>
}
export interface RuntimeConfig {
  manifest: PkgManifest
  dependencyTree: any
  packageMeta: Array<PkgMeta>
  packageData: Array<PkgData>
}

export interface IModule {
  __useDefault: boolean
}

export interface ISystem {
  cfg: RuntimeConfig | null
  registry: ISystemRegistry
  normalizeSync(name: string): string
  newModule(): any
  set(name: any, module: IModule): any
  get(name: any): IModule
  import(name: string): Promise<IModule>
  config(config: any): void
}

export interface ISystemRegistry {
  modules: {
    [key: string]: IModule
  }
}

export interface IBrowserModules {
  (k: any): ISystem
}
