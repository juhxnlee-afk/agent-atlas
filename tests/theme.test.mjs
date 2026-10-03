import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source=readFileSync(new URL('../assets/theme.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/styles.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function boot({saved=null,dark=false,blocked=false}={}) {
  const root={dataset:{}}, events={}, color={value:null,setAttribute(_key,value){this.value=value;}}, select={value:'',addEventListener(_event,fn){this.change=fn;}}, store=new Map([['agent-atlas-theme',saved]]);
  const media={matches:dark,addEventListener(_event,fn){this.change=fn;}};
  const document={documentElement:root,querySelector:selector=>selector==='#theme-select'?select:color,addEventListener(event,fn){events[event]=fn;}};
  const localStorage={getItem:key=>{if(blocked)throw Error('denied');return store.get(key);},setItem:(key,value)=>{if(blocked)throw Error('denied');store.set(key,value);}};
  runInNewContext(source,{document,window:{matchMedia:()=>media},localStorage});
  return {root,events,color,select,store,media};
}
test('Theme applies before stylesheet paint and follows system by default',()=>{
  assert.ok(html.indexOf('assets/theme.js')<html.indexOf('assets/styles.css'));
  const app=boot({dark:true});assert.equal(app.root.dataset.theme,'dark');assert.equal(app.color.value,'#111a16');
  app.events.DOMContentLoaded();assert.equal(app.select.value,'system');
  app.media.matches=false;app.media.change();assert.equal(app.root.dataset.theme,'light');
});
test('Explicit light/dark choices persist and ignore system changes',()=>{
  const app=boot({saved:'light',dark:true});assert.equal(app.root.dataset.theme,'light');app.events.DOMContentLoaded();
  app.select.value='dark';app.select.change();assert.equal(app.root.dataset.theme,'dark');assert.equal(app.store.get('agent-atlas-theme'),'dark');
  app.media.matches=false;app.media.change();assert.equal(app.root.dataset.theme,'dark');
  assert.equal(boot({saved:app.store.get('agent-atlas-theme')}).root.dataset.theme,'dark');
  app.select.value='system';app.select.change();assert.equal(app.root.dataset.theme,'light');
});
test('Invalid saved preferences and unavailable storage do not break theme selection',()=>{
  assert.equal(boot({saved:'invalid'}).root.dataset.themePreference,'system');
  const app=boot({blocked:true,dark:true});app.events.DOMContentLoaded();app.select.value='light';app.select.change();assert.equal(app.root.dataset.theme,'light');
});
function luminance(hex){const rgb=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
test('Both themes meet AA normal-text contrast for shared surface and state tokens',()=>{
  for(const selector of [':root',':root[data-theme="dark"]']) {
    const block=css.slice(css.indexOf(`${selector} {`)).split('}')[0];
    const tokens=Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[\da-f]{6})/g)].map(m=>[m[1],m[2]]));
    const pairs=[...['bg','surface','surface-soft','surface-hover'].flatMap(bg=>['ink','muted','faint'].map(fg=>[fg,bg])),['accent','accent-soft'],['hero-text','hero'],['hero-muted','hero'],['hero-accent','hero'],['stats-ink','stats-bg'],['warning-ink','warning-bg']];
    for(const [fg,bg] of pairs)assert.ok(contrast(tokens[fg],tokens[bg])>=4.5,`${selector}: ${fg}/${bg} contrast ${contrast(tokens[fg],tokens[bg]).toFixed(2)}`);
  }
});
