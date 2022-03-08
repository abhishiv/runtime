import { IPackageManagerProps, ILogicalTree, PkgData, PkgTreeNode, PkgDirectory, PkgFile } from '../../specs'
import crawl from 'tree-crawl'
import groupBy from 'lodash.groupby'
import { IFileSystem as IFilesystem, path as nodePath, mkdirP, normalizePath } from '@gratico/fs'
import promisify from 'pify'
import { logicalTreeAdressToFSPath } from './dependency_tree'
import path from 'path'

export interface IntermediateFileTree {
  tree: ILogicalTree
  path: string
  pkgData: PkgData
}

export type FileList =
  | { pathList: string[]; fileName: string; isFolder: true }
  | { pathList: string[]; isFolder: false; fileName: string; content: string }
export async function flushFileTree(
  props: IPackageManagerProps,
  logicalTree: ILogicalTree,
  downloadedPackages: {
    pkgData: PkgData
    trees: { id: string; tree: ILogicalTree }[]
  }[],
) {
  const list = downloadedPackages.reduce<IntermediateFileTree[]>(function (state, item) {
    return [
      ...state,
      ...item.trees.map((tree) => ({
        tree: tree.tree,
        path: logicalTreeAdressToFSPath(tree.tree.address),
        pkgData: item.pkgData,
      })),
    ]
  }, [])

  const jobs: FileList[] = []
  console.log('computing', list)

  list.forEach((item) => {
    const { pkgData, path, tree } = item

    crawl<PkgTreeNode>(
      pkgData.fileTree,
      (node) => {
        const filePath = nodePath.join(props.workingDirectory, 'node_modules', path, node.fullName)
        const pathList = filePath.split('/')
        if (node.type === 'directory')
          jobs.push({
            pathList,
            fileName: node.name,
            isFolder: true,
          })
        if (node.type === 'file' && (pkgData.vendorFiles[node.fullName] || node.name === 'package.json'))
          jobs.push({
            pathList,
            fileName: node.name,
            isFolder: false,
            content: pkgData.vendorFiles[node.fullName],
          })
      },
      { getChildren: (node) => (node.type === 'directory' ? node.files : []) },
    )
  })

  console.log('jobs', jobs)

  const orderedFileList = jobs
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
