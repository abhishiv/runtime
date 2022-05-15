import FileSystem from "@gratico/fs";
import { InMemoryAdapter } from "@gratico/fs";
import { IFileSystem } from "@gratico/fs";
import promisify from "pify";
import nodeFS from "fs";
import { mkdirP, path as nodePath } from "@gratico/fs";

const pkg = require("../../__fixtures__/testrepo/package-lock.json");
const pkgLock = require("../../__fixtures__/testrepo/package-lock.json");

export async function writeTestFiles(fs: IFileSystem) {
  try {
    await promisify(fs.mkdir)("/");
  } catch (e) {}

  // manifests
  await promisify(fs.writeFile)("/package.json", JSON.stringify(pkg, null, 2), {
    encoding: "utf8",
  });
  await promisify(fs.writeFile)(
    "/package-lock.json",
    JSON.stringify(pkgLock, null, 2),
    {
      encoding: "utf8",
    }
  );

  //source files
  try {
    await promisify(fs.mkdir)("/src");
  } catch (e) {}
  try {
    const text = nodeFS
      .readFileSync("../../../../__fixtures__/testrepo/src/index.maker")
      .toString("utf8");
    await promisify(fs.writeFile)("/src/index.maker", text);
  } catch (e) {}
  try {
    const text = nodeFS
      .readFileSync("../../../../__fixtures__/testrepo/src/file.tsx")
      .toString("utf8");
    await promisify(fs.writeFile)("/src/file.tsx", text);
  } catch (e) {} //

  return fs;
}

export async function createTestFilesystem(rootDir: string = "/") {
  const syncAdapter = new InMemoryAdapter();
  const fs = new FileSystem(syncAdapter);
  await mkdirP(fs, rootDir);

  await promisify(fs.writeFile)(
    nodePath.join(rootDir, "package.json"),
    JSON.stringify(pkg, null, 2),
    {
      encoding: "utf8",
    }
  );
  await promisify(fs.writeFile)(
    nodePath.join(rootDir, "package-lock.json"),
    JSON.stringify(pkgLock, null, 2),
    {
      encoding: "utf8",
    }
  );
  return fs;
}
