import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, cpSync, rmSync, chmodSync, statSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const updater = resolve('deploy/update.sh');

function fixture(t) {
  const dir=mkdtempSync(join(tmpdir(),'ofs-updater-')), app=join(dir,'app'), remote=join(dir,'remote.git'), state=join(dir,'state'), bin=join(dir,'bin'), log=join(dir,'events');
  for (const p of [app,state,bin]) mkdirSync(p);
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git(dir,'init','--bare',remote);git(app,'init','-b','main');git(app,'config','user.email','updater@example.test');git(app,'config','user.name','Updater fixture');
  mkdirSync(join(app,'deploy'));cpSync(updater,join(app,'deploy/update.sh'));
  mkdirSync(join(app,'src'));writeFileSync(join(app,'src','runtime.mjs'),'export const ready=true;');
  mkdirSync(join(app,'node_modules'));mkdirSync(join(app,'dist'));
  writeFileSync(join(app,'.gitignore'),'node_modules/\ndist/\n');
  writeFileSync(join(app,'package.json'),'{}');writeFileSync(join(app,'pnpm-lock.yaml'),'fixture');
  git(app,'add','.');git(app,'commit','-m','old');git(app,'remote','add','origin',remote);git(app,'push','-u','origin','main');
  const previous=git(app,'rev-parse','HEAD');
  writeFileSync(join(app,'release.txt'),'new release');git(app,'add','.');git(app,'commit','-m','release');git(app,'push','origin','main');
  const target=git(app,'rev-parse','HEAD');git(app,'reset','--hard',previous);
  // Reproduce the owner-only modes left by the original updater.
  chmodSync(join(app,'src'),0o700);chmodSync(join(app,'src','runtime.mjs'),0o600);
  writeFileSync(join(app,'node_modules','binary'),'fixture binary',{mode:0o700});
  writeFileSync(join(app,'dist','index.html'),'fixture page',{mode:0o600});
  writeFileSync(join(state,'service.sqlite'),'original native data');writeFileSync(join(state,'workspace.sqlite'),'original account data');writeFileSync(join(state,'service.sqlite-wal'),'retained WAL');
  const envfile=join(dir,'private.env');writeFileSync(envfile,'PRIVATE_FIXTURE=do-not-log-this\n',{mode:0o600});
  chmodSync(join(state,'service.sqlite'),0o600);chmodSync(join(state,'workspace.sqlite'),0o600);
  function shim(name,body) { writeFileSync(join(bin,name),`#!${process.execPath}\n${body}`,{mode:0o755}); }
  shim('id',`console.log('0');`);
  shim('flock',`if(process.env.FAIL_LOCK==='1')process.exit(1);`);
  shim('node',`if(process.argv[2]==='-p')console.log(process.env.FAKE_NODE_MAJOR||'24');else {const r=require('node:child_process').spawnSync(${JSON.stringify(process.execPath)},process.argv.slice(2),{stdio:'inherit'});process.exit(r.status??1);}`);
  shim('systemctl',`
    const fs=require('node:fs'),a=process.argv.slice(2);fs.appendFileSync(process.env.EVENT_LOG,'systemctl '+a.join(' ')+'\\n');
    if(a[0]==='show')console.log(a.includes('--property=LoadState')?'loaded':'0');
    else if(a[0]==='cat')console.log('[Service]\\nEnvironment=PRIVATE_FIXTURE=do-not-log-this');
    else if(a[0]==='start')fs.writeFileSync(process.env.RUNNING_FILE,'1');
    else if(a[0]==='stop') {try{fs.unlinkSync(process.env.RUNNING_FILE)}catch{}}
    else if(a[0]==='is-active')process.exit(fs.existsSync(process.env.RUNNING_FILE)?0:3);
  `);
  shim('pnpm',`
    const fs=require('node:fs'),a=process.argv.slice(2);
    if(a[0]==='--version'){console.log('11.20.0');process.exit(0)}
    fs.appendFileSync(process.env.EVENT_LOG,'pnpm '+a.join(' ')+'\\n');
    if(process.env.FAIL_STAGE===a.join(' '))process.exit(1);
  `);
  shim('curl',`
    const fs=require('node:fs'),url=process.argv.at(-1);fs.appendFileSync(process.env.EVENT_LOG,'curl '+url+'\\n');
    if(process.env.FAIL_CONNECT==='1')process.exit(7);
    if(process.env.FAIL_HEALTH==='1') {console.log('<html>proxy error</html>');process.exit(0)}
    console.log(url.endsWith('/healthz')?' {"status":"ok"}':'{"user":null,"setupRequired":false}');
  `);
  const env={...process.env,PATH:bin+':'+process.env.PATH,OFS_APP_DIR:app,OFS_STATE_DIR:state,OFS_ENV_FILE:envfile,OFS_BACKUP_ROOT:join(dir,'backups'),OFS_LOCK_FILE:join(dir,'update.lock'),OFS_INSTALL_PATH:join(dir,'installed','ofs-update'),EVENT_LOG:log,RUNNING_FILE:join(dir,'running')};
  const run=(extra={},args=[])=>spawnSync('bash',[updater,...args],{env:{...env,...extra},encoding:'utf8',timeout:20000});
  const events=()=>existsSync(log)?readFileSync(log,'utf8'):'';
  return {dir,app,state,env,git,previous,target,run,events};
}

test('updater backs up stopped state/config, fast-forwards, checks and restarts without losing data',t=>{
  const f=fixture(t),r=f.run();assert.equal(r.status,0,r.stdout+r.stderr);
  assert.equal(f.git(f.app,'rev-parse','HEAD'),f.target);
  assert.equal(readFileSync(join(f.state,'service.sqlite'),'utf8'),'original native data');
  const backup=r.stdout.match(/Stopped-service backup: (.+)/)[1];
  for(const file of ['service.sqlite','workspace.sqlite','service.sqlite-wal'])assert.equal(readFileSync(join(backup,'state',file),'utf8'),readFileSync(join(f.state,file),'utf8'));
  assert.match(readFileSync(join(backup,'environment.env'),'utf8'),/PRIVATE_FIXTURE/);
  assert.equal(readFileSync(join(backup,'previous-commit.txt'),'utf8').trim(),f.previous);
  assert.ok(existsSync(f.env.OFS_INSTALL_PATH));assert.ok(existsSync(f.env.RUNNING_FILE));
  const events=f.events();assert.ok(events.indexOf('systemctl stop')<events.indexOf('pnpm install'));assert.ok(events.indexOf('pnpm test')<events.indexOf('systemctl start'));assert.match(events,/curl .*\/api\/auth\/session/);
  assert.doesNotMatch(r.stdout+r.stderr,/do-not-log-this/);
  assert.equal(statSync(join(f.app,'src','runtime.mjs')).mode&0o444,0o444);
  assert.equal(statSync(join(f.app,'src')).mode&0o111,0o111);
  assert.equal(statSync(join(f.app,'node_modules','binary')).mode&0o111,0o111);
  assert.equal(statSync(join(f.app,'dist','index.html')).mode&0o444,0o444);
  assert.equal(statSync(join(f.state,'service.sqlite')).mode&0o777,0o600);
  assert.equal(statSync(f.env.OFS_ENV_FILE).mode&0o777,0o600);
  assert.equal(statSync(backup).mode&0o777,0o700);
});

test('updater preflight and dirty checkout rejection do not stop the service or alter commits',t=>{
  const f=fixture(t);let r=f.run({},['--check']);assert.equal(r.status,0,r.stdout+r.stderr);assert.doesNotMatch(f.events(),/systemctl stop|pnpm install/);
  writeFileSync(join(f.app,'package.json'),'local edits');r=f.run();assert.notEqual(r.status,0);assert.match(r.stderr,/local changes/);assert.equal(f.git(f.app,'rev-parse','HEAD'),f.previous);assert.doesNotMatch(f.events(),/systemctl stop/);
});

test('updater refuses an unsupported runtime or concurrent update before stopping service',t=>{
  const f=fixture(t);let r=f.run({FAKE_NODE_MAJOR:'22'});assert.notEqual(r.status,0);assert.match(r.stderr,/Node.js 24/);
  r=f.run({FAIL_LOCK:'1'});assert.notEqual(r.status,0);assert.match(r.stderr,/Another update/);assert.doesNotMatch(f.events(),/systemctl stop/);
});

test('updater failed tests retain the recovery snapshot and leave the service stopped',t=>{
  const f=fixture(t),r=f.run({FAIL_STAGE:'test'});assert.notEqual(r.status,0);assert.match(r.stderr,/automated tests/);assert.match(r.stderr,/Recovery files:/);assert.doesNotMatch(f.events(),/systemctl start/);assert.ok(!existsSync(f.env.RUNNING_FILE));
  const backup=r.stdout.match(/Stopped-service backup: (.+)/)[1];assert.equal(readFileSync(join(backup,'state','workspace.sqlite'),'utf8'),'original account data');
});

test('updater rejects a diverged main before stopping the service',t=>{
  const f=fixture(t);writeFileSync(join(f.app,'local.txt'),'diverged');f.git(f.app,'add','.');f.git(f.app,'commit','-m','local divergence');
  const r=f.run();assert.notEqual(r.status,0);assert.match(r.stderr,/Local main diverged/);assert.doesNotMatch(f.events(),/systemctl stop/);
});

test('updater rejects invalid health JSON after restart and leaves the new service stopped for recovery',t=>{
  const f=fixture(t),r=f.run({FAIL_HEALTH:'1'});assert.notEqual(r.status,0);assert.match(r.stderr,/restart and local health/);assert.match(f.events(),/systemctl start/);assert.ok(!existsSync(f.env.RUNNING_FILE));assert.ok(!existsSync(f.env.OFS_INSTALL_PATH));
});


test('updater connection failure reports once and retains private backup permissions',t=>{
  const f=fixture(t),r=f.run({FAIL_CONNECT:'1'});assert.notEqual(r.status,0);
  assert.equal((r.stderr.match(/Update failed during:/g)||[]).length,1,r.stderr);
  assert.equal((r.stderr.match(/Service remains stopped/g)||[]).length,1,r.stderr);
  assert.ok(!existsSync(f.env.RUNNING_FILE));
});
