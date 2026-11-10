import {build} from 'esbuild';
import {mkdir,cp,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),dist=new URL('../dist/',import.meta.url);
await mkdir(new URL('../src/vendor/',import.meta.url),{recursive:true});
await build({entryPoints:[fileURLToPath(new URL('../src/account-client-entry.js',import.meta.url))],outfile:fileURLToPath(new URL('../src/vendor/account-client.js',import.meta.url)),bundle:true,format:'esm',platform:'browser',minify:true,legalComments:'eof'});
await rm(dist,{recursive:true,force:true});await mkdir(dist,{recursive:true});
for(const name of ['index.html','src','assets','manifest.webmanifest','sw.js','.nojekyll'])await cp(new URL(name,root),new URL(name,dist),{recursive:true});
console.log('Build listo en dist/ con cliente de cuentas local.');
