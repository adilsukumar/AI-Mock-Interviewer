const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/lib/speech-recognition.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}
}).outputText;
const loaded = new Module(filename, module);
loaded._compile(compiled, filename);
const {createRecognitionController, checkMicrophoneAccess, speechErrorMessage, microphoneErrorMessage} = loaded.exports;

function fixture() {
  const events=[];
  const recognition={starts:0,stops:0,aborts:0,onstart:null,onend:null,onerror:null,
    start(){this.starts++;},stop(){this.stops++;},abort(){this.aborts++;}};
  let ready=true;
  const controller=createRecognitionController(recognition, {
    canListen:()=>ready,onListeningChange:v=>events.push(['listening',v]),
    onError:v=>events.push(['error',v]),onRecovered:()=>events.push(['recovered'])
  });
  return {recognition,controller,events,setReady:v=>ready=v};
}

test('permission check releases every capture track without starting recognition', async()=>{
  let stopped=0;
  await checkMicrophoneAccess({getUserMedia:async constraints=>{
    assert.deepEqual(constraints,{audio:true});
    return {getTracks:()=>[{stop:()=>stopped++},{stop:()=>stopped++}]};
  }});
  assert.equal(stopped,2);
});
test('permission denial is preserved and differs from speech-service denial',async()=>{
  const denied=Object.assign(new Error('denied'),{name:'NotAllowedError'});
  await assert.rejects(checkMicrophoneAccess({getUserMedia:async()=>{throw denied;}}),e=>e===denied);
  assert.match(microphoneErrorMessage(denied),/access was blocked/);
  assert.match(speechErrorMessage('service-not-allowed'),/permission can still be allowed/);
  assert.match(speechErrorMessage('network'),/service could not connect/);
});
test('restart requested during shutdown waits for onend, avoiding duplicate starts',()=>{
  const {recognition:r,controller:c}=fixture();
  c.start();r.onstart();c.stop();c.start();
  assert.equal(r.starts,1);assert.equal(r.stops,1);
  r.onend();assert.equal(r.starts,2);
});
test('fatal service failure does not enter an automatic restart loop; explicit retry works',()=>{
  const {recognition:r,controller:c,events}=fixture();
  c.start();r.onstart();r.onerror({error:'not-allowed'});r.onend();
  assert.equal(r.starts,1);assert.equal(events.filter(e=>e[0]==='error').length,1);
  c.start();r.onstart();assert.equal(r.starts,2);assert.deepEqual(events.at(-1),['listening',true]);
});
test('ordinary silence restarts listening without displaying permission errors',()=>{
  const {recognition:r,controller:c,events}=fixture();
  c.start();r.onstart();r.onerror({error:'no-speech'});r.onend();
  assert.equal(r.starts,2);assert.equal(events.filter(e=>e[0]==='error').length,0);
});
test('intentional stop and abort produce neither restart nor permission error',()=>{
  const {recognition:r,controller:c,events}=fixture();
  c.start();r.onstart();c.stop();r.onerror({error:'aborted'});r.onend();
  assert.equal(r.starts,1);assert.equal(events.filter(e=>e[0]==='error').length,0);
});
test('processing or ended-session guard prevents listening from restarting',()=>{
  const {recognition:r,controller:c,setReady}=fixture();
  setReady(false);c.start();assert.equal(r.starts,0);
  setReady(true);c.start();r.onstart();setReady(false);r.onend();
  assert.equal(r.starts,1);
});
test('cleanup detaches callbacks before aborting capture',()=>{
  const {recognition:r,controller:c}=fixture();
  c.start();c.dispose();c.start();
  assert.equal(r.starts,1);assert.equal(r.aborts,1);
  assert.equal(r.onstart,null);assert.equal(r.onend,null);assert.equal(r.onerror,null);
});
test('unanswered permission prompt times out, and a late grant still releases capture',async()=>{
  let grant;
  let stopped=0;
  const pending=new Promise(resolve=>grant=resolve);
  await assert.rejects(checkMicrophoneAccess({getUserMedia:()=>pending},5),e=>e.name==='TimeoutError');
  grant({getTracks:()=>[{stop:()=>stopped++}]});
  await pending;await Promise.resolve();
  assert.equal(stopped,1);
  assert.match(microphoneErrorMessage({name:'TimeoutError'}),/permission prompt/);
});
test('unexpected recognition abort offers recovery instead of silently remaining off',()=>{
  const {recognition:r,controller:c,events}=fixture();
  c.start();r.onstart();r.onerror({error:'aborted'});r.onend();
  assert.equal(r.starts,1);assert.equal(events.filter(e=>e[0]==='error').length,1);
});

test('network failure exposes its code for automatic server transcription fallback',()=>{
  const recognition={start(){},stop(){},abort(){},onstart:null,onend:null,onerror:null};
  let failure;
  const controller=createRecognitionController(recognition,{
    canListen:()=>true,onListeningChange(){},onRecovered(){},
    onError:(message,code)=>failure={message,code}
  });
  controller.start();recognition.onstart();recognition.onerror({error:'network'});
  assert.equal(failure.code,'network');
  assert.match(failure.message,/service could not connect/);
});
