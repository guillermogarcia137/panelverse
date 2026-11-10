import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;const files=['/test/sync-browser.html','/src/sync-store.js','/src/sync-model.js','/src/library-sync.js','/src/model.js','/src/account-model.js'];if(!files.includes(path)){res.writeHead(404).end();return;}res.setHeader('Content-Type',path.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(await readFile(new URL('.'+path,root)));}catch{res.writeHead(500).end();}}).listen(4175,'127.0.0.1',()=>console.log('Verificación aislada: http://localhost:4175/test/sync-browser.html'));
