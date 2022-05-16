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
  test("should be able to import chakra module", async () => {
    const pm = await getPM();
    await pm.boot();

    expect(pm.logicalTree).toBeDefined();
    //const react = await pm.getModule("react");
    //await pm.getModule("@chakra-ui/utils");
    //await pm.getModule("@chakra-ui/system");

    const m = await pm.getModule("@chakra-ui/react");
    console.log(m);
    expect(m).toBeDefined();
  }, 250000);
});
