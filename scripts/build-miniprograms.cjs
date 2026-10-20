// 双端小程序构建：apps/miniprogram（共用源码）→ apps/miniprogram-wechat、apps/miniprogram-xhs。
// 小红书：.wxml → .xhsml、.wxss → .css、wx: → xhs:、SDK 换成 xhs、CSS 变量替换为常量、全局组件写入每个页面。
// 构建后清理上一版残留文件，并校验页面四件套、组件引用、底栏图标与 JSON，缺失时直接失败。
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname,'..');
const source = path.join(root,'apps','miniprogram');
const args = process.argv.slice(2);
// Fail before touching either generated project, including misspelled options.
const seen = new Set();
for (let index=0; index<args.length; index++) {
  const key=args[index];
  if (!['--target','--env','--check'].includes(key) || seen.has(key)) throw new Error('构建参数未知或重复；使用 --target all|wechat|xhs、--env develop|trial|release，可加 --check 仅检查配置。');
  seen.add(key);
  if (key !== '--check' && (!args[++index] || args[index].startsWith('--'))) throw new Error(`${key} 缺少参数值。`);
}
function option(key,fallback) {const index=args.indexOf(key);return index<0 ? fallback : args[index+1];}
const target = option('--target','all');
const environment = option('--env','develop');
if(!['all','wechat','xhs'].includes(target) || !['develop','trial','release'].includes(environment)) throw new Error('使用 --target all|wechat|xhs 与 --env develop|trial|release。');
function baseUrl(value, name) {
  // These values are shipped in the client. Never echo an invalid value: it may contain credentials.
  let url;
  try {
    if (!value || value !== value.trim() || /[\s\\]/.test(value) || !/^https?:\/\/[^/?#]/i.test(value)) throw new Error();
    url = new URL(value);
  } catch { throw new Error(`${name} 必须是完整的 HTTP/HTTPS 地址；体验/正式构建必须配置 HTTPS。`); }
  if (!url.hostname || url.username || url.password || value.includes('?') || value.includes('#')) throw new Error(`${name} 不允许账号密码、查询参数或片段，请填写服务基础地址。`);
  if (environment !== 'develop' && url.protocol !== 'https:') throw new Error(`${name} 在体验/正式构建中必须为 HTTPS。`);
  if (environment !== 'develop' && (/^(localhost|.+\.localhost|127(?:\.\d+){3}|0\.0\.0\.0|\[::1\]|\[::\])$/i.test(url.hostname))) throw new Error(`${name} 不能是本机或通配地址，请配置手机可访问的 HTTPS 域名。`);
  if (name === 'MINIAPP_WEBSITE_BASE' && url.pathname.replace(/\/+$/,'') !== '') throw new Error('MINIAPP_WEBSITE_BASE 必须是网站根地址，不能包含页面路径。');
  return url.href.replace(/\/+$/,'');
}
const apiBase = baseUrl(process.env.MINIAPP_API_BASE || (environment === 'develop' ? 'http://127.0.0.1:8010/api/v1' : ''), 'MINIAPP_API_BASE');
const websiteBase = baseUrl(process.env.MINIAPP_WEBSITE_BASE || (environment === 'develop' ? 'http://localhost:3010' : ''), 'MINIAPP_WEBSITE_BASE');
// Check every selected platform before touching either generated project.
const platforms = target === 'all' ? ['wechat','xhs'] : [target];
const appIds = Object.fromEntries(platforms.map(platform => {
  let previous = {};
  try { previous = JSON.parse(fs.readFileSync(path.join(root,'apps',`miniprogram-${platform}`,'project.config.json'),'utf8')); } catch {}
  const appid = process.env[platform === 'wechat' ? 'MINIAPP_WECHAT_APP_ID' : 'MINIAPP_XHS_APP_ID'] || previous.appid || (platform === 'wechat' ? 'touristappid' : '');
  if(typeof appid !== 'string' || /\s/.test(appid) || environment !== 'develop' && (!appid || appid === 'touristappid')) throw new Error(`${platform} 体验/正式构建需要真实 AppID（不能包含空格）；请配置对应的 MINIAPP_WECHAT_APP_ID 或 MINIAPP_XHS_APP_ID。`);
  return [platform,appid];
}));
if (args.includes('--check')) {
  console.log(JSON.stringify({status:'passed',environment,platforms,apiBase,websiteBase,scope:'本地配置检查；未验证 AppID 归属、合法域名、网络连通或原生编译。'},null,2));
  process.exit(0);
}
const sourceApp = JSON.parse(fs.readFileSync(path.join(source,'app.json'),'utf8'));
const BINARY = new Set(['.png','.jpg','.jpeg','.gif','.webp','.svg']);
const SKIP = new Set(['README.md','project.config.json','project.private.config.json']);
// 开发者工具会写入这些文件，重新构建时保留。
const KEEP = new Set(['project.config.json','project.private.config.json']);
function list(folder) {return fs.readdirSync(folder,{withFileTypes:true}).flatMap(entry=>entry.isDirectory() ? list(path.join(folder,entry.name)) : [path.join(folder,entry.name)]);}
const posix = value => value.split(path.sep).join('/');

/** 读取 app.wxss 中 page{} 的 --sv-* 定义，供小红书构建内联（UI 规范 §9.3：平台不支持变量时由构建替换为常量）。 */
function cssVariables(text) {
  const vars = {};
  for (const block of text.matchAll(/(?<![\w.-])page\s*\{([^}]*)\}/g)) for (const decl of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);?/g)) vars[decl[1]] = decl[2].trim();
  return vars;
}
function inlineVariables(text, vars) {
  const resolve = value => value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/g, (match, name, fallback) => {
    if (vars[name] !== undefined) return resolve(vars[name]);
    if (fallback !== undefined) return resolve(fallback.trim());
    throw new Error(`CSS 变量 ${name} 未在 app.wxss 的 page{} 中定义`);
  });
  // 去掉变量声明本身，再替换所有引用。
  return resolve(text.replace(/(?<![\w.-])(page\s*\{)([^}]*)\}/g, (match, open, body) => open + body.replace(/\s*--[\w-]+\s*:[^;}]+;?/g, '') + '}'));
}
const variables = cssVariables(fs.readFileSync(path.join(source,'app.wxss'),'utf8'));

/** 校验生成目录：页面四件套、组件（含嵌套组件）、底栏图标、JSON 合法。返回问题列表。 */
function verify(output, platform) {
  const problems = [];
  const template = platform === 'xhs' ? '.xhsml' : '.wxml';
  const style = platform === 'xhs' ? '.css' : '.wxss';
  const readJson = file => { try { return JSON.parse(fs.readFileSync(file,'utf8')); } catch (error) { problems.push(`${posix(path.relative(output,file))}: ${error.message}`); return {}; } };
  for (const file of list(output)) if (file.endsWith('.json')) readJson(file);
  const app = readJson(path.join(output,'app.json'));
  const checked = new Set();
  const checkUnit = (unit, kind) => {
    if (checked.has(unit)) return;
    checked.add(unit);
    for (const ext of ['.js','.json',template,style]) if (!fs.existsSync(path.join(output,unit+ext))) problems.push(`${kind} ${unit} 缺少 ${ext}`);
    const json = fs.existsSync(path.join(output,unit+'.json')) ? readJson(path.join(output,unit+'.json')) : {};
    for (const ref of Object.values(json.usingComponents || {})) checkUnit(ref.replace(/^\//,''), '组件');
  };
  for (const page of app.pages || []) checkUnit(page, '页面');
  for (const ref of Object.values(app.usingComponents || {})) checkUnit(ref.replace(/^\//,''), '组件');
  for (const item of (app.tabBar && app.tabBar.list) || []) {
    if (!(app.pages || []).includes(item.pagePath)) problems.push(`底栏页面 ${item.pagePath} 未在 pages 中声明`);
    for (const field of ['iconPath','selectedIconPath']) { const file = path.join(output,item[field] || ''); if (!item[field] || !fs.existsSync(file) || !fs.statSync(file).size) problems.push(`底栏图标 ${item[field]} 缺失`); }
  }
  return problems;
}

for(const platform of platforms) {
  const output=path.resolve(root,'apps',`miniprogram-${platform}`);
  if(!output.startsWith(path.join(root,'apps')+path.sep)) throw new Error('输出目录必须在当前项目 apps 内。');
  fs.mkdirSync(output,{recursive:true});
  const written=new Set();
  for(const file of list(source)) {
    const relative=path.relative(source,file);
    if(SKIP.has(relative) || relative === 'sitemap.json' && platform === 'xhs') continue;
    const ext=path.extname(file).toLowerCase();
    const outputRelative=platform === 'xhs' ? relative.replace(/\.wxml$/,'.xhsml').replace(/\.wxss$/,'.css') : relative;
    const destination=path.join(output,outputRelative);
    fs.mkdirSync(path.dirname(destination),{recursive:true});
    written.add(posix(outputRelative));
    if(BINARY.has(ext)){fs.copyFileSync(file,destination);continue;}
    let text=fs.readFileSync(file,'utf8');
    if(relative === 'config.js') text=`const environments = ${JSON.stringify({develop:{apiBase,websiteBase},trial:environment === 'trial' ? {apiBase,websiteBase} : {apiBase:'',websiteBase:''},release:environment === 'release' ? {apiBase,websiteBase} : {apiBase:'',websiteBase:''}},null,2)};\nfunction getConfig(){const config=environments[${JSON.stringify(environment)}];if(!config.apiBase || !config.websiteBase)throw new Error('尚未配置小程序服务地址');return config;}\nmodule.exports={getConfig,environments};\n`;
    if(posix(relative) === 'utils/platform.js') text=text.replace("const buildEnvironment = 'auto';",`const buildEnvironment = '${environment}';`).replace("const target = 'wechat';",`const target = '${platform}';`).replace("const sdk = typeof wx !== 'undefined' ? wx : {};",platform === 'xhs' ? "const sdk = typeof xhs !== 'undefined' ? xhs : {};" : "const sdk = typeof wx !== 'undefined' ? wx : {};");
    if(platform === 'xhs' && ext === '.wxml') text=text.replace(/\bwx:/g,'xhs:');
    if(platform === 'xhs' && ext === '.wxss') text=inlineVariables(text,variables);
    if(ext === '.json') {
      const json=JSON.parse(text);
      if(relative === 'app.json' && platform === 'xhs'){delete json.style;delete json.lazyCodeLoading;delete json.sitemapLocation;}
      // 小红书不读取 app.json 的全局组件，写入每个页面。
      if(relative.startsWith('pages'+path.sep) && platform === 'xhs') json.usingComponents={...sourceApp.usingComponents,...json.usingComponents};
      text=JSON.stringify(json,null,2)+'\n';
    }
    if(ext === '.js') text=ts.transpileModule(text,{fileName:relative,compilerOptions:{target:ts.ScriptTarget.ES2017,module:ts.ModuleKind.CommonJS,removeComments:false}}).outputText;
    fs.writeFileSync(destination,text);
  }
  // 清理上一版留下、本次未生成的文件（例如已改名的底栏图标），开发者工具的工程配置除外。
  let removed=0;
  for(const file of list(output)) {
    const relative=posix(path.relative(output,file));
    if(written.has(relative) || KEEP.has(relative) || relative === 'build-info.json') continue;
    fs.rmSync(file);removed++;
  }
  const prune=folder=>{for(const entry of fs.readdirSync(folder,{withFileTypes:true}))if(entry.isDirectory()){const child=path.join(folder,entry.name);prune(child);if(!fs.readdirSync(child).length)fs.rmdirSync(child);}};
  prune(output);
  const configPath=path.join(output,'project.config.json');
  const appid=appIds[platform];
  const config={description:`版本喵 · ${platform === 'wechat' ? '微信' : '小红书'}小程序`,miniprogramRoot:'./',compileType:'miniprogram',appid,projectname:`版本喵-${platform}`,setting:{urlCheck:environment !== 'develop',es6:true,minified:true}};
  fs.writeFileSync(configPath,JSON.stringify(config,null,2)+'\n');
  fs.writeFileSync(path.join(output,'build-info.json'),JSON.stringify({platform,environment,source:'apps/miniprogram',format:platform === 'xhs' ? 'XHSML/CSS/JavaScript' : 'WXML/WXSS/JavaScript',officialGuide:platform === 'xhs' ? 'https://miniapp.xiaohongshu.com/doc/DC451266' : 'https://developers.weixin.qq.com/miniprogram/dev/framework/'},null,2)+'\n');
  const problems=verify(output,platform);
  if(problems.length) throw new Error(`${platform} 构建校验失败：\n- `+problems.join('\n- '));
  console.log(`${platform}: ${written.size} files -> ${path.relative(root,output)} (${environment})${removed ? `, removed ${removed} stale` : ''}, verified ${sourceApp.pages.length} pages`);
}
