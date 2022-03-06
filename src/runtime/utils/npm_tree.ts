import nodePath from '../../utils/path'
import { ILogicalTree as ILogicalTreeImport } from '../../specs/runtime'
// import { PkgManifest, LockFileDescriptor } from "../../specs/npm";
export type ILogicalTree = ILogicalTreeImport
export class LogicalTree implements ILogicalTree {
  name: string
  version: string
  address: any
  optional: boolean
  dev: boolean
  bundled: boolean
  integrity: string
  dependencies: Map<any, any>
  requiredBy: Set<any>
  resolved: any
  constructor(name: string, address: string, opts: any) {
    this.name = name
    this.version = opts.version
    this.address = address || ''
    this.optional = !!opts.optional
    this.dev = !!opts.dev
    this.bundled = !!opts.bundled
    this.resolved = opts.resolved
    this.integrity = opts.integrity
    this.dependencies = new Map()
    this.requiredBy = new Set()
  }

  get isRoot(): boolean {
    return !this.requiredBy.size
  }

  addDep(dep: any) {
    this.dependencies.set(dep.name, dep)
    dep.requiredBy.add(this)
    return this
  }

  delDep(dep: any) {
    this.dependencies.delete(dep.name)
    dep.requiredBy.delete(this)
    return this
  }

  getDep(name: string) {
    return this.dependencies.get(name)
  }

  path(prefix: string) {
    if (this.isRoot) {
      // The address of the root is the prefix itself.
      return prefix || ''
    } else {
      return nodePath.join(prefix || '', 'node_modules', this.address.replace(/:/g, '/node_modules/'))
    }
  }

  // This finds cycles _from_ a given node: if some deeper dep has
  // its own cycle, but that cycle does not refer to this node,
  // it will return false.
  hasCycle(_seen: any, _from: any) {
    if (!_seen) {
      _seen = new Set()
    }
    if (!_from) {
      _from = this
    }
    for (const dep of (this.dependencies as any).values()) {
      if (_seen.has(dep)) {
        continue
      }
      _seen.add(dep)
      if (dep === _from || dep.hasCycle(_seen, _from)) {
        return true
      }
    }
    return false
  }

  forEachAsync(fn: any, opts: any, _pending: any) {
    if (!opts) {
      opts = _pending || {}
    }
    if (!_pending) {
      _pending = new Map()
    }
    const P = opts.Promise || Promise
    if (_pending.has(this)) {
      return P.resolve((this as any).hasCycle() || _pending.get(this))
    }
    const pending = P.resolve().then(() => {
      return fn(this, () => {
        return promiseMap(
          (this.dependencies as any).values(),
          (dep: any) => dep.forEachAsync(fn, opts, _pending),
          opts,
          null,
        )
      })
    })
    _pending.set(this, pending)
    return pending
  }

  forEach(fn: any, _seen: any) {
    if (!_seen) {
      _seen = new Set()
    }
    if (_seen.has(this)) {
      return
    }
    _seen.add(this)
    fn(this, () => {
      for (const dep of (this.dependencies as any).values()) {
        dep.forEach(fn, _seen)
      }
    })
  }
}

export default function lockTree(pkg: any, pkgLock: any, opts: any) {
  const tree = makeNode(pkg.name, null, pkg)
  const allDeps = new Map()
  Array.from(
    new Set(
      Object.keys(pkg.devDependencies || {})
        .concat(Object.keys(pkg.optionalDependencies || {}))
        .concat(Object.keys(pkg.dependencies || {})),
    ),
  ).forEach((name) => {
    let dep = allDeps.get(name)
    if (!dep) {
      const depNode = (pkgLock.dependencies || {})[name]
      dep = makeNode(name, name, depNode)
    }
    addChild(dep, tree, allDeps, pkgLock)
  })
  return tree
}

export function makeNode(name: any, address: any, opts: any) {
  return new LogicalTree(name, address, opts || {})
}

function addChild(dep: any, tree: any, allDeps: any, pkgLock: any) {
  tree.addDep(dep)
  allDeps.set(dep.address, dep)
  const addr = dep.address
  const lockNode = atAddr(pkgLock, addr)
  // dealing with symlinked packages when developing in a monorepo
  if (!lockNode) {
    return []
  }
  ;[...Object.keys(lockNode.requires || {}), ...Object.keys(lockNode.dependencies || {})].forEach((name) => {
    const tdepAddr = reqAddr(pkgLock, name, addr)
    let tdep = allDeps.get(tdepAddr)
    if (!tdep) {
      tdep = makeNode(name, tdepAddr, atAddr(pkgLock, tdepAddr))
      addChild(tdep, dep, allDeps, pkgLock)
    } else {
      dep.addDep(tdep)
    }
  })
}

function reqAddr(pkgLock: any, name: any, fromAddr: any) {
  const lockNode = atAddr(pkgLock, fromAddr)
  const child = (lockNode.dependencies || {})[name]
  if (child) {
    return `${fromAddr}:${name}`
  } else {
    const parts = fromAddr.split(':')
    while (parts.length) {
      parts.pop()
      const joined = parts.join(':')
      const parent = atAddr(pkgLock, joined)
      if (parent) {
        const child = (parent.dependencies || {})[name]
        if (child) {
          return `${joined}${parts.length ? ':' : ''}${name}`
        }
      }
    }
    const err: any = new Error(`${name} not accessible from ${fromAddr}`)
    err.pkgLock = pkgLock
    err.target = name
    err.from = fromAddr
    throw err
  }
}

export function atAddr(pkgLock: any, addr: any) {
  if (!addr.length) {
    return pkgLock
  }
  const parts = addr.split(':')
  return parts.reduce((acc: any, next: any) => {
    return acc && (acc.dependencies || {})[next]
  }, pkgLock)
}

function promiseMap(arr: any, fn: any, opts: any, _index: any) {
  _index = _index || 0
  const P = (opts && opts.Promise) || Promise
  if (P.map) {
    return P.map(arr, fn, opts)
  } else {
    if (!(arr instanceof Array)) {
      arr = Array.from(arr)
    }
    if (_index >= arr.length) {
      return P.resolve()
    } else {
      return P.resolve(fn(arr[_index], _index, arr)).then(() => promiseMap(arr, fn, opts, _index + 1))
    }
  }
}
