import { isRelative, FileType } from '@gratico/fs'
import { IRuntime, IRuntimeProps, IRuntimeRegistryItem, ILogicalTree, IRuntimeFSItem } from '../specs/runtime'
import { loadModuleText, extractCJSDependencies, evalModule, registerModule, getModuleKey } from './utils/cjs'
import { getLogicalTree } from '../pm/utils/dependency_tree'
import { convertPathToModuleDependency, parseNPMModuleLocation } from '../pm/utils/convertor'
import promisify from 'pify'
//import { initialize } from 'esbuild-wasm'

class Runtime implements IRuntime {
  props: IRuntimeProps
  registry: Map<string, IRuntimeRegistryItem>
  cache: Map<string, unknown>
  defaultExtensions: string[]
  logicalTree: ILogicalTree | null
  extensions: unknown[]
  fileSystemItems: IRuntimeFSItem[]
  manifests: Map<string, Record<string, any>>
  constructor(props: IRuntimeProps) {
    this.props = props
    this.registry = new Map<string, IRuntimeRegistryItem>()
    this.defaultExtensions = ['.js', '.jsx', '.json', '.ts', '.tsx', '.cjs']
    this.cache = new Map<string, unknown>()
    this.logicalTree = null
    this.extensions = []
    this.fileSystemItems = []
    this.manifests = new Map()
  }

  async boot() {
    const files = await this.props.fs.adapter.query({ id: { $regex: this.props.workDir } })
    console.log('files', files)
    this.fileSystemItems = files.map((el) => ({
      path: el.id,
      type: el.type === FileType.FILE ? 'file' : 'directory',
    }))
    const manifestItems = this.fileSystemItems.filter((el) => el.path.match(/\/package.json$/))

    const manifests = await Promise.all(
      manifestItems.map(async (el) => {
        const fileText = await promisify(this.props.fs.readFile)(el.path, 'utf8')
        try {
          const json = JSON.parse(fileText)
          return json
        } catch (e) {
          console.log(el)
          console.error(e)
          return {}
        }
      }),
    )

    manifestItems.forEach((el, i) => {
      this.manifests.set(el.path, manifests[i])
    })
    //    try {
    //      await initialize({
    //        wasmURL: 'https://cdn.jsdelivr.net/npm/esbuild-wasm@0.14.25/esbuild.wasm',
    //      })
    //    } catch (e) {}
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
