import * as vscode from "vscode";
import * as path from "path";
import * as chokidar from "chokidar";
import { getLanguageService } from "vscode-html-languageservice";
import {
  GetOptions,
  GetAllTpe,
  Options,
} from "@paulpopat/sote/lib/file-system";
import {
  CompileApp,
  PagesModel,
} from "@paulpopat/sote/lib/compiler/page-builder";
import { Assert, IsObject, IsString } from "@paulpopat/safe-type";

async function BuildApp(options: Options, production: boolean) {
  const components = await GetComponents(options);
  const pages = await GetAllTpe(options.pages ?? "./src/pages");
  const compiled = await CompileApp(pages, components, production);
  return compiled;
}

type ComponentsDir =
  | string
  | {
      path: string;
      prefix: string;
    };

type File = {
  path: string;
  text: string;
};

async function GetComponents(options: Options) {
  if (!options.components) {
    return [];
  }

  return (
    await Promise.all(
      options.components?.map(async (components_dir: ComponentsDir) =>
        IsString(components_dir)
          ? await GetAllTpe(components_dir)
          : (await GetAllTpe(components_dir.path)).map((c: File) => ({
              ...c,
              path: "/" + components_dir.prefix + c.path,
            }))
      )
    )
  ).flatMap((f) => f);
}

function GetCwd() {
  if (
    !vscode.workspace.workspaceFolders ||
    vscode.workspace.workspaceFolders.length === 0
  ) {
    return undefined;
  }

  return vscode.workspace.workspaceFolders[0].uri.fsPath;
}

function Debounce<T extends Function>(cb: T, wait = 20) {
  let h: NodeJS.Timeout;
  let callable = (...args: any) => {
    clearTimeout(h);
    h = setTimeout(() => cb(...args), wait);
  };
  return <T>(<any>callable);
}

export function activate(context: vscode.ExtensionContext) {
  (async () => {
    let running = false;

    const cwd = GetCwd();
    if (!cwd) {
      return;
    }

    const build = async () => {
      const options = await GetOptions(path.join(cwd, "tpe-config.json"));
      return await BuildApp(
        {
          ...options,
          components: options.components?.map((c) => {
            if (typeof c === "string") {
              return path.join(cwd, c);
            }

            return {
              ...c,
              path: path.join(cwd, c.path),
            };
          }),
          pages: options.pages && path.join(cwd, options.pages),
        },
        false
      );
    };

    let app: PagesModel;

    const run = Debounce(async () => {
      try {
        if (running) {
          return;
        }

        running = true;
        app = await build();
        running = false;
      } catch (e) {
        console.error(e);
      }
    });

    chokidar
      .watch([path.join(cwd, "**/*.tpe"), path.join(cwd, "tpe-config.json")], {
        ignored: ["node_modules/**/*", ".git/**/*", ".sote/**/*"],
      })
      .on("all", run);

    const service = getLanguageService({
      customDataProviders: [
        {
          getId() {
            return "tpe";
          },
          isApplicable(languageId) {
            return languageId === "tpe";
          },
          provideTags() {
            if (!app) {
              return [];
            }

            return Object.keys(app.components).map((c) => ({
              name: c,
              description: "A custom SOTE component",
              attributes: [],
            }));
          },
          provideAttributes(tag) {
            return [];
          },
          provideValues(tag, attribute) {
            return [];
          },
        },
      ],
    });

    context.subscriptions.push(
      vscode.languages.registerHoverProvider("tpe", {
        provideHover(document, position, token) {
          const result = service.doHover(
            document as any,
            position,
            service.parseHTMLDocument(document as any)
          );
          return {
            range: result?.range as vscode.Range,
            contents: [
              (() => {
                if (!result?.contents) {
                  return "";
                }
                Assert(
                  IsObject({ kind: IsString, value: IsString }),
                  result?.contents
                );
                return new vscode.MarkdownString(
                  result.contents.value,
                  true
                ) as vscode.MarkdownString;
              })(),
            ],
          };
        },
      })
    );

    context.subscriptions.push(
      vscode.languages.registerCompletionItemProvider(
        "tpe",
        {
          provideCompletionItems(document, position, token) {
            return service.doComplete(
              document as any,
              position,
              service.parseHTMLDocument(document as any)
            ) as any;
          },
        },
        "<"
      )
    );
  })();
}
