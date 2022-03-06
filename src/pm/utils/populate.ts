import { IFileSystem as IFilesystem } from '@gratico/fs'
import { IPackageManagerProps } from '../../specs'
import crawl from 'tree-crawl'
import promisify from 'pify'
import groupBy from 'lodash.groupby'
import { mkdirP, normalizePath } from '@gratico/fs'

import { ILogicalTree } from '../../runtime/utils/npm_tree'
import nodePath from '../../utils/path'
import { fetchPkgData } from '../../npm'
import { getAddressList, logicalTreeAdressToFSPath, getLogicalTree } from './dependency_tree'

export interface IntermediateFileTree {
  content: string
  tree: ILogicalTree
  fullPath: string
  pathList: string[]
}

export async function populateFileSystem(props: IPackageManagerProps, logicalTree: ILogicalTree) {
  const { fs, workingDirectory: workDir } = props
  console.log('workDir', workDir)
  try {
    await promisify(fs.mkdir)(nodePath.join(workDir, 'node_modules'))
  } catch (e) {}
  const packages = await computeMissingPackages({
    fs: props.fs,
    workDir: props.workingDirectory,
    logicalTree,
  })

  console.log('missingPackages', Object.keys(packages).length)
  const downloadPackages = await Promise.all(
    Object.values(packages).map(async (trees) => {
      const tree = trees[0].tree
      const pkgData = await fetchPkgData(tree.name, tree.version, props.fetch)
      // be carefull to store pkgData on all neded locations
      return { pkgData, trees }
    }),
  )
  // storePackage(props, pkgData, treeObject.tree)
  const files = downloadPackages.reduce<{
    [key: string]: IntermediateFileTree
  }>(function (state, { pkgData, trees }) {
    const folderLocations = trees.map((tree) => ({
      tree: tree.tree,
      location: nodePath.join(workDir, 'node_modules', logicalTreeAdressToFSPath(tree.tree.address)),
    }))
    folderLocations.forEach(({ location, tree }) => {
      Object.keys(pkgData.vendorFiles).forEach((filePath) => {
        const fullPath = nodePath.join(location, filePath)
        state[fullPath] = { content: pkgData.vendorFiles[filePath], tree, fullPath, pathList: fullPath.split('/') }
      })
    })
    return state
  }, {})

  await flushFileTree(props, logicalTree, Object.values(files))

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

export type FileList =
  | { pathList: string[]; fileName: string; isFolder: true }
  | { pathList: string[]; isFolder: false; fileName: string; content: string }
export async function flushFileTree(
  props: IPackageManagerProps,
  logicalTree: ILogicalTree,
  fileTree: IntermediateFileTree[],
) {
  const orderedFileList: FileList[] = []
  console.log('fileTree', fileTree)
  crawl<FileList>(
    { pathList: [''], isFolder: true, fileName: '' },
    (node) => {
      orderedFileList.push(node)
    },
    {
      getChildren: (node) => {
        if (!node.isFolder) return []
        const children = fileTree
          .filter((fileNode) => {
            return fileNode.pathList.slice(0, node.pathList.length).join('/') === node.pathList.join('/')
          })
          .reduce(function (state, fileNode) {
            const fileName = fileNode.pathList[node.pathList.length]
            const isFolder = fileNode.pathList.length > node.pathList.length + 1
            return {
              ...state,
              [fileName]: {
                fileName,
                isFolder,
                pathList: [...node.pathList, fileName],
                content: isFolder ? undefined : fileNode.content,
              },
            }
          }, {})
        return Object.values(children)
      },
    },
  )

  const groupedFileList = groupBy(orderedFileList, (node) => node.pathList.slice(0, node.pathList.length - 1).join('/'))

  const listAndGroupedFileList = Object.keys(groupedFileList)
    .sort()
    .map((key) => groupedFileList[key])

  const { workingDirectory: workDir, fs } = props
  console.log(listAndGroupedFileList)
  //  console.log(fs)

  const tasks = listAndGroupedFileList.map((items: FileList[]) => {
    return async () => {
      await Promise.all(
        items.map(async (item) => {
          const path = nodePath.join(item.pathList.join('/'))
          if (item.isFolder) {
            try {
              await mkdirP(fs, path)
            } catch (e) {
              console.error(item.fileName, item.pathList)
            }
          } else {
            await promisify(fs.writeFile)(path, item.content, { encoding: 'utf8' })
          }
        }),
      )
    }
  })
  for await (const task of tasks) {
    await task()
  }
}

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
