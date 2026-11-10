import {mkdir,cp,rm} from 'node:fs/promises';
const root=new URL('../',import.meta.url),dist=new URL('../dist/',import.meta.url);
await rm(dist,{recursive:true,force:true});await mkdir(dist,{recursive:true});
for(const name of ['index.html','src','assets','manifest.webmanifest','sw.js','.nojekyll'])await cp(new URL(name,root),new URL(name,dist),{recursive:true});
console.log('Build listo en dist/ (rutas relativas compatibles con /panelverse/).');
