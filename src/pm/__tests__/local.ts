import { PackageManager } from "../index";
import { IRuntimeTranspiler } from "../../specs/runtime";
import { createTestFilesystem } from "../utils/testing";
import fetch from "fetch-vcr";
import path from "path";
import ts from "typescript";
import pify from "pify";

fetch.configure({
  fixturePath: path.join(__dirname, "../../__fixtures__/fetch"),
  mode: "cache",
});

const typescriptTranspiler: IRuntimeTranspiler = {
  matcher: /\.[jt]sx?$/,
  transpile: async (path, text) => {
    const transpilerResult = ts.transpileModule(text, {
      //compilerOptions: {},
    });
    return transpilerResult.outputText;
  },
};

export async function getPM() {
  const fs = await createTestFilesystem();
  await pify(fs.writeFile)(
    "/sample.tsx",
    `import React from 'immer';
    export * from 'react'
    export const R = React
    `
  );
  console.log("written file");
  const pm = new PackageManager(fs, "/", fetch, eval, {}, [
    typescriptTranspiler,
  ]);
  return pm;
}

describe("Package Manager", () => {
  beforeAll(async () => {});

  test("should be able to import a local module", async () => {
    const pm = await getPM();
    await pm.boot();

    expect(pm.logicalTree).toBeDefined();
    const m = await pm.getModule("./sample.tsx");
    expect(m).toBeDefined();
  }, 25000);
});
