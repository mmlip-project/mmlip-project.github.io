'use strict';
const $ = id => document.getElementById(id);
const state = {data:null, index:0, playing:!matchMedia('(prefers-reduced-motion: reduce)').matches, speed:1, last:0, output:null, token:0, az:-70, el:15};
const cache = new Map();
const canvas = $('radar'), ctx = canvas.getContext('2d');
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function syncPlay(){ $('play').textContent=state.playing?'Pause':'Play'; $('play').setAttribute('aria-label',state.playing?'Pause animation':'Play animation'); }
function evaluate(value){return value===true?['good','✓ Match']:value===false?['bad','≠ Mismatch']:['','Not evaluated'];}
function renderOutput(o){
 if(state.output===o)return;
 state.output=o;
 if(!o){$('retrieval-list').textContent='No prediction available yet.';$('tasks').replaceChildren();$('agreement').textContent='';return;}
 // Fixed [-1, 1] cosine scale; the bar represents positive magnitude on [0, 1].
 $('retrieval-list').innerHTML=o.retrieval_top5.map((r,i)=>`<div class="retrieval-row ${r.gt_match?'match':''}"><div class="row-content"><span class="rank">${i+1}</span><span class="description"><span class="action-chip">${escapeHTML(r.action)}</span>${escapeHTML(r.text)}</span><span class="score">${r.score.toFixed(3)}</span></div><div class="track" title="Positive cosine similarity on a fixed 0–1 scale"><span style="width:${Math.max(0,Math.min(1,r.score))*100}%"></span></div></div>`).join('');
 const items=[['Sentence generation','Captioning',o.sentence.text,o.sentence.correct,''],['Action recognition','Classification',o.action_rec.text,o.action_rec.correct,''],['QA · Action','Action question',o.qa.answer,o.qa.correct,state.data.questions.qa],['QA · Active limb','Body-part question',o.limb.answer,o.limb.correct,state.data.questions.limb]];
 $('tasks').innerHTML=items.map(([title,type,answer,correct,question])=>{const [style,label]=evaluate(correct);return `<article class="task"><h4>${title}</h4>${question?`<p class="question">${escapeHTML(question)}</p>`:''}<p class="answer">“${escapeHTML(answer)}”</p><div class="evaluation"><span>${type}</span><span class="result ${style}">${label}</span></div></article>`;}).join('');
 const a=o.agreement;$('agreement').textContent=a==null?'Not evaluated':`${Math.round(a*100)}% tasks match input GT`;$('agreement').className='badge'+(a===1?' good':'');
}
function currentOutput(frame){let output=null;for(const o of state.data.model_outputs){if(o.show_from_frame>frame)break;output=o;}return output;}
function update(){
 if(!state.data)return;
 const d=state.data,f=d.frames[state.index], segment=d.segments.find(s=>f.frame>=s.frames[0]&&f.frame<=s.frames[1]);
 $('timeline').value=state.index;
 $('frame-label').textContent=`Frame ${state.index+1} / ${d.frames.length}`;
 $('elapsed').textContent=`${(state.index/d.source.fps).toFixed(1)}s / ${((d.frames.length-1)/d.source.fps).toFixed(1)}s`;
 $('gt-action').textContent=segment?.action||d.gt.action;
 $('gt-limb').textContent=(segment?.limbs||d.gt.limbs).join(', ')||'Not annotated';
 renderOutput(currentOutput(f.frame));draw();
}
function draw(){
 if(!state.data)return;
 const {width:w,height:h}=canvas.getBoundingClientRect();if(!w||!h)return;
 const dpr=window.devicePixelRatio||1;
 if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.fillStyle='#ffffff';ctx.fillRect(0,0,w,h);
 const d=state.data, frame=d.frames[state.index],center=d.render.axes.center,half=d.render.axes.half;
 const az=state.az*Math.PI/180,el=state.el*Math.PI/180,scale=Math.min(w*.31,h*.32)/half;
 function project(p){const x=p[0]-center[0],y=p[1]-center[1],z=p[2]-center[2];const depth=Math.cos(az)*x+Math.sin(az)*y;return [w*.46+scale*(-Math.sin(az)*x+Math.cos(az)*y),h*.51-scale*(Math.cos(el)*z-Math.sin(el)*depth),Math.cos(el)*depth+Math.sin(el)*z];}
 function line(a,b,color,width=1){a=project(a);b=project(b);ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
 function label(p,text,dx=0,dy=0){const q=project(p);ctx.fillStyle='#687586';ctx.font='10px system-ui';ctx.textAlign='center';ctx.fillText(text,q[0]+dx,q[1]+dy);}
 const lo=center.map(v=>v-half),hi=center.map(v=>v+half);
 // Floor and rear grids retain the dataset's world-coordinate axes in meters.
 for(let i=0;i<=4;i++){const t=i/4,x=lo[0]+2*half*t,y=lo[1]+2*half*t,z=lo[2]+2*half*t;
 line([x,lo[1],lo[2]],[x,hi[1],lo[2]],'#d8dde5');line([lo[0],y,lo[2]],[hi[0],y,lo[2]],'#d8dde5');
 line([x,hi[1],lo[2]],[x,hi[1],hi[2]],'#e1e5eb');line([lo[0],hi[1],z],[hi[0],hi[1],z],'#e1e5eb');
 label([x,lo[1],lo[2]],x.toFixed(1),0,17);label([hi[0],y,lo[2]],y.toFixed(1),14,8);label([hi[0],hi[1],z],z.toFixed(1),15,0);
 }
 line(lo,[hi[0],lo[1],lo[2]],'#8995a6');line([hi[0],lo[1],lo[2]],[hi[0],hi[1],lo[2]],'#8995a6');line([hi[0],hi[1],lo[2]],hi,'#8995a6');
 label([center[0],lo[1],lo[2]],'x (m)',0,35);label([hi[0],center[1],lo[2]],'y (m)',32,20);label([hi[0],hi[1],center[2]],'z (m)',34,-12);
 const primitives=[];
 for(const p of frame.points){const pos=project(p),dop=d.render.doppler;const t=Math.min(1,Math.pow(Math.abs(p[3])/dop.vmax,dop.gamma));const fade=Math.round(255*(1-t));primitives.push({depth:pos[2],paint(){ctx.beginPath();ctx.arc(pos[0],pos[1],2.5,0,Math.PI*2);ctx.fillStyle=p[3]<0?`rgb(${fade},${fade},255)`:`rgb(255,${fade},${fade})`;ctx.fill();ctx.strokeStyle='#8994a644';ctx.lineWidth=.5;ctx.stroke();}});}
 d.render.bones.forEach(([a,b],i)=>{if(!frame.joints[a]||!frame.joints[b])return;primitives.push({depth:(project(frame.joints[a])[2]+project(frame.joints[b])[2])/2,paint(){line(frame.joints[a],frame.joints[b],d.render.colors[d.render.bone_side[i]],3);}});});
 for(const p of frame.joints){const pos=project(p);primitives.push({depth:pos[2]+.001,paint(){ctx.beginPath();ctx.arc(pos[0],pos[1],2.7,0,Math.PI*2);ctx.fillStyle='#17212e';ctx.fill();}});}
 primitives.sort((a,b)=>a.depth-b.depth).forEach(p=>p.paint());
 const bx=w-44,by=h*.32,bh=h*.33,gradient=ctx.createLinearGradient(0,by,0,by+bh);gradient.addColorStop(0,'#ff0000');gradient.addColorStop(.5,'#ffffff');gradient.addColorStop(1,'#0000ff');ctx.fillStyle=gradient;ctx.fillRect(bx,by,10,bh);ctx.strokeStyle='#9aa4b3';ctx.lineWidth=.7;ctx.strokeRect(bx,by,10,bh);ctx.fillStyle='#526071';ctx.font='9px system-ui';ctx.textAlign='right';ctx.fillText(`+${d.render.doppler.vmax.toFixed(2)}`,bx-4,by+4);ctx.fillText('0',bx-4,by+bh/2+3);ctx.fillText(`−${d.render.doppler.vmax.toFixed(2)}`,bx-4,by+bh);ctx.save();ctx.translate(w-13,by+bh/2);ctx.rotate(-Math.PI/2);ctx.textAlign='center';ctx.fillText('Doppler',0,0);ctx.restore();
}
async function loadSample(item,button){
 const token=++state.token;state.data=null;state.output=null;state.last=0;
 document.querySelectorAll('[role=tab]').forEach(t=>{const selected=t===button;t.setAttribute('aria-selected',selected);t.tabIndex=selected?0:-1;});
 $('demo-panel').hidden=true;$('demo-panel').setAttribute('aria-labelledby',button.id);$('status').textContent='Loading radar sequence…';$('action-title').textContent=item.action;$('sample-meta').textContent=`${item.dataset} · ${item.time.join('–')}`;
 try{
 let d=cache.get(item.id);if(!d){const r=await fetch(`demo-data/${item.data.split('/').map(encodeURIComponent).join('/')}`);if(!r.ok)throw new Error(`HTTP ${r.status}`);d=await r.json();d.model_outputs.sort((a,b)=>a.show_from_frame-b.show_from_frame);cache.set(item.id,d);}
 if(token!==state.token)return;
 state.data=d;state.index=0;state.az=d.render.view.azim;state.el=d.render.view.elev;$('timeline').max=d.frames.length-1;
 $('sample-meta').textContent=`${d.source.dataset} · ${d.source.sequence} · ${d.source.time.join('–')}`;
 $('status').textContent='';$('demo-panel').hidden=false;syncPlay();update();
 }catch(err){if(token!==state.token)return;$('status').textContent='Could not load this sequence. Select the tab again to retry.';console.error(err);}
}
$('play').addEventListener('click',()=>{state.playing=!state.playing;state.last=0;syncPlay();});
$('timeline').addEventListener('input',e=>{state.index=+e.target.value;state.last=0;update();});
$('speed').addEventListener('change',e=>{state.speed=+e.target.value;state.last=0;});
$('reset-view').addEventListener('click',()=>{if(!state.data)return;state.az=state.data.render.view.azim;state.el=state.data.render.view.elev;draw();});
let drag=null;
canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!drag)return;state.az+=(e.clientX-drag.x)*.4;state.el=Math.max(5,Math.min(75,state.el+(e.clientY-drag.y)*.3));drag={x:e.clientX,y:e.clientY};draw();});
for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,()=>drag=null);
new ResizeObserver(draw).observe(canvas);
document.addEventListener('visibilitychange',()=>state.last=0);
function animate(time){if(state.data&&state.playing&&!document.hidden){if(!state.last)state.last=time;const interval=1000/state.data.source.fps/state.speed;const steps=Math.floor((time-state.last)/interval);if(steps){state.index=(state.index+steps)%state.data.frames.length;state.last+=steps*interval;update();}}requestAnimationFrame(animate);}
async function init(){try{const response=await fetch('demo-data/index.json?v=20261029');if(!response.ok)throw new Error(`HTTP ${response.status}`);const samples=await response.json();
 // Group datasets in the requested order; preserve numbered clip order within each group.
 const datasetOrder={mmbody:0,mmfi:1,mri:2};
 samples.sort((a,b)=>(datasetOrder[a.dataset.toLowerCase()]??99)-(datasetOrder[b.dataset.toLowerCase()]??99)||a.data.localeCompare(b.data,undefined,{numeric:true}));
 const counts=new Map();
 samples.forEach((item,i)=>{const key=item.action+' '+item.dataset,n=(counts.get(key)||0)+1;counts.set(key,n);const b=document.createElement('button');b.type='button';b.className='tab';b.id=`sample-tab-${i}`;b.setAttribute('role','tab');b.setAttribute('aria-controls','demo-panel');b.setAttribute('aria-selected','false');b.tabIndex=-1;b.innerHTML=`${escapeHTML(item.action)}<small>${escapeHTML(item.dataset)}${n>1?` · ${n}`:''}</small>`;b.title=`${item.id} · ${item.time.join('–')}`;b.addEventListener('click',()=>loadSample(item,b));$('tabs').append(b);});
 $('tabs').addEventListener('keydown',e=>{const buttons=[...$('tabs').children],i=buttons.indexOf(document.activeElement);if(i<0)return;let next;if(e.key==='ArrowRight')next=(i+1)%buttons.length;else if(e.key==='ArrowLeft')next=(i-1+buttons.length)%buttons.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=buttons.length-1;else return;e.preventDefault();buttons[next].focus();buttons[next].click();});
 await loadSample(samples[0],$('tabs').firstElementChild);requestAnimationFrame(animate);
 }catch(err){$('status').textContent='Unable to load the demo index. Reload the page to retry.';console.error(err);}}
init();
