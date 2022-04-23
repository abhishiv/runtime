import {
  IPackageManager,
  IPackageManagerProps,
  IRuntime,
  PkgManifest,
  ILogicalTree,
  IRuntimeTranspiler,
} from "../specs/index";
import { IFileSystem } from "@gratico/fs";

import Runtime from "../runtime/index";
import { getLogicalTree } from "./utils/dependency_tree";
import { populateFileSystem } from "./utils/populate";

type Fetch = Window["fetch"];

export class PackageManager implements IPackageManager {
  props: IPackageManagerProps;
  logicalTree: ILogicalTree | null;
  runtime?: IRuntime;
  moduleRegistry: Map<string, any>;
  constructor(
    fs: IFileSystem,
    workingDirectory: string,
    fetch: Fetch,
    evalFunction?: Function,
    builtins?: {},
    transpilers?: IRuntimeTranspiler[]
  ) {
    this.props = {
      fs,
      fetch: fetch || fetch,
      workingDirectory,
      evalFunction: evalFunction || eval,
      builtins: builtins || {},
      transpilers,
    };
    this.logicalTree = null;
    this.moduleRegistry = new Map();
  }

  async syncFileSystem(runtime: IRuntime) {
    if (!this.logicalTree) throw new Error("boot() before getModule");
    const mainfests: PkgManifest[] = await populateFileSystem(
      {
        ...this.props,
      },
      this.logicalTree
    );

    mainfests.forEach((m) => {
      runtime.cache.set(`${m.name}@${m.version}/package.json`, m);
    });
  }
  async boot() {
    this.logicalTree = await getLogicalTree(
      this.props.fs,
      this.props.workingDirectory
    );
  }
  async getModule(path: string) {
    if (this.runtime) {
      return this.runtime.importModule(path);
    } else {
      //      if (this.moduleRegistry.has(path)) {
      //        return this.moduleRegistry.get(path);
      //      }
      if (!this.logicalTree) throw new Error("boot() before getModule");
      // console.log(Object.keys(mainfests[0]));
      const runtime = new Runtime({
        ...this.props,
        plugins: [],
        workDir: this.props.workingDirectory,
        cacheDir: "/",
        builtins: this.props.builtins,
        transpilers: this.props.transpilers,
      });
      // TODO: fix this
      runtime.logicalTree = this.logicalTree;

      await this.syncFileSystem(runtime);
      this.runtime = runtime;
      await runtime.boot();
      const mod = this.runtime.importModule(path);
      //      this.moduleRegistry.set(path, mod);
      return mod;
    }
  }
}
