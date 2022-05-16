import { PackageManager } from "../index";
import { createTestFilesystem } from "../utils/testing";
import fetch from "fetch-vcr";
import path from "path";
fetch.configure({
  fixturePath: path.join(__dirname, "../../__fixtures__/fetch"),
  mode: "cache",
});

export async function getPM() {
  const fs = await createTestFilesystem();
  const pm = new PackageManager(fs, "/", fetch);
  return pm;
}

describe("Package Manager", () => {
  beforeAll(async () => {});

  test("should be able to import a immer npm module", async () => {
    const pm = await getPM();
    await pm.boot();

    expect(pm.logicalTree).toBeDefined();
    const m = await pm.getModule("immer");

    console.log("immer", m);
    expect(m).toBeDefined();
  }, 150000);
});
