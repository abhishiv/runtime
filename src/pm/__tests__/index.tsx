import { PackageManager } from '../index'
import { createTestFilesystem } from '../utils/testing'
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

describe('Package Manager', () => {
  beforeAll(async () => {})

  test('should be able to import a immer npm module', async () => {
    const pm = await getPM()
    await pm.boot()

    expect(pm.logicalTree).toBeDefined()
    const m = await pm.getModule('immer')

    console.log('immer', m)
    expect(m).toBeDefined()
  }, 50000)

  test('should be able to import a react npm module', async () => {
    const pm = await getPM()
    await pm.boot()

    expect(pm.logicalTree).toBeDefined()
    const m = await pm.getModule('react')

    console.log('react', m)
    expect(m).toBeDefined()
  }, 50000)

  test('should be able to import a react-dom npm module', async () => {
    const pm = await getPM()
    await pm.boot()

    expect(pm.logicalTree).toBeDefined()
    const m = await pm.getModule('react-dom')
    console.log('react-dom', m)
    expect(m).toBeDefined()
  }, 50000)

  test.skip('should be able to import a typescript module', async () => {
    const pm = await getPM()
    await pm.boot()

    expect(pm.logicalTree).toBeDefined()
    const m = await pm.getModule('typescript')
    expect(m).toBeDefined()
  }, 25000)
})
