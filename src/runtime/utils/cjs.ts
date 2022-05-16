import { mkdirP, isRelative, path as nodePath } from "@gratico/fs";
import promisify from "pify";
import {
  IRuntime,
  EvaledModuleLoad,
  RegisteredModuleLoad,
  ProcessedModuleLoad,
  LoadedModuleLoad,
  ModuleDependency,
  ILogicalTree,
} from "../../specs/runtime";
import {
  convertPathToModuleDependency,
  parseNPMModuleLocation,
} from "../../pm/utils/convertor";
import { logicalTreeAdressToFSPath } from "../../pm/utils/dependency_tree";
import coreModules from "../node/core/index";

export async function fetchSourceFile(
  runtime: IRuntime,
  path: string,
  fetch: Window["fetch"]
) {
  const host = "cdn.jsdelivr.net";
  const url = `https://${host}${path}`;
  if (runtime.cache.get(path)) {
    const text = await Promise.resolve(runtime.cache.get(path));
    return text;
  } else {
    const promise = (async () => {
      const resp = await fetch(url);
      if (resp.status === 200) {
        return resp.text();
      } else {
        console.log(path);
        throw new Error(resp.status.toString());
      }
    })();
    runtime.cache.set(path, promise);
    return Promise.resolve(promise);
  }
}

const COMMENT_REGEXP =
  /^\s*(?<commentSlashes>(\/\*)|(\/\/))\s*[#@]\s*sourceMappingURL\s*=\s*((data:(?<mime>[^;]+)?(;charset=(?<charset>[^;]+))?;base64,(?<base64Content>[^\s*]+))|(?<url>[^\s*]+))(\s*\*\/)?\s*$/imu;
export const parseTextFileForSourceMaps = function (fileContent: string) {
  const fileContentA = fileContent;

  const parts = COMMENT_REGEXP.exec(fileContentA);

  // Either no source map comment or comment has invalid syntax
  if (
    parts === null ||
    !parts.groups ||
    parts.groups.base64Content ||
    !parts.groups.url
  ) {
    return;
  } else {
    return {
      url: parts.groups.url,
    };
  }
};

// @ts-ignore

// 1) load the textual file
// 1.1) check if path exists on filesystem
// 1.2) if then load that module
// 1.3) if not then try to find that in dependencies and load that
// 2) extract cjs dependecnies from raw text and for each load them
// 3) setup require and module objects using 2) and eval the text code
// 4) set evaled module in registry
// summary registerModule(evaleModule(extractCJSDependencies(loadModuleText(filename))))

export function getFilePath(dep: ModuleDependency, runtime: IRuntime) {
  const parentPath = dep.parent ? dep.parent.resolvedFSPath : "";
  const filePath = dep.resolvedFSPath;
  const { pkg } = dep;
  const ext =
    runtime.defaultExtensions.indexOf(nodePath.extname(dep.resolvedFSPath)) ==
    -1
      ? ".js"
      : "";

  return dep.resolvedFSPath + ext;
}

export function getModuleKey(dep: ModuleDependency, runtime: IRuntime) {
  const { pkg } = dep;
  const filePath = getFilePath(dep, runtime);
  return `${nodePath.join(`${pkg.name}@${pkg.version}`, filePath)}`;
}

export async function preRegisterModule(
  load: ProcessedModuleLoad
): Promise<RegisteredModuleLoad> {
  const { pkg } = load.dep;
  const key = getModuleKey(load.dep, load.runtime);
  load.runtime.registry.set(key, { module: { exports: {} } });
  return load;
}

export async function registerModule(
  load: EvaledModuleLoad
): Promise<RegisteredModuleLoad> {
  const { pkg } = load.dep;
  const key = getModuleKey(load.dep, load.runtime);
  const l = load.runtime.registry.get(key);
  if (!l) throw new Error("no module");
  l.done = true;
  Object.assign(l.module, load.module);
  return load;
}

export async function evalModule(
  load: ProcessedModuleLoad,
  evalFunction: Function,
  runtime: IRuntime
): Promise<EvaledModuleLoad> {
  const logicalTree = load.dep.pkg;
  const depModules: { [key: string]: any } = load.deps.reduce((state, dep) => {
    if (dep.type === "core") {
      return {
        ...state,
        [dep.specifiedPath]: coreModules[dep.specifiedPath],
      };
    }
    const key = nodePath.join(
      `${dep.pkg.name}@${dep.pkg.version}`,
      getFilePath(dep, load.runtime)
    );
    const record = load.runtime.registry.get(key);
    return {
      ...state,
      [dep.specifiedPath]:
        record && record.module ? record.module.exports : null,
    };
  }, {});

  const require = function (dep: string) {
    const m = depModules[dep];
    return m;
  };

  const m = { exports: {} };

  try {
    evalFunction.call(
      globalThis,
      `(function (require, module, exports, coreModules) {
        var {process, Buffer} = coreModules;
        ${load.rawText}
      })`
    )(require, m, m.exports, coreModules);

    return {
      ...load,
      state: "evaled",
      module: m,
    };
  } catch (e) {
    console.error(e);
    throw e;
  }
}

export async function extractCJSDependencies(
  load: LoadedModuleLoad
): Promise<ProcessedModuleLoad> {
  if (load.dep === undefined) {
    console.log(load);
  }
  const { pkg } = load.dep;
  const manifest = load.runtime.cache.get(
    `${pkg.name}@${pkg.version}/package.json`
  );

  // TODO: extract this out
  const deps: string[] = getCJSDeps(load.rawText)
    .map((dep) => {
      if (manifest?.browser && manifest?.browser[dep] !== undefined) {
        return manifest.browser[dep];
      } else {
        return dep;
      }
    })
    .filter((el) => el && el.length >= 0);

  // deps.map(dep => convertPathToModuleDependency(load.runtime, dep, pkg))
  // const parsedPath = parseNPMModuleLocation(path);
  return {
    ...load,
    deps: await Promise.all(
      deps.map(async (dep) => {
        const pathIsRelative = isRelative(dep);
        const tree = pathIsRelative
          ? pkg
          : (function () {
              const depName = parseNPMModuleLocation(dep).name;
              return pkg.dependencies.has(depName)
                ? pkg.dependencies.get(depName)
                : (
                    load.runtime.logicalTree as unknown as ILogicalTree
                  ).dependencies.get(depName);
            })();

        const p = pathIsRelative
          ? "./" + nodePath.join(nodePath.dirname(load.dep.resolvedFSPath), dep)
          : dep;
        const resp = await convertPathToModuleDependency(
          load.runtime,
          p,
          dep,
          pkg as unknown as ILogicalTree,
          load.dep
        );
        return resp;
      })
    ),
  };
}

export function getDirName(runtime: IRuntime, dep: ModuleDependency) {
  return;
}

// fetches and caches file
export async function defaultDependencyFileFetcher(
  runtime: IRuntime,
  dep: ModuleDependency
) {
  const { pkg } = dep;
  const { fs } = runtime.props;
  const filePath = getFilePath(dep, runtime);
  const dirName = nodePath.join(
    runtime.props.workDir,
    "node_modules",
    logicalTreeAdressToFSPath(pkg.address)
  );
  const fullFilePath = nodePath.join(dirName, filePath);
  let rawText: string | undefined;
  try {
    const textFile = await promisify(fs.readFile.bind(fs))(
      fullFilePath,
      "utf8"
    );
    rawText = textFile;
  } catch (e) {}
  if (!rawText) {
    const url = `/npm/${nodePath.join(`${pkg.name}@${pkg.version}`, filePath)}`;
    let textFile = await fetchSourceFile(runtime, url, runtime.props.fetch);

    //    textFile = textFile.replace('process.env.NODE_ENV', JSON.stringify('production'))
    //    try {
    //      const result = await transform(textFile, {
    //        minify: true,
    //      })
    //      textFile = result.code
    //    } catch (e) {}

    // todo: base64 inline sourcemap instead of this or rewrite to proper url
    // todo: https://github.com/ehmicky/get-sourcemaps/issues/3
    try {
      const match = parseTextFileForSourceMaps(textFile);
      if (match && match.url) {
        textFile = textFile.replace(COMMENT_REGEXP, ``);
        textFile =
          textFile +
          "\n" +
          `//# sourceMappingURL=https://cdn.jsdelivr.net/npm/${nodePath.join(
            `${pkg.name}@${pkg.version}`,
            nodePath.join(nodePath.dirname(filePath), match.url)
          )}`;
      }
    } catch (e) {
      console.info("failed to replace sourcemaps url", e, pkg);
    }
    try {
      await mkdirP(fs, nodePath.dirname(fullFilePath));
    } catch (e) {
      console.error("mkdir eee", e);
    }

    try {
      await promisify(fs.writeFile as any)(fullFilePath, textFile);
      runtime.cache.set(url, null);
    } catch (e) {
      //console.error("writefile", e, url);
    }
    rawText = textFile;
  }
  return rawText;
}

export async function loadLocalModulText(
  dep: ModuleDependency,
  runtime: IRuntime
): Promise<LoadedModuleLoad> {
  const { fs, cacheDir } = runtime.props;
  let rawText = "";
  const filePath = nodePath.join(
    runtime.props.workDir,
    getFilePath(dep, runtime)
  );
  rawText = await promisify(fs.readFile)(filePath, "utf8");
  const transpiler = runtime.props.transpilers?.find((el) =>
    filePath.match(el.matcher)
  );
  if (transpiler) {
    rawText = await transpiler.transpile(filePath, rawText);
  }
  return {
    path: filePath,
    state: "evaled",
    dep,
    rawText,
    runtime,
  };
}

export async function loadModuleText(
  dep: ModuleDependency,
  runtime: IRuntime
): Promise<LoadedModuleLoad> {
  const { pkg } = dep;
  if (dep.type === "core") {
    return {
      state: "evaled",
      dep,
      runtime,
      path: dep.specifiedPath,
      rawText: "",
    };
  }
  const { fs, cacheDir } = runtime.props;
  let rawText = "";
  const filePath = getFilePath(dep, runtime);

  const t = await defaultDependencyFileFetcher(runtime, dep);
  if (t) rawText = t;
  return {
    path: filePath,
    state: "evaled",
    dep,
    rawText,
    runtime,
  };
}

const cjsExportsRegEx =
  /(?:^\uFEFF?|[^$_a-zA-Z\xA0-\uFFFF.])(exports\s*(\[['"]|\.)|module(\.exports|\['exports'\]|\["exports"\])\s*(\[['"]|[=,\.]))/;
// RegEx adjusted from https://github.com/jbrantly/yabble/blob/master/lib/yabble.js#L339
const cjsRequireRegEx =
  /(?:^\uFEFF?|[^$_a-zA-Z\xA0-\uFFFF."'])require\s*\(\s*("[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*')\s*\)/g;
const commentRegEx = /(^|[^\\])(\/\*([\s\S]*?)\*\/|([^:]|^)\/\/(.*)$)/gm;

const stringRegEx =
  /("[^"\\\n\r]*(\\.[^"\\\n\r]*)*"|'[^'\\\n\r]*(\\.[^'\\\n\r]*)*')/g;

// used to support leading #!/usr/bin/env in scripts as supported in Node
const hashBangRegEx = /^\#\!.*/;

export function getCJSDeps(source: string) {
  cjsRequireRegEx.lastIndex =
    commentRegEx.lastIndex =
    stringRegEx.lastIndex =
      0;

  const deps = [];

  let match;

  // track string and comment locations for unminified source
  const stringLocations = [],
    commentLocations = [];

  function inLocation(locations: any[], match: { index: any }) {
    for (let i = 0; i < locations.length; i++)
      if (locations[i][0] < match.index && locations[i][1] > match.index)
        return true;
    return false;
  }

  if (source.length / source.split("\n").length < 200) {
    while ((match = stringRegEx.exec(source)))
      stringLocations.push([match.index, match.index + match[0].length]);

    // TODO: track template literals here before comments

    while ((match = commentRegEx.exec(source))) {
      // only track comments not starting in strings
      if (!inLocation(stringLocations, match))
        commentLocations.push([
          match.index + match[1].length,
          match.index + match[0].length - 1,
        ]);
    }
  }

  while ((match = cjsRequireRegEx.exec(source))) {
    // ensure we're not within a string or comment location
    if (
      !inLocation(stringLocations, match) &&
      !inLocation(commentLocations, match)
    ) {
      let dep = match[1].substr(1, match[1].length - 2);
      // skip cases like require('" + file + "')
      if (dep.match(/"|'/)) continue;
      // trailing slash requires are removed as they don't map mains in SystemJS
      if (dep[dep.length - 1] == "/") dep = dep.substr(0, dep.length - 1);
      deps.push(dep);
    }
  }

  return deps;
}

export function extractModuleName(el: string) {
  const scopedModule = el[0] === "@";
  const parts = el.split("/");
  return scopedModule
    ? {
        moduleName: parts.slice(0, 2).join("/"),
        path: parts.slice(2, parts.length),
      }
    : { moduleName: parts[0], path: parts.slice(1, parts.length) };
}
