import * as path from "path";
import { getLanguageService } from "vscode-html-languageservice";
import {
  GetOptions,
  GetAllTpe,
  Options,
} from "@paulpopat/sote/lib/file-system";
import { CompileApp } from "@paulpopat/sote/lib/compiler/page-builder";
import { IsString } from "@paulpopat/safe-type";
import { URI } from "vscode-uri";

export function UriToPath(stringUri: string) {
  const uri = URI.parse(stringUri);
  if (uri.scheme !== "file") {
    throw new Error("This service must run on the host machine.");
  }

  return uri.fsPath;
}

async function GetComponents(options: Options) {
  if (!options.components) {
    return [];
  }

  return (
    await Promise.all(
      options.components?.map(async (components_dir) =>
        IsString(components_dir)
          ? await GetAllTpe(components_dir)
          : (await GetAllTpe(components_dir.path)).map((c) => ({
              ...c,
              path: "/" + components_dir.prefix + c.path,
            }))
      )
    )
  ).flatMap((f) => f);
}

export async function BuildService(dir: string) {
  const cwd = UriToPath(dir);
  const options = await GetOptions(path.join(cwd, "tpe-config.json"));
  const components = await GetComponents(options);
  const pages = await GetAllTpe(
    options.pages ?? path.join(cwd, "src", "pages")
  );
  const app = await CompileApp(pages, components, false);
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

          return Object.keys(app.components)
            .map((c) => ({
              name: c,
              description: "A custom SOTE component",
              attributes: [],
            }))
            .concat({
              name: "children",
              description:
                "Child HTML will be rendered here. More than one is allowed in one component.",
              attributes: [],
            });
        },
        provideAttributes(tag) {
          if (tag === "script") {
            return [
              {
                name: "src",
                description:
                  "This should be a local machine path. It will get included in the bundle.",
              },
              {
                name: "area",
                description:
                  "Is this script run when the request is made or on the client machine?",
                values: [{ name: "client" }, { name: "server" }],
              },
              {
                name: "method",
                description:
                  "SERVER PAGES ONLY! What method does this script handle",
                values: [
                  { name: "get" },
                  { name: "put" },
                  { name: "patch" },
                  { name: "post" },
                  { name: "delete" },
                ],
              },
            ];
          }

          if (tag === "style") {
            return [
              {
                name: "src",
                description:
                  "This should be a local machine path. It will get included in the bundle.",
              },
              {
                name: "no-hash",
                description:
                  "USE SPARINGLY! Will not hash the CSS. Useful for styling external libraries.",
              },
            ];
          }

          return [];
        },
        provideValues(tag, attribute) {
          if (tag === "script" && attribute === "area") {
            return [{ name: "client" }, { name: "server" }];
          }

          if (tag === "script" && attribute === "method") {
            return [
              { name: "get" },
              { name: "put" },
              { name: "patch" },
              { name: "post" },
              { name: "delete" },
            ];
          }

          return [];
        },
      },
    ],
  });

  return service;
}
