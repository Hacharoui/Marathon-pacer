const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=__dirname;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png','.md':'text/plain; charset=utf-8'};
function createServer(){return http.createServer((req,res)=>{
  try {
    const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=path.resolve(root,'.'+(name.endsWith('/')?name+'index.html':name));
    if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
    res.setHeader('Cache-Control','no-cache');res.end(fs.readFileSync(file));
  }catch{res.writeHead(404);res.end('Not found');}
});}
if(require.main===module)createServer().listen(8765,'127.0.0.1',()=>console.log('Race Day: http://localhost:8765'));
module.exports={createServer};
