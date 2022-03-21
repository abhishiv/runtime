import { IPackageManagerProps, ILogicalTree, PkgData, PkgTreeNode, PkgDirectory, PkgFile } from '../../specs'
import crawl from 'tree-crawl'
import groupBy from 'lodash.groupby'
import { IFileSystem as IFilesystem, path as nodePath, mkdirP, normalizePath } from '@gratico/fs'
import promisify from 'pify'
import { logicalTreeAdressToFSPath } from './dependency_tree'
import path, { basename } from 'path'

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
  const list: IntermediateFileTree[] = []

  for (var key in Object.keys(downloadedPackages)) {
    const item = downloadedPackages[key]
    list.splice(
      list.length,
      0,
      ...item.trees.map((tree) => ({
        tree: tree.tree,
        path: logicalTreeAdressToFSPath(tree.tree.address),
        pkgData: item.pkgData,
      })),
    )
  }

  const jobs: [string, FileList[]][] = []
  list.forEach((item) => {
    const { pkgData, path, tree } = item

    crawl<PkgTreeNode>(
      pkgData.fileTree,
      (node) => {
        const filePath = nodePath.join(props.workingDirectory, 'node_modules', path, node.fullName)
        const pathList = filePath.split('/')
        const baseName = nodePath.dirname(filePath)
        const j: [string, FileList[]] =
          jobs.find((el) => el[0] === baseName) ||
          (function () {
            const entry: [string, FileList[]] = [baseName, []]
            jobs.push(entry)
            return entry
          })()
        if (node.type === 'directory')
          j[1].push({
            pathList,
            fileName: node.name,
            isFolder: true,
          })
        if (node.type === 'file' && (pkgData.vendorFiles[node.fullName] || node.name === 'package.json'))
          j[1].push({
            pathList,
            fileName: node.name,
            isFolder: false,
            content: pkgData.vendorFiles[node.fullName],
          })
      },
      { getChildren: (node) => (node.type === 'directory' ? node.files : []) },
    )
  })

  console.log('jobs', jobs[1])

  const { workingDirectory: workDir, fs } = props
  //  console.log(fs)

  const tasks = []
  for (let entry of jobs) {
    const [baseName, items] = entry
    tasks.push(async () => {
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
    })
  }
  for await (const task of tasks) {
    await task()
  }
}
