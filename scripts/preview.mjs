import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const htmlPath=new URL("../dist/index.html",import.meta.url);
const port=Number(process.env.PORT||4173);
const server=createServer(async(req,res)=>{
 if(req.url!=="/"&&req.url!=="/index.html"){res.writeHead(404);res.end();return;}
 try{res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});res.end(await readFile(htmlPath));}
 catch{res.writeHead(500);res.end("Run npm run build first.");}
});
server.listen(port,"127.0.0.1",()=>console.log("http://127.0.0.1:"+server.address().port));
for(const signal of ["SIGINT","SIGTERM"])process.on(signal,()=>server.close());

