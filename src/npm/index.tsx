import { PkgData, PkgDirectory, PkgTreeNode } from "../specs";
import crawl from "tree-crawl";
import { path } from "@gratico/fs";

export function treeToFlat(rootNode: PkgTreeNode): string[] {
  const list: string[] = [];
  crawl(
    rootNode,
    (node) => {
      // name is actually path because of the way getChildren is defined
      node.fullName.length > 0 && list.push(node.fullName);
    },
    {
      getChildren: (node) => (node.type === "directory" ? node.files : []),
    }
  );
  return list;
}

export async function fetchDirList(
  packageSlug: string,
  fetch: Window["fetch"]
): Promise<PkgDirectory> {
  const res = await fetch(
    `https://data.jsdelivr.com/v1/package/npm/${packageSlug}/tree`
  );
  const json = await res.json();
  const rootNode: PkgDirectory = {
    type: "directory",
    name: "",
    fullName: "",
    files: json.files,
  };
  crawl<PkgTreeNode>(
    rootNode,
    (node) => {
      // name is actually path because of the way getChildren is defined
      if (node.type === "directory") {
        node.files = node.files.map((el) => ({
          ...el,
          fullName: path.join(node.fullName, el.name),
        }));
      }
    },
    {
      getChildren: (node) => (node.type === "directory" ? node.files : []),
    }
  );
  return rootNode;
}

export async function fetchFile(
  packageSlug: string,
  path: string,
  fetch: Window["fetch"]
) {
  const res = await fetch(
    `https://cdn.jsdelivr.net/npm/${packageSlug}${
      path[0] === "/" ? path : "/" + path
    }`
  );
  const text = await res.text();
  return text;
}

export async function fetchPkgData(
  name: string,
  version: string,
  fetch: Window["fetch"]
): Promise<PkgData> {
  const packageSlug = `${name}@${version}`;
  const dirList = await fetchDirList(packageSlug, fetch);
  const filesList = treeToFlat(dirList);
  const interestingFiles: string[] = filesList.reduce(
    function (prev: string[], next: string) {
      const isTypescript = next.match(/.d.ts$/);
      const isPkgManifest = next.match(/\/package.json$/);
      return [...prev, ...(isTypescript || isPkgManifest ? [next] : [])];
    },
    ["package.json"]
  );
  const tasks = interestingFiles.map(async (path) => {
    const text = fetchFile(packageSlug, path, fetch);
    return text;
  });
  const results = await Promise.all(tasks);
  return {
    name,
    version,
    fileTree: dirList,
    filesList,
    vendorFiles: interestingFiles.reduce(function (state, path, i) {
      const text = results[i];
      return {
        ...state,
        [path]: text,
      };
    }, {}),
  };
}
