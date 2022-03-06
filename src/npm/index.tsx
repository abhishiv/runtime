import fetch from 'isomorphic-fetch'
import { PkgData } from '../specs'

export async function fetchDirList(packageSlug: string, fetch: Window['fetch']) {
  const res = await fetch(`https://data.jsdelivr.com/v1/package/npm/${packageSlug}/flat`)
  const json = await res.json()
  return json.files.map((file: { name: string }) => file.name)
}

export async function fetchFile(packageSlug: string, path: string, fetch: Window['fetch']) {
  const res = await fetch(`https://cdn.jsdelivr.net/npm/${packageSlug}${path[0] === '/' ? path : '/' + path}`)
  const text = await res.text()
  return text
}

export async function fetchPkgData(name: string, version: string, fetch: Window['fetch']): Promise<PkgData> {
  const packageSlug = `${name}@${version}`
  const dirList = await fetchDirList(packageSlug, fetch)
  const interestingFiles: string[] = dirList.reduce(
    function (prev: string[], next: string) {
      const isTypescript = next.match(/.d.ts$/)
      return [...prev, ...(isTypescript ? [next] : [])]
    },
    ['/package.json'],
  )
  const tasks = interestingFiles.map(async (path) => {
    const text = fetchFile(packageSlug, path, fetch)
    return text
  })
  const results = await Promise.all(tasks)
  return {
    name,
    version,
    filesList: dirList,
    vendorFiles: interestingFiles.reduce(function (state, path, i) {
      const text = results[i]
      return {
        ...state,
        [path]: text,
      }
    }, {}),
  }
}

// unused for now but can be used to fallback on unpkg instead of jsdelivr
export interface UnpkgItem {
  type: string
  path: string
  files: UnpkgItem[]
}
export const transformUnpkgFiles = (dir: UnpkgItem): string[] => {
  const object = dir.files
    ? dir.files.reduce((prev, next) => {
        if (next.type === 'file') {
          return { ...prev, [next.path]: next }
        }

        return { ...prev, ...transformUnpkgFiles(next) }
      }, {})
    : {}
  return Object.keys(object)
}
