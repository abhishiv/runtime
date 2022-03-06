import { PackageManager } from '../index'
import { computeMissingPackages, populateFileSystem } from '../utils/populate'
import { createTestFilesystem } from '../utils/testing'
import { promisify } from 'util'
import fetch from 'fetch-vcr'

import path from 'path'
fetch.configure({
  fixturePath: path.join(__dirname, '../../__fixtures__/fetch'),
  mode: 'cache',
})

export async function getPM() {
  const fs = await createTestFilesystem()
  const pm = new PackageManager(fs, '/', fetch)
  return pm
}

describe('Package Manager Populate', () => {
  test('computeMissingPackages', async () => {
    const pm = await getPM()
    await pm.boot()
    expect(pm.logicalTree).toBeDefined()
    if (!pm.logicalTree) throw new Error('logicalTree undefined')
    const list = await computeMissingPackages({
      fs: pm.props.fs,
      workDir: pm.props.workingDirectory,
      logicalTree: pm.logicalTree,
    })

    expect(Object.keys(list).length).toBeGreaterThan(1)
  }, 5000)

  test('populateFileSystem', async () => {
    const pm = await getPM()
    await pm.boot()

    expect(pm.logicalTree).toBeDefined()
    if (!pm.logicalTree) throw new Error('logicalTree undefined')
    await populateFileSystem(pm.props, pm.logicalTree)

    const pkgs = (await promisify(pm.props.fs.readdir)('/node_modules')) as string[]
    expect(pkgs.length).toBeGreaterThan(0)
  }, 45000)
})
