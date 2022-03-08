import promisify from 'pify'
import crawl from 'tree-crawl'
import { IFileSystem as IFilesystem } from '@gratico/fs'
import { path as nodePath } from '@gratico/fs'
import npmLogicalTree, { LogicalTree } from '../../npm/logical_tree'
import { ILogicalTree } from '../../specs/index'

// parse package-lock.json or yarn.lock to get `LogicalTree`
export async function getLogicalTree(fs: IFilesystem, packageRoot: string): Promise<LogicalTree> {
  const readFile = fs.readFile.bind(fs)

  const PackageJSONText = (
    (await promisify(readFile)(nodePath.join(packageRoot, 'package.json'))) as unknown as Buffer
  ).toString()
  const PackageJSON = JSON.parse(PackageJSONText)

  const PackageLockText = (
    (await promisify(readFile)(nodePath.join(packageRoot, 'package-lock.json'))) as unknown as Buffer
  ).toString()
  const PackageLockJSON = JSON.parse(PackageLockText)

  const tree = npmLogicalTree(PackageJSON, PackageLockJSON, {})
  return tree
}

export function getAddressList(logicalTree: ILogicalTree): { [addressName: string]: ILogicalTree } {
  const state: { [addressName: string]: ILogicalTree } = {}
  const seenMap: { [address: string]: boolean } = {}
  crawl(
    logicalTree,
    function (node) {
      if (!node.isRoot) {
        state[node.address] = node
      }
    },
    {
      getChildren: (node) => {
        // filter so as to avoid infinite recursion
        const list = Array.from(node.dependencies.values()).filter((el) => !seenMap[el.address])
        list.forEach((pkg) => {
          seenMap[pkg.address] = true
        })
        return list
      },
    },
  )
  return state
}

export function logicalTreeAdressToFSPath(address: string) {
  const localPath = (address.split(':') as string[]).reduce(function (state, item, index) {
    return [...state, ...(index > 0 ? ['node_modules'] : []), item]
  }, [] as string[])
  return localPath.join('/')
}
