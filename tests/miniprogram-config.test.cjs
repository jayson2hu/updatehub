// Exercise the real command boundary without writing either generated project.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');

const root=path.resolve(__dirname,'..');
const script=path.join(root,'scripts/build-miniprograms.cjs');
const env={...process.env,MINIAPP_API_BASE:'https://updates.example.test/api/v1',MINIAPP_WEBSITE_BASE:'https://updates.example.test',MINIAPP_WECHAT_APP_ID:'wx-config-fixture',MINIAPP_XHS_APP_ID:'xhs-config-fixture'};
function run(args,override={}) {
  const result=spawnSync(process.execPath,[script,...args],{cwd:root,env:{...env,...override},encoding:'utf8',windowsHide:true});
  assert.ifError(result.error);
  return result;
}
function digest(folder) {
  const hash=crypto.createHash('sha256');
  function walk(current) {
    for(const item of fs.readdirSync(current,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
      const file=path.join(current,item.name);
      if(item.isDirectory()) walk(file);
      else {hash.update(path.relative(folder,file));hash.update(fs.readFileSync(file));}
    }
  }
  walk(folder);return hash.digest('hex');
}
const projects=['wechat','xhs'].map(platform=>path.join(root,'apps',`miniprogram-${platform}`));
const before=projects.map(digest);
test.after(()=>assert.deepEqual(projects.map(digest),before,'配置检查或失败构建不能修改已有小程序产物'));

test('release preflight normalizes trailing slashes without generating output',()=>{
  const result=run(['--env','release','--check'],{MINIAPP_API_BASE:env.MINIAPP_API_BASE+'/',MINIAPP_WEBSITE_BASE:env.MINIAPP_WEBSITE_BASE+'/'});
  assert.equal(result.status,0,result.stderr);
  const info=JSON.parse(result.stdout);
  assert.equal(info.apiBase,env.MINIAPP_API_BASE);assert.equal(info.websiteBase,env.MINIAPP_WEBSITE_BASE);
  assert.deepEqual(info.platforms,['wechat','xhs']);assert.equal(info.environment,'release');
  assert.ok(!result.stdout.includes(env.MINIAPP_WECHAT_APP_ID),'不要输出 AppID');
});

test('malformed URL and credentials fail before any build write and do not leak values',()=>{
  for(const value of ['https://','https:///updates.example.test','https://name:private-fixture@updates.example.test/api/v1','https://updates.example.test/api/v1?token=private-fixture','https://updates.example.test/api/v1#fragment','https://updates.example.test\\api',' https://updates.example.test/api/v1','ftp://updates.example.test']) {
    const result=run(['--env','release'],{MINIAPP_API_BASE:value});
    assert.notEqual(result.status,0,'无效地址不能构建：'+value.split('@').at(-1));
    assert.ok(!result.stderr.includes('private-fixture'),'错误输出不得泄漏地址凭据');
  }
});

test('trial and release reject HTTP, loopback and wildcard services',()=>{
  for(const mode of ['trial','release']) for(const value of ['http://updates.example.test/api/v1','https://localhost/api/v1','https://127.0.0.1/api/v1','https://[::1]/api/v1','https://0.0.0.0/api/v1']) {
    const result=run(['--env',mode],{MINIAPP_API_BASE:value});assert.notEqual(result.status,0);
  }
});

test('website base must be a root origin; API can have a reverse proxy prefix',()=>{
  assert.notEqual(run(['--env','release'],{MINIAPP_WEBSITE_BASE:env.MINIAPP_WEBSITE_BASE+'/software'}).status,0);
  assert.equal(run(['--env','release','--check'],{MINIAPP_API_BASE:'https://api.example.test/service/api/v1/'}).status,0);
});

test('unknown, duplicate or missing options cannot silently produce a develop build',()=>{
  for(const args of [['--en','release'],['--env'],['--target','--env','release'],['--env','release','--env','develop'],['--check','--check'],['--target','other'],['--check','extra']]) assert.notEqual(run(args).status,0);
});

test('develop allows local services while keeping credentials out of shipped config',()=>{
  const local={MINIAPP_API_BASE:'http://127.0.0.1:8010/api/v1/',MINIAPP_WEBSITE_BASE:'http://localhost:3011/'};
  const result=run(['--env','develop','--check'],local);assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(result.stdout).apiBase,'http://127.0.0.1:8010/api/v1');
  assert.notEqual(run(['--env','develop'],{...local,MINIAPP_WEBSITE_BASE:'http://person:private-fixture@localhost:3011'}).status,0);
});

test('both release AppIDs are validated before any selected project is written',()=>{
  assert.notEqual(run(['--env','release'],{MINIAPP_XHS_APP_ID:'touristappid'}).status,0);
  assert.notEqual(run(['--env','release'],{MINIAPP_WECHAT_APP_ID:'wx invalid id'}).status,0);
  assert.equal(run(['--target','wechat','--env','release','--check'],{MINIAPP_XHS_APP_ID:'touristappid'}).status,0);
});
