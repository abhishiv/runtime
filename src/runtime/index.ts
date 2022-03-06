import { isRelative } from '../npm/node-module-resolution/index'
import { IRuntime, IRuntimeProps, IRuntimeRegistryItem, ILogicalTree } from '../specs/runtime'
import { loadModuleText, extractCJSDependencies, evalModule, registerModule, getModuleKey } from './utils/cjs'
import { getLogicalTree } from '../pm/utils/dependency_tree'
import { convertPathToModuleDependency, parseNPMModuleLocation } from '../pm/utils/convertor'

class Runtime implements IRuntime {
  props: IRuntimeProps
  registry: Map<string, IRuntimeRegistryItem>
  cache: Map<string, unknown>
  defaultExtensions: string[]
  logicalTree: ILogicalTree | null
  extensions: unknown[]

  constructor(props: IRuntimeProps) {
    this.props = props
    this.registry = new Map<string, IRuntimeRegistryItem>()
    this.defaultExtensions = ['.js', '.jsx', '.json', '.ts', '.tsx']
    this.cache = new Map<string, unknown>()
    this.logicalTree = null
    this.extensions = []
  }

  async boot() {
    return
  }

  async getModule() {
    return
  }

  async importModule(path: string, lTree?: ILogicalTree | null): Promise<unknown> {
    const logicalTree = lTree || (await getLogicalTree(this.props.fs, this.props.workDir))
    const moduleDependency = await convertPathToModuleDependency(this, path, path, logicalTree, undefined)

    if (!moduleDependency) return null
    const pkgKey = getModuleKey(moduleDependency, this)

    if (this.registry.has(pkgKey)) {
      const m = this.registry.get(pkgKey)
      return m?.module ? m.module.exports : null
    }

    const loadedLoad = await loadModuleText(moduleDependency, this)
    const processedLoad = await extractCJSDependencies(loadedLoad)

    const dependencies = processedLoad.deps
    const promises = dependencies.map(async (dependencyModule) => {
      const dep = dependencyModule.specifiedPath
      const pathIsRelative = isRelative(dep)
      const parsed = parseNPMModuleLocation(dep)
      const logicalTree = moduleDependency.pkg
      let tree = pathIsRelative ? logicalTree : logicalTree.dependencies.get(parsed.name)
      if (tree === undefined) {
        tree = (await getLogicalTree(this.props.fs, this.props.workDir)).dependencies.get(parsed.name)
      }
      const depModule = await this.importModule(dependencyModule.resolvedFSPath, tree)
      return depModule
    })
    await Promise.all(promises)

    const evaledLoad = await evalModule(processedLoad, this.props.evalFunction)
    const registeredLoad = await registerModule(evaledLoad)
    return registeredLoad ? (registeredLoad as any).module.exports : null
  }
}

export default Runtime
