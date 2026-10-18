const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname,'..');
const source = path.join(root,'apps','miniprogram');
const args = process.argv.slice(2);
function option(key,fallback) {const index=args.indexOf(key);return index<0 ? fallback : args[index+1];}
const target = option('--target','all');
const environment = option('--env','develop');
if(!['all','wechat','xhs'].includes(target) || !['develop','trial','release'].includes(environment)) throw new Error('使用 --target all|wechat|xhs 与 --env develop|trial|release。');
const apiBase = process.env.MINIAPP_API_BASE || (environment === 'develop' ? 'http://127.0.0.1:8010/api/v1' : '');
const websiteBase = process.env.MINIAPP_WEBSITE_BASE || (environment === 'develop' ? 'http://localhost:3010' : '');
if(!apiBase || !websiteBase || (environment !== 'develop' && (![apiBase,websiteBase].every(value=>/^https:\/\//.test(value))))) throw new Error('体验/正式构建需要 MINIAPP_API_BASE 与 MINIAPP_WEBSITE_BASE，且必须为 HTTPS。');
const sourceApp = JSON.parse(fs.readFileSync(path.join(source,'app.json'),'utf8'));
function list(folder) {return fs.readdirSync(folder,{withFileTypes:true}).flatMap(entry=>entry.isDirectory() ? list(path.join(folder,entry.name)) : [path.join(folder,entry.name)]);}
for(const platform of target === 'all' ? ['wechat','xhs'] : [target]) {
  const output=path.resolve(root,'apps',`miniprogram-${platform}`);
  if(!output.startsWith(path.join(root,'apps')+path.sep)) throw new Error('输出目录必须在当前项目 apps 内。');
  fs.mkdirSync(output,{recursive:true});
  let count=0;
  for(const file of list(source)) {
    const relative=path.relative(source,file);
    if(relative === 'README.md' || relative === 'project.config.json' || relative === 'sitemap.json' && platform === 'xhs') continue;
    const ext=path.extname(file);
    const outputRelative=platform === 'xhs' ? relative.replace(/\.wxml$/,'.xhsml').replace(/\.wxss$/,'.css') : relative;
    const destination=path.join(output,outputRelative);
    fs.mkdirSync(path.dirname(destination),{recursive:true});
    if(ext === '.png'){fs.copyFileSync(file,destination);count++;continue;}
    let text=fs.readFileSync(file,'utf8');
    if(relative === 'config.js') text=`const environments = ${JSON.stringify({develop:{apiBase,websiteBase},trial:environment === 'trial' ? {apiBase,websiteBase} : {apiBase:'',websiteBase:''},release:environment === 'release' ? {apiBase,websiteBase} : {apiBase:'',websiteBase:''}},null,2)};\nfunction getConfig(){const config=environments[${JSON.stringify(environment)}];if(!config.apiBase || !config.websiteBase)throw new Error('尚未配置小程序服务地址');return config;}\nmodule.exports={getConfig,environments};\n`;
    if(relative.replaceAll(path.sep,'/') === 'utils/platform.js') text=text.replace("const buildEnvironment = 'auto';",`const buildEnvironment = '${environment}';`).replace("const target = 'wechat';",`const target = '${platform}';`).replace("const sdk = typeof wx !== 'undefined' ? wx : {};",platform === 'xhs' ? "const sdk = typeof xhs !== 'undefined' ? xhs : {};" : "const sdk = typeof wx !== 'undefined' ? wx : {};");
    if(platform === 'xhs' && ext === '.wxml') text=text.replace(/\bwx:/g,'xhs:');
    if(ext === '.json') {
      const json=JSON.parse(text);
      if(relative === 'app.json' && platform === 'xhs'){delete json.style;delete json.lazyCodeLoading;delete json.sitemapLocation;}
      if(relative.startsWith('pages'+path.sep) && platform === 'xhs') json.usingComponents={...sourceApp.usingComponents,...json.usingComponents};
      text=JSON.stringify(json,null,2)+'\n';
    }
    if(ext === '.js') text=ts.transpileModule(text,{fileName:relative,compilerOptions:{target:ts.ScriptTarget.ES2017,module:ts.ModuleKind.CommonJS,removeComments:false}}).outputText;
    fs.writeFileSync(destination,text);
    count++;
  }
  const configPath=path.join(output,'project.config.json');
  let previous={};try{previous=JSON.parse(fs.readFileSync(configPath,'utf8'));}catch{}
  const appid=process.env[platform === 'wechat' ? 'MINIAPP_WECHAT_APP_ID' : 'MINIAPP_XHS_APP_ID'] || previous.appid || (platform === 'wechat' ? 'touristappid' : '');
  const config={description:`更新小站 · ${platform === 'wechat' ? '微信' : '小红书'}小程序`,miniprogramRoot:'./',compileType:'miniprogram',appid,projectname:`更新小站-${platform}`,setting:{urlCheck:environment !== 'develop',es6:true,minified:true}};
  fs.writeFileSync(configPath,JSON.stringify(config,null,2)+'\n');
  fs.writeFileSync(path.join(output,'build-info.json'),JSON.stringify({platform,environment,source:'apps/miniprogram',format:platform === 'xhs' ? 'XHSML/CSS/JavaScript' : 'WXML/WXSS/JavaScript',officialGuide:platform === 'xhs' ? 'https://miniapp.xiaohongshu.com/doc/DC451266' : 'https://developers.weixin.qq.com/miniprogram/dev/framework/'},null,2)+'\n');
  console.log(`${platform}: ${count} files -> ${path.relative(root,output)} (${environment})`);
}
