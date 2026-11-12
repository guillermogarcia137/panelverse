import {build} from 'esbuild';
import {mkdir,cp,rm,readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),dist=new URL('../dist/',import.meta.url);
await mkdir(new URL('src/vendor/',root),{recursive:true});
// Empaqueta el SDK de cuentas: el resultado es generado y no se debe editar a mano.
await build({entryPoints:[fileURLToPath(new URL('src/account-client-entry.js',root))],outfile:fileURLToPath(new URL('src/vendor/account-client.js',root)),bundle:true,format:'esm',platform:'browser',minify:true,legalComments:'eof'});

await build({entryPoints:[fileURLToPath(new URL('src/reader-codecs-entry.js',root))],outfile:fileURLToPath(new URL('src/vendor/reader-codecs.js',root)),bundle:true,format:'esm',platform:'browser',minify:true,legalComments:'eof'});
await cp(new URL('node_modules/node-unrar-js/esm/js/unrar.wasm',root),new URL('src/vendor/unrar.wasm',root));
await cp(new URL('node_modules/node-unrar-js/LICENSE.md',root),new URL('src/vendor/UNRAR-JS-LICENSE.txt',root));
await cp(new URL('node_modules/@zip.js/zip.js/LICENSE',root),new URL('src/vendor/ZIP-JS-LICENSE.txt',root));

// Recorre los módulos en orden estable para calcular la versión a partir de su contenido.
async function files(path,prefix=''){
  const entries=await readdir(path,{withFileTypes:true});let result=[];
  for(const entry of entries)result.push(...(entry.isDirectory()?await files(new URL(entry.name+'/',path),prefix+entry.name+'/'):[prefix+entry.name]));
  return result.sort();
}
// La huella de contenido cambia al modificar los recursos; permite renovar la caché de todos los módulos juntos.
const sources=await files(new URL('src/',root),'src/'),hash=createHash('sha256');
for(const name of ['index.html','sw.js',...sources])hash.update(name).update('\0').update(await readFile(new URL(name,root)));
const version=hash.digest('hex').slice(0,12);
await rm(dist,{recursive:true,force:true});await mkdir(dist,{recursive:true});
for(const name of ['index.html','src','assets','manifest.webmanifest','sw.js','.nojekyll'])await cp(new URL(name,root),new URL(name,dist),{recursive:true});
// A single content version covers the whole module graph, not just the HTML entry.
// Añadimos la misma versión a las importaciones relativas para que un despliegue no mezcle módulos viejos y nuevos.
for(const name of sources.filter(name=>name.endsWith('.js'))){
  const path=new URL(name,dist),source=await readFile(path,'utf8');
  await writeFile(path,source.replace(/((?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"])(\.{1,2}\/[^'"\s?#]+\.js)(['"])/g,`$1$2?v=${version}$3`));
}
const index=new URL('index.html',dist),html=await readFile(index,'utf8');
await writeFile(index,html.replace(/((?:src|href)=["'])(\.\/[^"'\s?#]+\.(?:js|css))(["'])/g,`$1$2?v=${version}$3`));
const worker=new URL('sw.js',dist),sw=await readFile(worker,'utf8');
await writeFile(worker,sw.replace(/const CACHE='([^']+)';/,`const CACHE='$1-${version}';`).replace(/(['"])(\.\/[^'"\s?#]+\.(?:js|css))\1/g,`$1$2?v=${version}$1`));
console.log(`Build listo en dist/ con cuentas, sincronización y recursos versionados (${version}).`);
