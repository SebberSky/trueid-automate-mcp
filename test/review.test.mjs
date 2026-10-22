import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import {equivalentContracts,exactDuplicateMap,reviewTools,reviewSummary} from "../src/review.mjs";
const catalog=JSON.parse(await readFile(new URL("../data/catalog.json",import.meta.url),"utf8"));
const review=JSON.parse(await readFile(new URL("../data/capability-review.json",import.meta.url),"utf8"));
const a={system:"Engine A",name:"readwrite"},b={system:"Engine B",name:"clipboard"};
const ka="Engine A:readwrite",kb="Engine B:clipboard";
const contract=()=>({functions:["read.text","write.text"],targets:["native.clipboard"],inputs:["device","optional text"],outputs:["text"],support:["android","ios"]});
function fixture(left=contract(),right=contract()){
 return {profiles:{[ka]:{contract:left},[kb]:{contract:right}},groups:[],exactGroups:[{verdict:"exact",reviewed:true,members:[ka,kb],representative:ka,evidence:["https://example.com/a","https://example.com/b"],verifiedDimensions:["functions","targets","inputs","outputs","support"]}]};
}
test("all 149 original tools have individual functions, reasoning and evidence",()=>{
 assert.equal(catalog.tools.length,149);assert.equal(Object.keys(review.profiles).length,149);
 for(const t of catalog.tools){const p=review.profiles[t.system+":"+t.name];assert.ok(p);assert.ok(p.functions.length);assert.ok(p.reason);assert.ok(p.evidence.includes(t.source));}
 for(const g of review.groups)for(const member of g.members)assert.ok(review.profiles[member.key]);
});
test("different names or engines alone do not prevent confirmed semantic deduplication",()=>{
 const r=fixture();assert.equal(equivalentContracts(r.profiles[ka].contract,r.profiles[kb].contract),true);
 assert.deepEqual(reviewTools([a,b],r).map(t=>t.name),["readwrite"]);
 assert.deepEqual([...exactDuplicateMap([a,b],r)],[[kb,ka]]);
 assert.equal(reviewTools([a,b],r,"all").length,2);
 assert.equal(reviewTools([a,b],r,"exact").length,1);
});
test("a strict subset must survive even if a group was mistakenly marked exact",()=>{
 const right=contract();right.functions=["read.text"];
 assert.equal(reviewTools([a,b],fixture(contract(),right)).length,2);
});
for(const [dimension,value] of [["targets",["web.clipboard"]],["inputs",["coordinate"]],["outputs",["saved file"]],["support",["android"]]]){
 test("a different "+dimension+" dimension is preserved",()=>{
  const right=contract();right[dimension]=value;
  assert.equal(reviewTools([a,b],fixture(contract(),right)).length,2);
 });
}
test("unreviewed, unproven and incomplete equivalence groups never hide tools",()=>{
 for(const mutate of [
  r=>r.exactGroups[0].reviewed=false,
  r=>r.exactGroups[0].evidence=[],
  r=>r.exactGroups[0].verifiedDimensions=["functions"],
  r=>r.exactGroups[0].representative="missing:tool",
  r=>delete r.profiles[kb].contract.inputs
 ]){const r=fixture();mutate(r);assert.equal(reviewTools([a,b],r).length,2);}
});
test("reordering semantic feature lists does not change equivalence",()=>{
 const right=contract();right.functions.reverse();right.support.reverse();
 assert.equal(reviewTools([a,b],fixture(contract(),right)).length,1);
});
test("current conservative result retains 149 tools with no invented exact matches",()=>{
 assert.deepEqual(reviewSummary(catalog.tools,review),{total:149,retained:149,removed:0,partial:126,uncertain:5,distinct:18,groups:32});
 assert.equal(reviewTools(catalog.tools,review,"kept").length,149);
 assert.equal(reviewTools(catalog.tools,review,"exact").length,0);
});
test("orientation and screenshot distinctions remain present after filtering",()=>{
 const retained=new Set(reviewTools(catalog.tools,review).map(t=>t.name));
 for(const name of ["appium_orientation","mobile_get_orientation","mobile_set_orientation","mobile_take_screenshot","mobile_save_screenshot"])assert.ok(retained.has(name));
 assert.notDeepEqual(review.profiles["Appium:appium_orientation"].functions,review.profiles["Mobile MCP:mobile_get_orientation"].functions);
 assert.equal(review.profiles["Mobile MCP:mobile_clipboard"].status,"uncertain");
});
test("built standalone page embeds the reviewed data and valid scripts",async()=>{
 const html=await readFile(new URL("../dist/index.html",import.meta.url),"utf8");
 assert.ok(!html.includes("__CATALOG_JSON__"));assert.ok(!html.includes("__REVIEW_LOGIC__"));
 const scripts=[...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
 const embedded=JSON.parse(scripts.find(s=>s[1].includes("application/json"))[2]);
 assert.deepEqual(embedded.tools,catalog.tools);assert.deepEqual(embedded.review,review);
 for(const script of scripts.filter(s=>!s[1].includes("application/json")))new vm.Script(script[2]);
 assert.ok(html.includes('id="review-views"'));assert.ok(html.includes('id="comparison-table"'));
 assert.ok(!html.match(/<script[^>]+src=|<link[^>]+rel="stylesheet"/));
});

