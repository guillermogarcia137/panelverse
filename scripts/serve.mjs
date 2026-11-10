import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const port=Number(process.env.PORT||4173);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
http.createServer(async(req,res)=>{try{let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name==='/panelverse') {res.writeHead(302,{Location:'/panelverse/'});res.end();return;}if(name.startsWith('/panelverse/'))name=name.slice('/panelverse'.length);const file=path.resolve(root,'.'+name);const rel=path.relative(root,file);if(rel.startsWith('..')||path.isAbsolute(rel)||rel.split(path.sep).some(p=>p.startsWith('.'))||/^(scripts|test|dist)([\\/]|$)/.test(rel)){res.writeHead(403);res.end();return;}const final=(await stat(file)).isDirectory()?path.join(file,'index.html'):file;res.writeHead(200,{'Content-Type':mime[path.extname(final)]||'application/octet-stream','Cache-Control':'no-store'});res.end(await readFile(final));}catch{res.writeHead(404);res.end('No encontrado');}}).listen(port,'127.0.0.1',()=>console.log(`PanelVerse: http://localhost:${port}/panelverse/\nPulsa Ctrl+C para cerrar.`));
