const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const postcss=require('postcss');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const app={globalData:{station:null,fetchedAt:0}};
const calls=[];
let failNetwork=false, failClipboard=false;
const sdk={
  request(options){calls.push({type:'request',url:options.url});if(failNetwork){options.fail({errMsg:'offline'});return;}fetch(options.url).then(async response=>options.success({statusCode:response.status,data:await response.json()})).catch(error=>options.fail(error));},
  getAccountInfoSync(){return {miniProgram:{envVersion:'develop'}};},getDeviceInfo(){return {platform:'android'};},getSystemInfoSync(){return {platform:'android'};},
  stopPullDownRefresh(){},setNavigationBarTitle(){},showShareMenu(options){calls.push({type:'shareMenu',options});},showToast(){},pageScrollTo(){},previewImage(){},
  navigateTo(options){calls.push({type:'navigate',url:options.url});},switchTab(options){calls.push({type:'tab',url:options.url});},
  setClipboardData(options){if(failClipboard)options.fail({errMsg:'denied'});else{calls.push({type:'copy',value:options.data});options.success();}}
};
global.wx=sdk;global.xhs=sdk;global.getApp=()=>app;
function instance(definition){const result={...definition,data:structuredClone(definition.data || {})};if(definition.methods)Object.assign(result,definition.methods);result.setData=function(patch){for(const [key,value] of Object.entries(patch)){const parts=key.replace(/\[(\d+)\]/g,'.$1').split('.');let item=this.data;for(const segment of parts.slice(0,-1)){item[segment]??={};item=item[segment];}item[parts.at(-1)]=value;}};return result;}
function page(folder,name){let definition;global.Page=value=>definition=value;const file=path.join(folder,'pages',name,'index.js');delete require.cache[require.resolve(file)];require(file);assert.ok(definition);return instance(definition);}
function component(folder,name,properties){let definition;global.Component=value=>definition=value;const file=path.join(folder,'components',name,'index.js');delete require.cache[require.resolve(file)];require(file);const item=instance(definition);for(const [name,property] of Object.entries(definition.properties || {}))item.data[name]=typeof property==='object' ? property.value : undefined;Object.assign(item.data,properties);return item;}
async function boot(item,options={}){item.onLoad(options);const deadline=Date.now()+12000;while(item.data.loading && Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,15));assert.equal(item.data.loading,false);assert.equal(item.data.error,'');return item;}
function files(folder){return fs.readdirSync(folder,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(folder,entry.name)):[path.join(folder,entry.name)]);}
for(const platform of ['wechat','xhs']) {
  const folder=path.join(root,'apps','miniprogram-'+platform);
  test(`${platform}: native project contains valid pages, components, icons and scripts`,()=>{
    const config=JSON.parse(fs.readFileSync(path.join(folder,'app.json'),'utf8'));
    const templateExt=platform === 'xhs' ? '.xhsml' : '.wxml';
    const styleExt=platform === 'xhs' ? '.css' : '.wxss';
    assert.equal(config.pages.length,5);
    for(const p of config.pages)for(const ext of ['.json','.js',templateExt,styleExt])assert.ok(fs.existsSync(path.join(folder,p+ext)),p+ext);
    for(const item of config.tabBar.list)for(const field of ['iconPath','selectedIconPath'])assert.ok(fs.statSync(path.join(folder,item[field])).size>0);
    for(const file of files(folder)){
      const contents=fs.readFileSync(file,'utf8');
      if(file.endsWith('.json'))JSON.parse(contents);
      if(file.endsWith('.js'))new vm.Script(contents,{filename:file});
      if(file.endsWith(styleExt))postcss.parse(contents,{from:file});
      if(platform === 'xhs' && file.endsWith('.xhsml'))assert.ok(!contents.includes('wx:'));
      assert.ok(!file.endsWith('.xhsml') || contents.includes('<'));
    }
    const adapter=fs.readFileSync(path.join(folder,'utils','platform.js'),'utf8');
    assert.ok(adapter.includes(platform === 'xhs' ? 'typeof xhs' : 'typeof wx'));
  });
  test(`${platform}: template event handlers exist on the actual page and component definitions`,()=>{
    for(const name of ['latest','software','detail','announcements','announcement']) {
      const item=page(folder,name);
      const template=fs.readFileSync(path.join(folder,'pages',name,'index'+(platform === 'xhs' ? '.xhsml' : '.wxml')),'utf8');
      for(const match of template.matchAll(/\b(?:bind|catch)[a-z:-]+="([a-zA-Z][a-zA-Z0-9]*)"/g))assert.equal(typeof item[match[1]],'function',`${name}: ${match[1]}`);
    }
    for(const name of ['app-icon','copy-link','page-state','ad-slot']) {
      const item=component(folder,name,{});
      const template=fs.readFileSync(path.join(folder,'components',name,'index'+(platform === 'xhs' ? '.xhsml' : '.wxml')),'utf8');
      for(const match of template.matchAll(/\b(?:bind|catch)[a-z:-]+="([a-zA-Z][a-zA-Z0-9]*)"/g))assert.equal(typeof item[match[1]],'function',`${name}: ${match[1]}`);
    }
  });
  test(`${platform}: live homepage filters aliases and device-specific version links`,async()=>{
    app.globalData.station=null;calls.length=0;
    const home=await boot(page(folder,'latest'));
    assert.ok(home.data.software.length>=6);assert.ok(home.data.releases.length>=8);
    assert.equal(home.data.settings.ads_enabled,false);
    assert.equal(home.data.pinned?.ended,false);
    const source=app.globalData.station.software[0];
    home.onSearch({detail:{value:source.aliases[0] || source.name}});
    assert.ok(home.data.software.some(s=>s.id===source.id));
    home.clear();home.onPlatform({currentTarget:{dataset:{id:'tv'}}});
    assert.ok(home.data.releases.length>0);assert.ok(home.data.releases.every(r=>r.platform==='tv'));
    const release=home.data.releases[0];home.openSoftware({currentTarget:{dataset:{slug:release.slug,platform:release.platform,release:release.id}}});
    assert.ok(calls.at(-1).url.includes('platform=tv'));assert.ok(calls.at(-1).url.includes(release.id));
    home.onSearch({detail:{value:'不存在的软件999'}});assert.equal(home.data.software.length,0);home.clear();assert.ok(home.data.releases.length>=8);
  });
  test(`${platform}: live detail preserves platform, historical versions, download pairs and share path`,async()=>{
    const detail=await boot(page(folder,'detail'),{slug:'guangmu',platform:'tv'});
    assert.equal(detail.data.platform,'tv');assert.ok(detail.data.history.length>0);assert.equal(detail.data.primary,null);
    const old=detail.data.history[0];detail.selectHistory({currentTarget:{dataset:{id:old.id}}});
    assert.equal(detail.data.release.id,old.id);assert.equal(detail.data.release.latest,false);
    assert.ok(detail.onShareAppMessage().path.includes(old.id));assert.ok(detail.data.websiteLink.includes('platform=tv'));
    detail.onPlatform({currentTarget:{dataset:{id:'android'}}});assert.equal(detail.data.platform,'android');assert.notEqual(detail.data.release.id,old.id);
    // Distinct private test fixtures exercise version/link isolation without publishing dummy addresses.
    const records=detail._releases.filter(r=>r.platform==='tv');assert.ok(records.length>1);
    records[0].links=[{label:'最新测试入口',url:'https://download.example.test/new',code:'NEW1',is_primary:true}];
    records[1].links=[{label:'历史测试入口',url:'https://download.example.test/old',code:'OLD1',is_primary:true}];
    const oldStatus=detail._detail.software.status;detail._detail.software.status='normal';records[0].status='normal';records[1].status='normal';
    detail.choose('tv',records[0].id);assert.equal(detail.data.primary.code,'NEW1');detail.choose('tv',records[1].id);assert.equal(detail.data.primary.code,'OLD1');assert.ok(detail.data.primary.url.endsWith('/old'));
    records[1].status='unavailable';detail.choose('tv',records[1].id);assert.equal(detail.data.primary,null);assert.equal(detail.data.backups.length,0);detail._detail.software.status=oldStatus;
    const previous=detail.data.release.id;failNetwork=true;await detail.load();assert.ok(detail.data.error.includes('连接不上'));assert.equal(detail.data.release.id,previous);failNetwork=false;
  });
  test(`${platform}: announcements expire out of pinning and open as directly shared details`,async()=>{
    const c=require(path.join(folder,'utils/content'));
    const expired={pinned:true,expires_at:'2020-01-01T00:00:00Z',body:'第一段\n第二段',images:[],links:[],published_at:'2026-10-11T00:00:00Z'};
    assert.equal(c.announcement(expired).activePinned,false);assert.equal(c.announcement(expired).ended,true);assert.equal(c.date('2026-10-10T18:00:00Z'),'2026.10.11');
    const notices=await boot(page(folder,'announcements'));assert.ok(notices.data.notices.length>=4);assert.ok(notices.data.notices.some(n=>n.ended));
    const first=notices.data.notices[0];const notice=await boot(page(folder,'announcement'),{slug:first.slug});assert.equal(notice.data.notice.id,first.id);assert.ok(notice.onShareAppMessage().path.includes(first.slug));
    assert.equal(c.safeUrl('javascript:alert(1)'), '');assert.equal(c.safeUrl('https://safe.test/file'),'https://safe.test/file');
  });
  test(`${platform}: clipboard success and failure expose useful feedback`,()=>{
    const copy=component(folder,'copy-link',{value:'https://safe.test/download'});copy.copy();assert.equal(copy.data.copied,true);assert.equal(calls.at(-1).value,'https://safe.test/download');
    failClipboard=true;copy.copy();assert.equal(copy.data.manual,true);copy.close();assert.equal(copy.data.manual,false);failClipboard=false;
  });
  test(`${platform}: advertising stays independent, expires and collapses on image failure`,()=>{
    const fixture={id:'private-fixture',published:true,placements:['home_feed'],target_url:'https://advertiser.example.test',cover_url:'',title:'私有测试推广',starts_at:null,ends_at:null};
    const ad=component(folder,'ad-slot',{enabled:false,promotions:[fixture],placement:'home_feed'});ad.select();assert.equal(ad.data.promotion,null);
    ad.data.enabled=true;ad.select();assert.equal(ad.data.promotion.target_url,fixture.target_url);ad.onError();assert.equal(ad.data.failed,true);
    ad.data.promotions=[{...fixture,ends_at:'2020-01-01T00:00:00Z'}];ad.select();assert.equal(ad.data.promotion,null);ad.lifetimes.detached.call(ad);
  });
}
test('release builds reject missing HTTPS configuration instead of silently connecting to local data',()=>{
  const result=spawnSync(process.execPath,['scripts/build-miniprograms.cjs','--env','release'],{cwd:root,env:{...process.env,MINIAPP_API_BASE:'',MINIAPP_WEBSITE_BASE:''},encoding:'utf8'});
  assert.notEqual(result.status,0);assert.ok(result.stderr.includes('HTTPS'));
});
