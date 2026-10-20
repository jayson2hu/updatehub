// 小程序逻辑测试：对 npm run mini:build 生成的两份产物，连本机 API（http://127.0.0.1:8010）运行页面与工具逻辑。
// 写入类接口默认被拦截（返回模拟结果），只有「提交一次反馈」「生成并恢复同步码」「上报一批事件」真实调用 API，
// 避免每次运行都向数据库写入大量测试数据，也不触发匿名写入限流（反馈 + 想要合计 20 次/小时，同步码生成 10 次/小时）。
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const postcss=require('postcss');
const root=path.resolve(__dirname,'..');
const API=process.env.MINIAPP_TEST_API;
if (!API) throw new Error('请运行 npm run mini:check，自动使用独立测试库。');

// ---- 模拟宿主（wx / xhs 共用一套） ----
const app={globalData:{}};
function resetApp(){app.globalData={station:null,fetchedAt:0,stationVersion:0,closedAds:{},pendingCategory:''};}
resetApp();
const calls=[];
const storageMap=new Map();
let failNetwork=false, failClipboard=false, intercept=null;
const sdk={
  request(options){
    calls.push({type:'request',url:options.url,method:options.method,data:options.data});
    if(failNetwork){options.fail({errMsg:'offline'});return;}
    const mocked=intercept && intercept(options);
    if(mocked){setTimeout(()=>options.success(mocked),0);return;}
    const init={method:options.method || 'GET',headers:options.header || {}};
    if(options.data !== undefined && init.method !== 'GET')init.body=JSON.stringify(options.data);
    fetch(options.url,init).then(async response=>{const text=await response.text();let data='';try{data=text ? JSON.parse(text) : '';}catch{data=text;}options.success({statusCode:response.status,data});}).catch(error=>options.fail(error));
  },
  getAccountInfoSync(){return {miniProgram:{envVersion:'develop'}};},getDeviceInfo(){return {platform:'android'};},getSystemInfoSync(){return {platform:'android'};},
  stopPullDownRefresh(){},setNavigationBarTitle(options){calls.push({type:'title',title:options.title});},showShareMenu(options){calls.push({type:'shareMenu',options});},
  showToast(options){calls.push({type:'toast',title:options.title});},pageScrollTo(options){calls.push({type:'scroll',selector:options.selector});},previewImage(){},
  navigateTo(options){calls.push({type:'navigate',url:options.url});},switchTab(options){calls.push({type:'tab',url:options.url});},
  setTabBarBadge(options){calls.push({type:'badge',text:options.text});},removeTabBarBadge(){calls.push({type:'badge',text:''});},
  setClipboardData(options){if(failClipboard)options.fail({errMsg:'denied'});else{calls.push({type:'copy',value:options.data});options.success();}},
  getStorageSync(key){return storageMap.has(key) ? structuredClone(storageMap.get(key)) : '';},
  setStorageSync(key,value){storageMap.set(key,structuredClone(value));},removeStorageSync(key){storageMap.delete(key);}
};
global.wx=sdk;global.xhs=sdk;global.getApp=()=>app;

function instance(definition){
  const result={...definition,data:structuredClone(definition.data || {})};
  if(definition.methods)Object.assign(result,definition.methods);
  result.events=[];
  result.triggerEvent=function(name,detail){this.events.push({name,detail});};
  result.setData=function(patch,callback){for(const [key,value] of Object.entries(patch)){const parts=key.replace(/\[(\d+)\]/g,'.$1').split('.');let item=this.data;for(const segment of parts.slice(0,-1)){item[segment]??={};item=item[segment];}item[parts.at(-1)]=value;}if(typeof callback === 'function')callback();};
  return result;
}
function page(folder,name){let definition;global.Page=value=>definition=value;const file=path.join(folder,'pages',name,'index.js');delete require.cache[require.resolve(file)];require(file);assert.ok(definition,name);return instance(definition);}
function component(folder,name,properties){let definition;global.Component=value=>definition=value;const file=path.join(folder,'components',name,'index.js');delete require.cache[require.resolve(file)];require(file);const item=instance(definition);for(const [key,property] of Object.entries(definition.properties || {}))item.data[key]=typeof property==='object' && property !== null && 'value' in property ? structuredClone(property.value) : property === Boolean ? false : property === String ? '' : undefined;Object.assign(item.data,properties);return item;}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function settle(item,deadline=Date.now()+12000){await wait(5);while(item.data.loading && Date.now()<deadline)await wait(15);assert.equal(item.data.loading,false);}
async function boot(item,options={}){item.onLoad(options);await settle(item);assert.equal(item.data.error,'');return item;}
function files(folder){return fs.readdirSync(folder,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(folder,entry.name)):[path.join(folder,entry.name)]);}
function mod(folder,name){return require(path.join(folder,'utils',name));}
/** 默认拦截所有写请求：事件返回 204，其余由各测试单独设置。 */
function interceptWrites(handler){intercept=options=>{if(options.method === 'POST' && options.url.endsWith('/station/events'))return {statusCode:204,data:''};return handler ? handler(options) : null;};}
function fresh(folder){resetApp();calls.length=0;storageMap.clear();mod(folder,'storage').reset();mod(folder,'events').reset();interceptWrites();failNetwork=false;failClipboard=false;}
const PAGES=['latest','software','announcements','me','detail','announcement','search'];
const COMPONENTS=['app-icon','copy-link','page-state','ad-slot','sheet','wish-sheet'];

for(const platform of ['wechat','xhs']) {
  const folder=path.join(root,'apps','miniprogram-'+platform);
  require(path.join(folder,'config')).environments.develop.apiBase = API;
  const templateExt=platform === 'xhs' ? '.xhsml' : '.wxml';
  const styleExt=platform === 'xhs' ? '.css' : '.wxss';

  test(`${platform}: 生成目录包含 7 个页面、全部组件与底栏图标，JSON / JS / 样式合法`,()=>{
    const config=JSON.parse(fs.readFileSync(path.join(folder,'app.json'),'utf8'));
    assert.deepEqual(config.pages,PAGES.map(name=>`pages/${name}/index`));
    for(const p of config.pages)for(const ext of ['.json','.js',templateExt,styleExt])assert.ok(fs.existsSync(path.join(folder,p+ext)),p+ext);
    assert.deepEqual(config.tabBar.list.map(item=>item.text),['首页','软件库','公告','我的']);
    assert.equal(config.tabBar.selectedColor,'#2457E6');
    for(const item of config.tabBar.list)for(const field of ['iconPath','selectedIconPath']){const file=path.join(folder,item[field]);assert.ok(fs.statSync(file).size>0,item[field]);assert.deepEqual([...fs.readFileSync(file).subarray(1,4)].map(b=>String.fromCharCode(b)).join(''),'PNG');}
    assert.equal(config.window.navigationBarTitleText,undefined,'站名不写死在 app.json');
    for(const name of COMPONENTS)for(const ext of ['.json','.js',templateExt,styleExt])assert.ok(fs.existsSync(path.join(folder,'components',name,'index'+ext)),name+ext);
    for(const file of files(folder)){
      if(file.endsWith('.png'))continue;
      const contents=fs.readFileSync(file,'utf8');
      if(file.endsWith('.json'))JSON.parse(contents);
      if(file.endsWith('.js'))new vm.Script(contents,{filename:file});
      if(file.endsWith(styleExt))postcss.parse(contents,{from:file});
      if(platform === 'xhs' && file.endsWith('.xhsml'))assert.ok(!contents.includes('wx:'),file);
      if(platform === 'xhs' && file.endsWith('.css'))assert.ok(!/var\(--/.test(contents),'小红书样式已内联 CSS 变量：'+file);
      assert.ok(!/更新小站/.test(contents) || file.endsWith('README.md'),'不再写死旧站名：'+file);
    }
    if(platform === 'xhs')for(const p of config.pages){const json=JSON.parse(fs.readFileSync(path.join(folder,p+'.json'),'utf8'));for(const name of Object.keys(config.usingComponents))assert.ok(json.usingComponents[name],`${p} 引用 ${name}`);}
    const adapter=fs.readFileSync(path.join(folder,'utils','platform.js'),'utf8');
    assert.ok(adapter.includes(platform === 'xhs' ? 'typeof xhs' : 'typeof wx'));
    assert.ok(!fs.existsSync(path.join(folder,'assets','latest.png')),'旧底栏图标已清理');
    // 没有开发者工具时的最低保障：模板标签成对闭合、{{ }} 成对。
    for(const file of files(folder).filter(f=>f.endsWith(templateExt))){
      const text=fs.readFileSync(file,'utf8').replace(/<!--[\s\S]*?-->/g,'');
      assert.equal((text.match(/\{\{/g) || []).length,(text.match(/\}\}/g) || []).length,'{{ }} 成对：'+file);
      const stack=[];
      for(const match of text.matchAll(/<(\/?)([a-zA-Z][\w-]*)((?:[^>"]|"[^"]*")*?)(\/?)>/g)){
        const [,closing,tag,,selfClosing]=match;
        if(selfClosing)continue;
        if(!closing){stack.push(tag);continue;}
        assert.equal(stack.pop(),tag,`标签闭合顺序错误 </${tag}>：${file}`);
      }
      assert.deepEqual(stack,[],'存在未闭合标签：'+file);
    }
  });

  test(`${platform}: 模板里绑定的事件在页面与组件定义中都存在`,()=>{
    for(const name of PAGES) {
      const item=page(folder,name);
      const template=fs.readFileSync(path.join(folder,'pages',name,'index'+templateExt),'utf8');
      for(const match of template.matchAll(/\b(?:bind|catch)[a-z:-]+="([a-zA-Z][a-zA-Z0-9]*)"/g))assert.equal(typeof item[match[1]],'function',`${name}: ${match[1]}`);
      assert.ok(!/\{\{[^}]*\b[a-zA-Z_.]+\([^}]*\}\}/.test(template.replace(/\{\{[^}]*'[^']*'[^}]*\}\}/g,'')),`${name}: WXML 中不能调用函数`);
    }
    for(const name of COMPONENTS) {
      const item=component(folder,name,{});
      const template=fs.readFileSync(path.join(folder,'components',name,'index'+templateExt),'utf8');
      for(const match of template.matchAll(/\b(?:bind|catch)[a-z:-]+="([a-zA-Z][a-zA-Z0-9]*)"/g))assert.equal(typeof item[match[1]],'function',`${name}: ${match[1]}`);
    }
  });

  test(`${platform}: 更新建议四档结论与 hold 稳定版选择`,()=>{
    const advice=mod(folder,'advice');
    const hold={id:'h',software_id:'s',platform:'desktop',version:'4.1.0',advice:'hold',stable_release_id:'st',published_at:'2026-10-17T00:00:00Z',advice_note:'登录问题',package_size:'40 MB',requirements:'Windows 11',install_notice:'问题版请勿覆盖安装'};
    const stable={id:'st',software_id:'s',platform:'desktop',version:'4.0.6',advice:'recommended',published_at:'2026-10-10T00:00:00Z',package_size:'35 MB',requirements:'Windows 10',install_notice:'稳定版先备份配置'};
    assert.equal(advice.stableRelease(hold,[hold,stable]).id,'st');
    assert.equal(advice.stableRelease(hold,[hold,{...stable,platform:'android'}]),null,'稳定版必须同设备');
    assert.equal(advice.stableRelease(hold,[hold,{...stable,published:false}]),null,'稳定版必须已发布');
    assert.equal(advice.stableRelease({...hold,advice:'wait'},[hold,stable]),null,'只有 hold 才取稳定版');
    assert.deepEqual(['recommended','wait','hold','optional',undefined].map(a=>advice.verdict({...stable,advice:a},'desktop').tone),['ok','warn','bad','opt','opt']);
    assert.equal(advice.verdict(hold,'desktop').title,'先别更新 · 电脑版 4.1.0');
    assert.equal(advice.verdict(hold,'desktop').note,'登录问题');
    const software={name:'云盘助手',status:'normal',status_reason:''};
    const links=(url,extra=[])=>[{id:url,url,kind:'official',is_primary:true,is_active:true},...extra];
    let plan=advice.downloadPlan({software,release:{...hold,links:links('https://dl.example.test/4.1.0',[{id:'n',url:'https://pan.example.test/s/1',kind:'netdisk',code:'k3m9',is_active:true},{id:'x',url:'https://dead.example.test',kind:'netdisk',is_active:false}])},latest:hold,stable:{...stable,links:links('https://dl.example.test/4.0.6')},platform:'desktop'});
    assert.equal(plan.primary.label,'⬇ 复制稳定版 4.0.6 下载链接');assert.equal(plan.primary.value,'https://dl.example.test/4.0.6');assert.equal(plan.primary.releaseId,'st');
    assert.equal(plan.secondary.label,'仍要复制 4.1.0 链接');assert.equal(plan.secondary.value,'https://dl.example.test/4.1.0');
    assert.ok(plan.notes.some(n=>n.tone === 'bad' && n.text.includes('建议先下载稳定版 4.0.6')));
    assert.equal(plan.backups.length,1,'失效入口不显示');assert.equal(plan.backups[0].value,'https://pan.example.test/s/1 提取码 k3m9');assert.equal(plan.backups[0].label,'复制链接和提取码');
    assert.ok(plan.meta.includes('✓ 官方来源 dl.example.test'));
    assert.ok(plan.meta.includes('📦 35 MB'));assert.ok(plan.meta.includes('🖥 Windows 10'));assert.ok(!plan.meta.includes('📦 40 MB'));
    assert.equal(plan.installNotice,'安装前请注意（稳定版 4.0.6）：稳定版先备份配置');
    // 指定稳定版缺官方链接时，明确引导查看其入口，不将问题版变成主下载。
    plan=advice.downloadPlan({software,release:{...hold,links:[{...links('https://dl.example.test/4.1.0')[0],code:'new41'}]},latest:hold,stable:{...stable,links:[]},platform:'desktop'});
    assert.equal(plan.primary,null);assert.equal(plan.selectStable.releaseId,'st');assert.equal(plan.selectStable.label,'查看稳定版 4.0.6 入口');
    assert.equal(plan.secondary.releaseId,'h');assert.equal(plan.secondary.code,'new41');assert.ok(plan.meta.includes('📦 35 MB'));
    // 不可用：本版本不给入口；稳定版可用时主按钮改为稳定版。
    plan=advice.downloadPlan({software,release:{...hold,status:'unavailable',status_reason:'官方下架',links:links('https://dl.example.test/4.1.0')},latest:hold,stable:{...stable,links:links('https://dl.example.test/4.0.6')},platform:'desktop'});
    assert.equal(plan.primary.releaseId,'st');assert.equal(plan.secondary,null);assert.ok(plan.notes[0].text.includes('官方下架'));
    assert.ok(plan.meta.includes('🖥 Windows 10'));assert.ok(plan.installNotice.includes('稳定版先备份配置'));
    plan=advice.downloadPlan({software,release:{...hold,status:'unavailable'},latest:hold,stable:{...stable,links:[]},platform:'desktop'});
    assert.equal(plan.primary,null);assert.equal(plan.selectStable.releaseId,'st');assert.equal(plan.secondary,null);
    plan=advice.downloadPlan({software,release:{...stable,status:'unavailable',links:links('https://dl.example.test/4.0.6')},latest:stable,stable:null,platform:'desktop'});
    assert.equal(plan.primary,null);assert.equal(plan.disabledText,'暂时无法下载');assert.equal(plan.backups.length,0);
    // 旧版、苹果、无链接
    plan=advice.downloadPlan({software,release:{...stable,links:links('https://dl.example.test/4.0.6')},latest:hold,stable:null,platform:'desktop'});
    assert.equal(plan.primary.label,'⬇ 复制电脑版 4.0.6 下载链接');assert.ok(plan.notes.some(n=>n.tone === 'old' && n.text.includes('最新版 4.1.0 有使用提醒')));
    assert.ok(!plan.notes.some(n=>n.text.includes('建议下载最新版 4.1.0')),'最新版为 hold 时不催促升级');
    plan=advice.downloadPlan({software,release:{...hold,status:'unavailable'},latest:{...hold,id:'newer'},stable:{...stable,links:links('https://dl.example.test/4.0.6')},platform:'desktop'});
    assert.equal(plan.primary,null);assert.equal(plan.selectStable,null,'历史问题版不冒充当前稳定版入口');assert.equal(plan.disabledText,'暂时无法下载');
    plan=advice.downloadPlan({software,release:{...stable,platform:'ios',links:links('https://apps.apple.com/app/id1')},latest:null,stable:null,platform:'ios'});
    assert.equal(plan.primary.label,'⬇ 复制 App Store 链接');assert.ok(plan.iosHint.includes('云盘助手'));assert.ok(plan.meta.includes('📦 App Store'));
    plan=advice.downloadPlan({software,release:{...stable,links:[]},latest:stable,stable:null,platform:'android'});
    assert.equal(plan.primary,null);assert.equal(plan.disabledText,'暂无下载链接');
    const text=advice.noticeText({siteName:'版本喵',software,release:{...hold,summary:'新版界面'},stable,link:'https://example.test/software/yunpan?platform=desktop'});
    assert.equal(text.split('\n')[0],'【版本喵】云盘助手 4.1.0 更新了');assert.ok(text.includes('⛔ 先别更新'));assert.ok(text.includes('先装稳定版 4.0.6'));
  });

  test(`${platform}: 更新内容分组、安装教程回退、FAQ 按设备过滤、能用率`,()=>{
    const advice=mod(folder,'advice');
    const grouped=advice.groupChanges([{kind:'known_issue',text:'部分账号无法登录'},{kind:'improved',text:'启动更快'},{kind:'added',text:'新增倍速'},{kind:'fixed',text:'修复卡顿'},{kind:'added',text:'新增字幕'},{kind:'oops',text:'未知类型'},{kind:'fixed',text:'  '}]);
    assert.deepEqual(grouped.map(i=>i.label+':'+i.text),['新增:新增倍速','新增:新增字幕','修复:修复卡顿','优化:启动更快','已知问题:部分账号无法登录']);
    assert.deepEqual(advice.groupChanges(null),[]);
    const s={installation:['通用一','通用二'],install_guides:{tv:['电视一'],android:[]},faqs:[{question:'全部',answer:'a',platforms:[]},{question:'电视',answer:'b',platforms:['tv']},{question:'无字段',answer:'c'}]};
    assert.deepEqual(advice.installGuide(s,'tv').steps,['电视一']);assert.equal(advice.installGuide(s,'tv').source,'platform');assert.equal(advice.installGuide(s,'tv').title,'电视盒子安装教程');
    assert.deepEqual(advice.installGuide(s,'android').steps,['通用一','通用二'],'空数组退回通用步骤');assert.equal(advice.installGuide(s,'desktop').source,'general');
    assert.equal(advice.installGuide({},'ios').source,'none');
    assert.deepEqual(advice.faqsFor(s,'tv').map(f=>f.question),['全部','电视','无字段','以上都没解决？']);
    assert.deepEqual(advice.faqsFor(s,'android').map(f=>f.question),['全部','无字段','以上都没解决？']);
    assert.ok(advice.faqsFor(s,'tv').every(f=>f.open === false));
    assert.deepEqual(advice.feedbackSummary(3,1),{ok:3,issue:1,total:4,percent:75,few:true,warn:false,rateText:'👍 反馈较少'});
    assert.equal(advice.feedbackSummary(97,3).rateText,'👍 97% 能用');assert.equal(advice.feedbackSummary(5,6).warn,true);
    assert.deepEqual(advice.defaultDevice({supported:['android','tv'],requested:'tv',detected:'android'}),{platform:'tv',auto:false});
    assert.deepEqual(advice.defaultDevice({supported:['android','tv'],preferred:'tv',detected:'android'}),{platform:'tv',auto:false});
    assert.deepEqual(advice.defaultDevice({supported:['android','tv'],preferred:'ios',detected:'android'}),{platform:'android',auto:true});
    assert.deepEqual(advice.defaultDevice({supported:['desktop','tv'],detected:'android'}),{platform:'tv',auto:false});
    assert.equal(advice.detectDevice({platform:'iOS'}),'ios');assert.equal(advice.detectDevice({platform:'devtools'}),'');
  });

  test(`${platform}: 搜索匹配（大小写、全半角）与高亮切分不注入`,async()=>{
    fresh(folder);
    const search=mod(folder,'search');
    assert.deepEqual(search.highlight('YunPan 云盘 yunpan','yun').map(p=>[p.text,p.hit]),[['Yun',true],['Pan 云盘 ',false],['yun',true],['pan',false]]);
    assert.deepEqual(search.highlight('ＹＵＮ盘','yun').map(p=>[p.text,p.hit]),[['ＹＵＮ',true],['盘',false]],'全角也能命中并切出原文');
    assert.deepEqual(search.highlight('<b>网盘</b>','<b>').map(p=>[p.text,p.hit]),[['<b>',true],['网盘</b>',false]],'关键词按文本处理');
    assert.deepEqual(search.highlight('没有命中','xyz').map(p=>p.hit),[false]);
    const api=mod(folder,'api');const data=await api.station(true);
    const result=search.searchAll(data,'网盘');
    const yunpan=result.software.find(s=>s.slug === 'yunpan');assert.ok(yunpan,'按别名 / 分类 / 简介命中');
    assert.ok(yunpan.summaryParts.some(p=>p.hit && p.text === '网盘'));
    const video=search.searchAll(data,'影视');
    assert.deepEqual(video.software.map(s=>s.slug).sort(),data.software.filter(s=>s.category === 'video').map(s=>s.slug).sort(),'搜分类名命中该分类所有软件');
    assert.equal(search.searchAll(data,'  ').total,0);
    assert.ok(search.searchAll(data,'维护').notices.length>0,'公告标题与正文参与搜索');
  });

  test(`${platform}: 同步码格式化与输入清洗`,()=>{
    const sync=mod(folder,'sync');
    assert.equal(sync.format('xb7k2m9q4t'),'XB7K2-M9Q4T');assert.equal(sync.clean(' xb7-k2 m9q4t '),'XB7K2M9Q4T');assert.equal(sync.format('xb7'),'XB7');
    assert.equal(sync.clean('XB7K2-M9Q4T-EXTRA'),'XB7K2M9Q4T');
    assert.equal(sync.isValid('xb7k2-m9q4t'),true);assert.equal(sync.isValid('XB7K2M9Q4O'),false,'排除易混字符 O');assert.equal(sync.isValid('XB7K2M9Q41'),false,'排除 1');assert.equal(sync.isValid('XB7K2'),false);
    assert.equal(sync.daysLeft(new Date(Date.now()+29.2*86400000).toISOString()),30);assert.equal(sync.daysLeft('2020-01-01T00:00:00Z'),0);
  });

  test(`${platform}: 收藏红点判断、全部已读与提醒开关`,async()=>{
    fresh(folder);
    const storage=mod(folder,'storage');const feed=mod(folder,'feed');const api=mod(folder,'api');
    assert.equal(storage.hasUpdate('2026-10-17T00:00:00Z','2026-10-10T00:00:00Z'),true);
    assert.equal(storage.hasUpdate('2026-10-10T00:00:00Z','2026-10-10T00:00:00Z'),false);
    assert.equal(storage.hasUpdate('2026-10-17T00:00:00Z',undefined),false,'没有已读记录不提醒');
    const data=await api.station(true);
    const yunpan=data.software.find(s=>s.slug === 'yunpan');const moji=data.software.find(s=>s.slug === 'moji');
    assert.equal(storage.toggleFavorite(yunpan.id,feed.latestMap(data)[yunpan.id]),true);
    assert.equal(feed.updateCount(data),0,'新收藏立即视为已读');
    storage.toggleFavorite(moji.id,'2020-01-01T00:00:00Z');
    assert.equal(feed.updateCount(data),1);
    const states=feed.favoriteStates(data);assert.equal(states.find(s=>s.id === moji.id).isNew,true);
    const first=feed.feedItems(data).items[0];assert.equal(first.softwareId,moji.id);assert.equal(first.heading,'★ 你收藏的软件有新版本');
    storage.setRemind(false);assert.equal(feed.updateCount(data),0,'关闭提醒后不显示红点');storage.setRemind(true);
    storage.markAllSeen(feed.latestMap(data));assert.equal(feed.updateCount(data),0);
    assert.equal(storage.toggleFavorite(moji.id),false);assert.deepEqual(storage.favorites(),[yunpan.id]);
    for(let i=0;i<8;i++)storage.pushRecent('id'+i);assert.equal(storage.recent().length,6);assert.equal(storage.recent()[0],'id7');
    assert.deepEqual(storage.mergeFavorites([yunpan.id,moji.id,moji.id]),[moji.id],'合并收藏不重复');
  });

  test(`${platform}: 统计事件批量与当天去重`,()=>{
    fresh(folder);
    const events=mod(folder,'events');
    assert.deepEqual(events.dedupe({day:'2026-10-18',keys:['sw_view:a']},'sw_view:a','2026-10-18').report,false);
    assert.deepEqual(events.dedupe({day:'2026-10-17',keys:['sw_view:a']},'sw_view:a','2026-10-18'),{report:true,state:{day:'2026-10-18',keys:['sw_view:a']}});
    const day=Date.parse('2026-10-18T03:00:00Z');
    assert.equal(events.softwareView('sw-1',day),true);assert.equal(events.softwareView('sw-1',day+3600000),false);assert.equal(events.softwareView('sw-1',day+86400000),true);
    assert.equal(events.announcementView('n-1',day),true);assert.equal(events.announcementView('n-1',day),false);
    events.downloadCopy('rel-1');events.page('home');events.page('unknown');events.search('网盘',true);events.search('不存在',false);
    assert.deepEqual(events.pending(),[{event:'sw_view',key:'sw-1'},{event:'sw_view',key:'sw-1'},{event:'ann_view',key:'n-1'},{event:'dl_copy',key:'rel-1'},{event:'page_view',key:'home'},{event:'search',key:'网盘'},{event:'search_miss',key:'不存在'}]);
    assert.equal(events.beijingDay(Date.parse('2026-10-17T16:30:00Z')),'2026-10-18','按北京时间自然日');
  });

  test(`${platform}: 本周概览、信息流合并与格式`,async()=>{
    fresh(folder);
    const feed=mod(folder,'feed');const c=mod(folder,'content');
    assert.equal(feed.weekInfo(Date.parse('2026-10-18T03:00:00Z')).label,'10月第2周');
    assert.equal(feed.weekInfo(Date.parse('2026-10-01T03:00:00Z')).label,'9月第4周','以周一（9 月 28 日）所在月份计');
    assert.equal(c.formatCount(8400),'8,400');assert.equal(c.formatCount(12345),'1.2万');
    const sw={id:'s1',slug:'a',name:'光幕',platforms:['android','tv'],view_count:12000};
    const data={software:[sw],releases:[
      {id:'r1',software_id:'s1',platform:'android',version:'3.2.1',advice:'recommended',published_at:'2026-10-16T02:00:00Z',previous_version:'3.2.0',feedback_ok:60,feedback_issue:2},
      {id:'r2',software_id:'s1',platform:'tv',version:'3.2.1',advice:'recommended',published_at:'2026-10-16T05:00:00Z',feedback_ok:37,feedback_issue:1},
      {id:'r3',software_id:'s1',platform:'android',version:'3.2.0',advice:'optional',published_at:'2026-10-14T02:00:00Z'}],announcements:[{id:'n',importance:'urgent',published_at:'2026-10-15T00:00:00Z'}]};
    const cards=feed.feedCards(data,Date.parse('2026-10-16T10:00:00Z'));
    assert.equal(cards.length,2,'同日同版本多设备合并为一张');
    assert.deepEqual(cards[0].platformIds.sort(),['android','tv']);assert.equal(cards[0].rateText,'👍 97% 能用');assert.equal(cards[0].viewsText,'1.2万 人看过');assert.equal(cards[0].dayLabel,'10月16日 · 今天');
    const week=feed.weekStats(data,Date.parse('2026-10-16T10:00:00Z'));
    assert.equal(week.total,2);assert.deepEqual(week.pills,['✓ 1 个建议更新','📢 1 条重要公告']);
    assert.equal(feed.weekStats({software:[],releases:[],announcements:[]}).title,'本周暂无软件更新');
    assert.equal(feed.adEnabled({ads_enabled:true,ad_placements:{home_feed:false}},'home_feed'),false);assert.equal(feed.adEnabled({ads_enabled:true,ad_placements:{}},'detail_body'),true);
  });

  test(`${platform}: 首页读取真实数据，含概览、分类、信息流、广告位置与角标`,async()=>{
    fresh(folder);
    const home=await boot(page(folder,'latest'));
    const data=app.globalData.station;
    assert.equal(calls.find(call=>call.type === 'title').title,data.settings.site_name,'导航栏标题读取站名');
    assert.match(home.data.week.label,/^\d+月第\d周$/);
    assert.ok(home.data.items.length>=8);assert.equal(home.data.items[2].adAfter,true);assert.equal(home.data.items.filter(i=>i.adAfter).length,1);
    assert.equal(home.data.adsEnabled,Boolean(data.settings.ads_enabled && (data.settings.ad_placements || {}).home_feed !== false),'广告开关 = 总开关 + 位置开关');
    assert.equal(home.data.categories.at(-1).id,'all');assert.ok(home.data.categories.some(c=>c.id === 'netdisk'));
    assert.deepEqual(home.data.categories.slice(0,-1).map(c=>c.id).sort(),[...new Set(data.software.map(s=>s.category || 'other'))].sort(),'只显示有软件的分类');
    assert.ok(home.data.notices.every(n=>!n.ended));
    home.onPlatform({currentTarget:{dataset:{id:'tv'}}});assert.ok(home.data.items.length>0);assert.ok(home.data.items.every(i=>i.platformIds.includes('tv')));
    home.openCategory({currentTarget:{dataset:{id:'netdisk'}}});assert.equal(app.globalData.pendingCategory,'netdisk');assert.equal(calls.at(-1).url,'/pages/software/index');
    // 收藏有新版：首页区块 + 底栏角标；全部已读后消失。
    const storage=mod(folder,'storage');const moji=data.software.find(s=>s.slug === 'moji');
    storage.toggleFavorite(moji.id,'2020-01-01T00:00:00Z');home.render();
    assert.equal(home.data.favUpdates.length,1);assert.equal(calls.filter(c=>c.type === 'badge').at(-1).text,'1');
    home.markAllRead();assert.equal(home.data.favUpdates.length,0);assert.equal(calls.filter(c=>c.type === 'badge').at(-1).text,'');
    assert.equal(home.onShareAppMessage().path,'/pages/latest/index');assert.ok(home.onShareAppMessage().title.startsWith(data.settings.site_name));
    const release=home.data.items[0];home.openSoftware({currentTarget:{dataset:{slug:release.slug,platform:release.platform,release:release.releaseId}}});
    assert.ok(calls.at(-1).url.includes('platform='+release.platform));
  });

  test(`${platform}: 软件库分类、排序与收藏星`,async()=>{
    fresh(folder);
    app.globalData.pendingCategory='video';
    const lib=page(folder,'software');lib.onLoad({});lib.onShow();await settle(lib);
    const data=app.globalData.station;
    assert.equal(lib.data.category,'video');assert.ok(lib.data.software.length>0);
    const categoryOf=id=>data.software.find(s=>s.id === id).category;
    assert.ok(lib.data.software.every(s=>categoryOf(s.id) === 'video'));
    lib.onCategory({currentTarget:{dataset:{id:'all'}}});assert.equal(lib.data.software.length,data.software.length);
    const recent=lib.data.software.map(s=>s.latestAt);assert.deepEqual(recent,[...recent].sort().reverse(),'默认按最近更新');
    lib.onSort({currentTarget:{dataset:{id:'popular'}}});const views=lib.data.software.map(s=>s.views);assert.deepEqual(views,[...views].sort((a,b)=>b-a));
    lib.onCategory({currentTarget:{dataset:{id:'music'}}});assert.equal(lib.data.software.length,0);lib.openWish();assert.equal(lib.data.wishOpen,true);
    lib.onCategory({currentTarget:{dataset:{id:'all'}}});
    const target=lib.data.software[0];lib.toggleFavorite({currentTarget:{dataset:{id:target.id}}});
    assert.equal(lib.data.software.find(s=>s.id === target.id).favorite,true);assert.equal(calls.filter(c=>c.type === 'toast').at(-1).title,'已收藏，有新版本会提醒你');
    assert.deepEqual(mod(folder,'events').pending().filter(e=>e.event.startsWith('fav_')),[{event:'fav_add',key:target.id}]);
  });

  test(`${platform}: 详情页 hold 结论、复制稳定版、版本与设备切换、分段内容与分享`,async()=>{
    fresh(folder);
    const detail=await boot(page(folder,'detail'),{slug:'yunpan',platform:'desktop'});
    assert.equal(detail.data.platform,'desktop');assert.equal(detail.data.verdict.tone,'bad');assert.equal(detail.data.verdict.title,'先别更新 · 电脑版 4.1.0');
    assert.ok(detail.data.plan.notes.some(n=>n.text.includes('建议先下载稳定版 4.0.6')));
    // 没有稳定版官方链接时先查看它的入口，不能默认复制问题版。
    if(detail.data.plan.primary)assert.equal(detail.data.plan.primary.label,'⬇ 复制稳定版 4.0.6 下载链接');else assert.equal(detail.data.plan.selectStable.label,'查看稳定版 4.0.6 入口');
    const supported=detail._detail.software.platforms;
    assert.deepEqual(detail.data.devices.filter(d=>d.disabled).map(d=>d.id),['android','ios','tv','desktop'].filter(id=>!supported.includes(id)));
    assert.equal(detail.data.kpis.length,3);assert.equal(detail.data.versions.length,detail._releases.filter(r=>r.platform === 'desktop').length);assert.ok(detail.data.versions.some(v=>v.version === '4.0.6'));
    // 私有测试链接只存在于内存，验证每个版本只复制自己的链接。
    const current=detail._releases.find(r=>r.platform === 'desktop');const stable=detail._releases.find(r=>r.id === current.stable_release_id);assert.ok(stable,'hold 示例带稳定版');
    current.links=[{id:'pending-current',url:'https://dl.example.test/yunpan-4.1.0',kind:'official',is_primary:true,is_active:true}];stable.links=[];
    detail.choose('desktop');assert.equal(detail.data.plan.primary,null);assert.equal(detail.data.plan.secondary.releaseId,current.id);
    detail.onVersion({currentTarget:{dataset:{id:detail.data.plan.selectStable.releaseId}}});assert.equal(detail.data.release.id,stable.id);assert.equal(detail.data.plan.primary,null);assert.equal(detail.data.plan.selectStable,null);
    current.links=[{id:'l1',url:'https://dl.example.test/yunpan-4.1.0',kind:'official',is_primary:true,is_active:true},{id:'l2',url:'https://pan.example.test/s/abc',kind:'netdisk',code:'k3m9',is_active:true}];
    stable.links=[{id:'l3',url:'https://dl.example.test/yunpan-4.0.6',kind:'official',is_primary:true,is_active:true,code:'st06'}];
    detail.choose('desktop');
    assert.equal(detail.data.plan.primary.label,'⬇ 复制稳定版 4.0.6 下载链接');assert.equal(detail.data.plan.primary.short,'⬇ 复制稳定版 4.0.6');assert.ok(detail.data.plan.primary.value.endsWith('4.0.6'));
    assert.ok(detail.data.plan.secondary.value.endsWith('4.1.0'));assert.equal(detail.data.plan.primary.code,'st06','提取码单独复制');assert.ok(!detail.data.plan.primary.value.includes('st06'),'主链接不夹带提取码');assert.equal(detail.data.plan.backups[0].value,'https://pan.example.test/s/abc 提取码 k3m9');
    detail.onCopied({currentTarget:{dataset:{release:detail.data.plan.primary.releaseId}}});
    assert.deepEqual(mod(folder,'events').pending().filter(e=>e.event === 'dl_copy'),[{event:'dl_copy',key:stable.id}]);
    detail.onVersion({currentTarget:{dataset:{id:stable.id}}});
    assert.equal(detail.data.release.latest,false);assert.equal(detail.data.verdict.tone,'ok');assert.equal(detail.data.plan.primary.label,'⬇ 复制电脑版 4.0.6 下载链接');
    assert.ok(detail.data.plan.notes.some(n=>n.tone === 'old'));assert.equal(detail.data.feedbackTitle,'最新版 4.1.0 能正常用吗？');
    assert.ok(detail.onShareAppMessage().path.includes(stable.id));
    detail.selectTimeline({currentTarget:{dataset:{id:current.id}}});assert.equal(detail.data.release.id,current.id);assert.equal(calls.at(-1).selector,'#download');
    current.status='unavailable';current.status_reason='官方暂停下载';detail.choose('desktop');
    assert.ok(detail.data.plan.notes.some(n=>n.text.includes('官方暂停下载')));assert.equal(detail.data.plan.primary.releaseId,stable.id);assert.equal(detail.data.plan.secondary,null);
    current.status='attention';
    detail.onTab({currentTarget:{dataset:{id:'guide'}}});assert.equal(detail.data.tab,'guide');assert.equal(detail.data.guide.title,'电脑安装教程');assert.equal(detail.data.guide.source,'platform');
    assert.equal(detail.data.faqs.at(-1).question,'以上都没解决？');detail.toggleFaq({currentTarget:{dataset:{index:0}}});assert.equal(detail.data.faqs[0].open,true);
    assert.ok(detail.data.info.some(row=>row.label === '开发者'));assert.ok(detail.data.info.every(row=>row.value));
    detail.onDevice({currentTarget:{dataset:{id:'tv',disabled:true}}});assert.equal(detail.data.platform,'desktop','不支持的设备不可选');
    detail.onDevice({currentTarget:{dataset:{id:'android',disabled:false}}});assert.equal(detail.data.platform,'android');assert.equal(detail.data.verdict.tone,'ok');
    assert.deepEqual(detail.data.changes.map(c=>c.text),mod(folder,'advice').groupChanges(detail._releases.find(r=>r.platform === 'android').changes).map(c=>c.text));
    const share=detail.onShareAppMessage();assert.ok(share.title.includes('4.1.0'));assert.ok(share.path.includes('slug=yunpan'));assert.ok(share.path.includes('platform=android'));
    assert.ok(detail.data.shareText.startsWith('【'));assert.ok(detail.data.websiteLink.includes('platform=android'));
    // 浏览记录与收藏
    const storage=mod(folder,'storage');const id=detail._detail.software.id;
    assert.equal(storage.recent()[0],id);
    assert.equal(mod(folder,'events').pending().filter(e=>e.event === 'sw_view').length,1);
    await detail.load();assert.equal(mod(folder,'events').pending().filter(e=>e.event === 'sw_view').length,1,'同一软件当天只报一次');
    detail.toggleFavorite();assert.equal(detail.data.favorite,true);assert.equal(storage.isFavorite(id),true);
    const previous=detail.data.release.id;failNetwork=true;await detail.load();assert.ok(detail.data.error.includes('连接不上'));assert.equal(detail.data.release.id,previous);failNetwork=false;
  });

  test(`${platform}: 详情默认设备按 链接参数 → 常用设备 → 本机识别`,async()=>{
    fresh(folder);
    let detail=await boot(page(folder,'detail'),{slug:'guangmu'});
    assert.equal(detail.data.platform,'android');assert.equal(detail.data.autoDetected,true);assert.equal(detail.data.devices.find(d=>d.id === 'android').local,true);
    mod(folder,'storage').setDevice('tv');
    detail=await boot(page(folder,'detail'),{slug:'guangmu'});assert.equal(detail.data.platform,'tv');assert.equal(detail.data.autoDetected,false);
    detail=await boot(page(folder,'detail'),{slug:'guangmu',platform:'desktop'});assert.equal(detail.data.platform,'desktop');
    const tvOld=(await boot(page(folder,'detail'),{slug:'guangmu',platform:'tv'}))._releases.find(r=>r.platform === 'tv' && r.version === '2.6.0');
    detail=await boot(page(folder,'detail'),{slug:'guangmu',release:tvOld.id});assert.equal(detail.data.platform,'tv','分享的版本决定设备');assert.equal(detail.data.release.id,tvOld.id);
    const missing=page(folder,'detail');missing.onLoad({slug:'not-exists-999'});await settle(missing);assert.ok(missing.data.error.includes('下架'));
  });

  test(`${platform}: 反馈即时计票、改投撤销、问题说明与渠道`,async()=>{
    fresh(folder);
    const detail=await boot(page(folder,'detail'),{slug:'moji',platform:'android'});
    const initialOk=detail._latest.feedback_ok||0,initialIssue=detail._latest.feedback_issue||0;
    let posted=null,status=200,current='',oks=initialOk,issues=initialIssue,sequence=0;
    interceptWrites(options=>{
      if(!options.url.endsWith('/station/feedback/vote')) return null;
      posted=options.data;
      if(status===429)return {statusCode:429,data:{detail:'操作太频繁'}};
      if(posted.action==='vote'){
        if(current==='ok')oks--;if(current==='issue')issues--;
        current=posted.verdict;if(current==='ok')oks++;if(current==='issue')issues++;
      }
      return {statusCode:200,data:{receipt:current==='none'?'':'test-receipt-'+(++sequence),oks,issues}};
    });
    assert.equal(await detail.openIssue(),true);assert.equal(detail.data.issueOpen,true);
    assert.equal(detail.data.feedback.issue,initialIssue+1,'打开问题弹层前已计票');
    assert.equal(await detail.submitIssue(),false,'类型必选');
    detail.chooseIssueKind({currentTarget:{dataset:{id:'crash'}}});
    assert.equal(detail.onIssueNote({detail:{value:'很'.repeat(400)}}).length,300);
    status=429;assert.equal(await detail.submitIssue(),false);assert.equal(calls.filter(c=>c.type==='toast').at(-1).title,'提交太频繁，请稍后再试');
    status=200;assert.equal(await detail.submitIssue(),true);
    assert.equal(posted.kind,'crash');assert.equal(posted.note.length,300);assert.equal(posted.channel,platform);
    assert.equal(detail.data.feedback.issue,initialIssue+1,'补充说明不重复计票');
    await detail.voteOk();assert.equal(detail.data.myVerdict,'ok');assert.equal(detail.data.feedback.issue,initialIssue);assert.equal(detail.data.feedback.ok,initialOk+1,'改投一减一加');
    await detail.voteOk();assert.equal(detail.data.myVerdict,'');assert.equal(detail.data.feedback.ok,initialOk,'撤销服务端计数');
  });

  test(`${platform}: 公告列表筛选、色条、已结束排后，公告详情去重上报与分享`,async()=>{
    fresh(folder);
    const list=await boot(page(folder,'announcements'));
    const notices=list.data.notices;assert.ok(notices.length>=4);
    const firstEnded=notices.findIndex(n=>n.ended);assert.ok(firstEnded>0);assert.ok(notices.slice(firstEnded).every(n=>n.ended),'已结束排在后面');
    assert.ok(notices.filter(n=>n.ended).every(n=>n.tone === 'ended' && !n.activePinned));
    assert.ok(notices.filter(n=>n.important && !n.ended).every(n=>n.tone === 'imp'));
    list.onCategory({currentTarget:{dataset:{id:'maintenance'}}});assert.ok(list.data.notices.length>0);assert.ok(list.data.notices.every(n=>n.category === 'maintenance'));
    assert.equal(list.onShareAppMessage().title,app.globalData.station.settings.site_name+' · 群公告');
    const first=notices[0];
    const detail=await boot(page(folder,'announcement'),{slug:first.slug});
    assert.equal(detail.data.notice.id,first.id);assert.ok(detail.data.notice.metaText.includes('发布'));assert.ok(detail.data.websiteLink.endsWith('/announcements/'+first.slug));
    assert.ok(detail.onShareAppMessage().path.includes(first.slug));
    await detail.load();assert.equal(mod(folder,'events').pending().filter(e=>e.event === 'ann_view').length,1);
    const c=mod(folder,'content');
    assert.equal(c.announcement({pinned:true,expires_at:'2020-01-01T00:00:00Z',published_at:'2026-10-11T00:00:00Z'}).activePinned,false);
    assert.equal(c.safeUrl('javascript:alert(1)'),'');assert.equal(c.safeUrl('https://user@evil.test'),'');
  });

  test(`${platform}: 搜索页即时结果、高亮、无结果提交想要的软件`,async()=>{
    fresh(folder);
    const search=await boot(page(folder,'search'));
    assert.equal(search.data.result,null);
    search.onInput({detail:{value:'网盘'}});await wait(320);
    assert.ok(search.data.result.software.some(s=>s.slug === 'yunpan'));
    search.onConfirm();assert.deepEqual(mod(folder,'storage').searches(),['网盘']);
    assert.deepEqual(mod(folder,'events').pending().filter(e=>e.event.startsWith('search')),[{event:'search',key:'网盘'}]);
    search.onInput({detail:{value:'完全不存在的软件xyz'}});search.run();search.report();
    assert.equal(search.data.result.total,0);assert.equal(mod(folder,'events').pending().at(-1).event,'search_miss');
    search.openWish();assert.equal(search.data.wishOpen,true);
    search.clearHistory();assert.deepEqual(search.data.history,[]);
    const prefilled=await boot(page(folder,'search'),{q:encodeURIComponent('云盘')});assert.ok(prefilled.data.result.software.length>0);
  });

  test(`${platform}: 想要的软件弹层校验、同名本机只提交一次`,async()=>{
    fresh(folder);
    let posted=[];interceptWrites(options=>{if(options.url.endsWith('/station/wishes')){posted.push(options.data);return {statusCode:201,data:{votes:3,status:'new'}};}return null;});
    const sheet=component(folder,'wish-sheet',{show:true});
    sheet.reset('a');assert.equal(sheet.data.canSubmit,false);assert.equal(await sheet.submit(),false);
    sheet.reset('某某输入法');sheet.toggleDevice({currentTarget:{dataset:{id:'tv'}}});sheet.onNote({detail:{value:'电视上看直播'}});
    assert.equal(await sheet.submit(),true);assert.deepEqual(posted,[{name:'某某输入法',platforms:['tv'],note:'电视上看直播'}]);
    assert.equal(mod(folder,'storage').wishes()[0].votes,3);assert.ok(sheet.events.some(e=>e.name === 'close'));
    sheet.reset('某某 输入法');assert.equal(await sheet.submit(),false);assert.equal(posted.length,1,'同一设备同名只提交一次');
  });

  test(`${platform}: 我的页统计、常用设备、提醒开关、说明文字`,async()=>{
    fresh(folder);
    const me=await boot(page(folder,'me'));
    assert.deepEqual(me.data.stats.map(s=>s.value),[0,0,0]);
    me.setDevice({currentTarget:{dataset:{id:'tv'}}});assert.equal(mod(folder,'storage').device(),'tv');assert.equal(me.data.device,'tv');
    me.onRemind({detail:{value:false}});assert.equal(me.data.remind,false);
    me.openText({currentTarget:{dataset:{kind:'privacy'}}});assert.equal(me.data.textTitle,'隐私说明');assert.ok(me.data.textBody.join('').includes('不收集个人信息'));
    me.openSync({currentTarget:{dataset:{mode:'create'}}});assert.equal(await me.createCode(),null);assert.equal(me.data.syncError,'还没有收藏，先去收藏几个软件吧');
    me.switchSync({currentTarget:{dataset:{mode:'restore'}}});me.onCodeInput({detail:{value:'o0o'}});assert.equal(await me.restoreCode(),null);assert.equal(me.data.syncError,'同步码不对，请检查后重试');
    me.planned();assert.ok(calls.at(-1).title.includes('即将推出'));
  });

  test(`${platform}: 组件：复制成功 / 失败兜底、广告标注与关闭、页面状态`,()=>{
    fresh(folder);
    const copy=component(folder,'copy-link',{value:'https://safe.test/download',toast:'链接已复制，请到浏览器粘贴打开'});copy.copy();
    assert.equal(copy.data.copied,true);assert.equal(calls.filter(c=>c.type === 'copy').at(-1).value,'https://safe.test/download');assert.equal(calls.filter(c=>c.type === 'toast').at(-1).title,'链接已复制，请到浏览器粘贴打开');assert.equal(copy.events[0].name,'copied');
    failClipboard=true;copy.copy();assert.equal(copy.data.manual,true);assert.equal(calls.filter(c=>c.type === 'toast').at(-1).title,'复制失败，请长按文字手动复制');copy.close();assert.equal(copy.data.manual,false);failClipboard=false;
    const fixture={id:'private-fixture',published:true,placements:['home_feed'],target_url:'https://advertiser.example.test',cover_url:'',title:'私有测试推广',starts_at:null,ends_at:null};
    const ad=component(folder,'ad-slot',{enabled:false,promotions:[fixture],placement:'home_feed'});ad.select();assert.equal(ad.data.promotion,null);
    ad.data.enabled=true;ad.select();assert.equal(ad.data.promotion.target_url,fixture.target_url);assert.equal(ad.data.variant,'feed');
    assert.deepEqual(mod(folder,'events').pending().filter(e=>e.event === 'ad_imp'),[], '宿主缺少可见性能力时不能虚报曝光');
    ad.click();assert.equal(calls.filter(c=>c.type === 'copy').at(-1).value,fixture.target_url);assert.deepEqual(mod(folder,'events').pending().at(-1),{event:'ad_click',key:'home_feed:private-fixture'});
    ad.close();assert.equal(ad.data.closed,true);ad.select();assert.equal(ad.data.promotion,null,'本次会话关闭后不再显示');
    resetApp();ad.select();ad.onError();assert.equal(ad.data.failed,true);
    ad.data.promotions=[{...fixture,ends_at:'2020-01-01T00:00:00Z'}];ad.select();assert.equal(ad.data.promotion,null);ad.lifetimes.detached.call(ad);
    const template=fs.readFileSync(path.join(folder,'components','ad-slot','index'+templateExt),'utf8');assert.ok(template.includes('>广告<'));assert.ok(!template.includes('推广<'));
    const state=component(folder,'page-state',{});state.retry();state.action();assert.deepEqual(state.events.map(e=>e.name),['retry','action']);
  });

  test(`${platform}: 广告可见不足一秒不计曝光，满足面积与时长只计一次`,async()=>{
    fresh(folder);
    const promotion={id:'visible-fixture',published:true,placements:['home_feed'],target_url:'https://advertiser.example.test',title:'可见性测试'};
    const ad=component(folder,'ad-slot',{enabled:true,promotions:[promotion],placement:'home_feed'});
    let visibility;
    ad.createIntersectionObserver=()=>({relativeToViewport(){return this;},observe(selector,callback){assert.equal(selector,'.ad');visibility=callback;},disconnect(){}});
    ad.select();
    visibility({intersectionRatio:.8});await wait(300);visibility({intersectionRatio:.1});await wait(800);
    assert.equal(mod(folder,'events').pending().filter(e=>e.event==='ad_imp').length,0);
    visibility({intersectionRatio:.5});await wait(1050);
    assert.equal(mod(folder,'events').pending().filter(e=>e.event==='ad_imp').length,1);
    visibility({intersectionRatio:1});await wait(1050);
    assert.equal(mod(folder,'events').pending().filter(e=>e.event==='ad_imp').length,1);
    ad.lifetimes.detached.call(ad);
  });

  test(`${platform}: 请求合并后保留本机请求标识，已收录状态与入口正确回流`,async()=>{
    fresh(folder);
    const store=mod(folder,'storage');store.addWish({id:'original-wish',name:'测试输入法',status:'new'});
    interceptWrites(options=>options.url.endsWith('/station/wishes/original-wish') ? {statusCode:200,data:{id:'merged-target',status:'added',votes:3,software_slug:'moji'}} : null);
    const me=await boot(page(folder,'me'));await me.refreshWishes();
    assert.equal(store.wishes()[0].id,'original-wish');assert.equal(store.wishes()[0].status,'added');assert.equal(store.wishes()[0].software_slug,'moji');
    me.openWishSoftware({currentTarget:{dataset:{slug:'moji'}}});assert.ok(calls.at(-1).url.includes('slug=moji'));
  });

  test(`${platform}: 同数量换一款收藏后不展示过时同步码`,async()=>{
    fresh(folder);
    const me=await boot(page(folder,'me'));const store=mod(folder,'storage');
    store.toggleFavorite('first');store.setSyncCode({code:'23456789AB',expires_at:new Date(Date.now()+86400000).toISOString(),fingerprint:JSON.stringify([['first'],''])});me.render();
    assert.ok(me.data.syncInfo);store.toggleFavorite('first');store.toggleFavorite('second');me.render();assert.equal(me.data.syncInfo,null);
  });

  test(`${platform}: 断网时底栏页面显示错误与重试；写请求不走缓存并让数据缓存失效`,async()=>{
    fresh(folder);
    failNetwork=true;
    const home=page(folder,'latest');home.onLoad({});await settle(home);assert.ok(home.data.error.includes('连接不上'));
    failNetwork=false;home.retry();await settle(home);assert.equal(home.data.error,'');
    const api=mod(folder,'api');
    const count=()=>calls.filter(c=>c.type === 'request' && c.url.endsWith('/station/data')).length;
    const before=count();await api.station(false);await api.station(false);assert.equal(count(),before,'30 秒内读缓存');
    interceptWrites(options=>options.url.endsWith('/station/feedback') ? {statusCode:204,data:''} : null);
    const version=app.globalData.stationVersion;
    assert.equal(await api.post('/station/feedback',{release_id:'x',verdict:'ok'},{invalidate:true}),null);
    assert.equal(app.globalData.station,null);assert.equal(app.globalData.stationVersion,version+1);
    assert.equal(calls.at(-1).method,'POST');assert.deepEqual(calls.at(-1).data,{release_id:'x',verdict:'ok'});
    await api.station(false);assert.equal(count(),before+1,'失效后重新读取');
    interceptWrites(()=>({statusCode:429,data:{detail:'太频繁'}}));
    await assert.rejects(api.post('/station/wishes',{name:'x'}),error=>error.statusCode === 429 && error.message.includes('太频繁'));
  });
}

// ---- 真实写入 API（每次运行只做一次，见文件头说明） ----
const wechat=path.join(root,'apps','miniprogram-wechat');

test('live API: 详情页「能正常用」真实提交一次反馈并刷新计数',async t=>{
  fresh(wechat);intercept=null;
  const detail=await boot(page(wechat,'detail'),{slug:'moji',platform:'desktop'});
  const before=detail.data.feedback.ok;const version=app.globalData.stationVersion;
  const ok=await detail.voteOk();
  if(!ok && calls.filter(c=>c.type === 'toast').at(-1)?.title === '提交太频繁，请稍后再试'){t.skip('API 匿名写入限流（反馈 + 想要合计 20 次/小时），稍后再跑');return;}
  assert.equal(ok,true,calls.filter(c=>c.type === 'toast').at(-1)?.title);
  assert.equal(detail.data.myVerdict,'ok');assert.equal(detail.data.feedback.ok,before+1);assert.equal(app.globalData.stationVersion,version+1,'反馈后站点数据缓存失效');
  assert.equal(mod(wechat,'storage').feedbackList()[0].verdict,'ok');
  const fresh_=await (await fetch(API+'/station/software/moji')).json();
  assert.ok(fresh_.releases.find(r=>r.id === detail._latest.id).feedback_ok>=1,'服务端计数已增加');
  await detail.voteOk();assert.equal(detail.data.myVerdict,'','再次点击撤销本机记录');
});

test('live API: 我的页生成同步码并在「另一台设备」恢复收藏',async t=>{
  fresh(wechat);intercept=null;
  const storage=mod(wechat,'storage');
  const data=await (await fetch(API+'/station/data')).json();
  const [a,b,c]=data.software;
  storage.toggleFavorite(a.id);storage.toggleFavorite(b.id);
  const me=await boot(page(wechat,'me'));
  me.openSync({currentTarget:{dataset:{mode:'create'}}});
  const created=await me.createCode();
  if(!created && me.data.syncError === '生成太频繁，请稍后再试'){t.skip('API 同步码生成限流（10 次/小时），稍后再跑');return;}
  assert.ok(created,me.data.syncError);assert.match(created.code,/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{10}$/);
  assert.match(me.data.created.code,/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);assert.equal(me.data.created.count,2);
  assert.equal(me.data.syncInfo.code,me.data.created.code,'卡片显示当前同步码');
  // 换一台设备：本机原有 1 个收藏（与同步码中的 b 重复 0 个），输入带空格、小写、短横线的码。
  storage.reset();storage.toggleFavorite(c.id);me.render();
  me.switchSync({currentTarget:{dataset:{mode:'restore'}}});
  const typed=me.onCodeInput({detail:{value:' '+created.code.slice(0,5).toLowerCase()+' - '+created.code.slice(5)+' '}});
  assert.equal(typed,created.code.slice(0,5)+'-'+created.code.slice(5));
  const added=await me.restoreCode();
  assert.deepEqual(added.sort(),[a.id,b.id].sort(),me.data.syncError);
  assert.deepEqual(storage.favorites().sort(),[a.id,b.id,c.id].sort(),'合并而不是覆盖');
  assert.equal(calls.filter(x=>x.type === 'toast').at(-1).title,'已恢复，新增 2 个收藏');
  assert.equal(mod(wechat,'feed').updateCount(data),0,'恢复的收藏视为已读');
  assert.deepEqual(mod(wechat,'events').pending().filter(e=>e.event === 'fav_add').map(e=>e.key).sort(),[a.id,b.id].sort());
  const restored=await (await fetch(API+'/station/sync-codes/'+created.code.toLowerCase())).json();assert.deepEqual(restored.software_ids.sort(),[a.id,b.id].sort());
});

test('live API: 小程序上报的事件名与 key 被服务端接受（204）',async()=>{
  fresh(wechat);intercept=null;
  const api=mod(wechat,'api');
  const data=await (await fetch(API+'/station/data')).json();
  const result=await api.post('/station/events',{events:[{event:'page_view',key:'me'},{event:'page_view',key:'search'},{event:'search_miss',key:'小程序自动化检查'}]});
  assert.equal(result,null);
  assert.ok(data.software.length>0);
});

test('trial/release builds require HTTPS and real AppIDs before changing output',()=>{
  const filename=path.join(root,'scripts/build-miniprograms.cjs');
  const source=fs.readFileSync(filename,'utf8').split('const sourceApp =')[0];
  const mockProcess={argv:['node',filename,'--env','release'],env:{MINIAPP_API_BASE:'',MINIAPP_WEBSITE_BASE:''}};
  assert.throws(()=>new Function('require','process','__dirname',source)(require,mockProcess,path.dirname(filename)),/HTTPS/);
  const noProjectConfig = name => name === 'node:fs' ? { readFileSync: () => JSON.stringify({appid:'touristappid'}) } : require(name);
  for (const environment of ['trial','release']) {
    const configured = {argv:['node',filename,'--env',environment],env:{MINIAPP_API_BASE:'https://updates.example.test/api/v1',MINIAPP_WEBSITE_BASE:'https://updates.example.test'}};
    assert.throws(()=>new Function('require','process','__dirname',source)(noProjectConfig,configured,path.dirname(filename)),/AppID/);
    configured.env.MINIAPP_WECHAT_APP_ID='wx-test-app-id';
    assert.throws(()=>new Function('require','process','__dirname',source)(noProjectConfig,configured,path.dirname(filename)),/xhs.*AppID/);
    configured.env.MINIAPP_XHS_APP_ID='xhs-test-app-id';
    assert.doesNotThrow(()=>new Function('require','process','__dirname',source)(noProjectConfig,configured,path.dirname(filename)));
  }
});
