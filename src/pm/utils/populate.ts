import { IFileSystem as IFilesystem, path as nodePath } from '@gratico/fs'
import promisify from 'pify'
import { mkdirP, normalizePath } from '@gratico/fs'

import { IPackageManagerProps, ILogicalTree, PkgData } from '../../specs'
// import { fetchPkgData } from '../../npm'
import { getAddressList, logicalTreeAdressToFSPath, getLogicalTree } from './dependency_tree'
import { flushFileTree } from './file_system'

export async function fetchPkgData(name: string, version: string, fetch: Window['fetch']): Promise<PkgData> {
  const req = await fetch(`https://esm.www.grati.co/_static/turbo/${name}@${version}`)
  const pkgData = await req.json()
  return pkgData
}
export async function populateFileSystem(props: IPackageManagerProps, logicalTree: ILogicalTree) {
  const { fs, workingDirectory: workDir } = props
  try {
    await promisify(fs.mkdir)(nodePath.join(workDir, 'node_modules'))
  } catch (e) {}
  const packages = await computeMissingPackages({
    fs: props.fs,
    workDir: props.workingDirectory,
    logicalTree,
  })

  console.info('missingPackages', Object.keys(packages).length)
  const downloadPackages = await Promise.all(
    Object.values(packages).map(async (trees) => {
      const tree = trees[0].tree
      const pkgData = await fetchPkgData(tree.name, tree.version, props.fetch)
      // be carefull to store pkgData on all neded locations
      return { pkgData, trees }
    }),
  )
  console.info('flushFileTree')
  console.time('flushFileTree')
  await flushFileTree(props, logicalTree, downloadPackages)
  console.timeEnd('flushFileTree')
  const logicalTree2 = await getLogicalTree(props.fs, props.workingDirectory)
  const pkgsDict = getAddressList(logicalTree2)
  const tasks = Object.values(pkgsDict)
    .filter((el) => el.version)
    .map(async (pkg) => {
      const filePath = nodePath.join(
        props.workingDirectory,
        'node_modules',
        logicalTreeAdressToFSPath(pkg.address),
        'package.json',
      )
      const manifestText = await promisify(fs.readFile)(filePath)
      return JSON.parse(manifestText)
    })
  const manifests = await Promise.all(tasks)

  return manifests
}

// since one package can be on multiple locations in fs theoratically
export async function computeMissingPackages({
  logicalTree,
  fs,
  workDir,
}: {
  logicalTree: ILogicalTree
  fs: IFilesystem
  workDir: string
}) {
  const addressList = getAddressList(logicalTree)
  const packagesList = Object.keys(addressList)
    .filter((el) => !addressList[el].isRoot)
    .map((address) => ({
      id: nodePath.join(workDir, 'node_modules', logicalTreeAdressToFSPath(address)),
      value: addressList[address],
    }))
  const packageFiles = (
    (await fs.adapter.query({
      name: 'package.json',
    })) as { parentPath: string }[]
  ).filter((el) => {
    return el.parentPath && el.parentPath.match(new RegExp(workDir))
  })
  const missingPackages = packagesList.filter(({ value: pkg }) => {
    const folderPath = normalizePath(nodePath.join(workDir, 'node_modules', logicalTreeAdressToFSPath(pkg.address)))
    return packageFiles.findIndex((el) => el.parentPath === folderPath) === -1
  })
  const packages = [...new Set(missingPackages)]
  return packages.reduce<{
    [key: string]: { id: string; tree: ILogicalTree }[]
  }>((state, { value, id }) => {
    if (!value.version || !value.name) return state
    const key = value.name + '@' + value.version
    return {
      ...state,
      [key]: [...(state[key] || []), { id, tree: value }],
    }
  }, {})
}
