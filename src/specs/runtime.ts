import { IFileSystem, IAdapterRecord, FileType } from "@gratico/fs";
import { IPatch } from "@gratico/atom";
export interface IRuntimeTranspiler {
  include?: string[];
  exclude?: string[];
  matcher: RegExp;
  transpile: (path: string, text: string) => Promise<string>;
}

export interface IRuntimeProps {
  plugins: IRuntimePlugin[];
  fs: IFileSystem;
  workDir: string;
  cacheDir: string;
  fetch: Fetch;
  evalFunction: Function;
  builtins: {
    [key: string]: any;
  };
  transpilers?: IRuntimeTranspiler[];
}

export interface ILogicalTree {
  dependencies: Map<string, ILogicalTree>;
  name: string;
  version: string;
  isRoot: boolean;
  address: string;
}

type Fetch = Window["fetch"];

export interface NPMLockFileDependency {
  version: string;
  dependencies?: {
    [key: string]: NPMLockFileDependency;
  };
  b?: IPatch;
}

export interface NPMPackageManifest {
  dependencies: {
    [name: string]: string;
  };
  devDependencies: {
    [name: string]: string;
  };
}

export interface ModuleDependency {
  parent?: ModuleDependency;
  specifiedPath: string;
  resolvedFSPath: string;
  modulePath: string;
  type: "source" | "npm" | "core";
  meta?: any;
  pkg: ILogicalTree;
}

export interface LoadedModuleLoad {
  path: string;
  dep: ModuleDependency;
  state: "loaded" | "processed" | "evaled" | "registered";
  rawText: string;
  runtime: IRuntime;
}

export interface ProcessedModuleLoad extends LoadedModuleLoad {
  deps: ModuleDependency[];
}

export interface EvaledModuleLoad extends ProcessedModuleLoad {
  module: any;
}

export type RegisteredModuleLoad = ProcessedModuleLoad;

export type ModuleLoad =
  | LoadedModuleLoad
  | ProcessedModuleLoad
  | EvaledModuleLoad
  | RegisteredModuleLoad;

export interface IRuntimeRegistryItem {
  meta?: any;
  module: any;
}

export interface IRuntimeFSItem {
  path: string;
  type: "directory" | "file";
}
export interface IRuntime {
  props: IRuntimeProps;
  registry: Map<string, IRuntimeRegistryItem>;
  cache: Map<string, any>;
  defaultExtensions: string[];
  logicalTree: ILogicalTree | null;
  fileSystemItems: IRuntimeFSItem[];
  manifests: Map<string, Record<string, any>>;
  importModule: {
    (path: string, lTree?: ILogicalTree | null): Promise<any>;
  };
  getModule: {
    (path: string): Promise<any>;
  };
  boot: {
    (): Promise<any>;
  };
}

export enum IRuntimePluginType {
  DependencyFileFetcher = "DependencyFileFetcher",
  DependencyEvaluator = "DependencyEvaluator",
}

export interface IRuntimePlugin {
  type:
    | IRuntimePluginType.DependencyFileFetcher
    | IRuntimePluginType.DependencyEvaluator;
  matchers: string[];
  actor: {
    (props: IRuntimeProps, load: ModuleLoad): Promise<any>;
  };
}
