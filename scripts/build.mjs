import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const template=await readFile(path.join(root,"src/index.html"),"utf8");
const catalog=JSON.parse(await readFile(path.join(root,"data/catalog.json"),"utf8"));
const review=JSON.parse(await readFile(path.join(root,"data/capability-review.json"),"utf8"));
const logic=await readFile(path.join(root,"src/review.mjs"),"utf8");
const json=JSON.stringify({...catalog,review}).replace(/</g,"\\u003c");
if (!template.includes("__CATALOG_JSON__") || !template.includes("__REVIEW_LOGIC__")) throw Error("Missing build markers");
const html=template.replace("__CATALOG_JSON__",()=>json).replace("__REVIEW_LOGIC__",()=>logic.replace(/^export /gm,"")).trimEnd()+"\n";
await mkdir(path.join(root,"dist"),{recursive:true});
await writeFile(path.join(root,"dist/index.html"),html);
console.log("Built standalone HTML: "+catalog.tools.length+" tools / "+review.groups.length+" comparison groups");

