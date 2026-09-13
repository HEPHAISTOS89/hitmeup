const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const STORAGE='hmu-avatar-v4';
const faceNames=['Default','Happy','Playful'];
const topNames={male:['Original jacket','Utility overshirt','Star tee'],female:['Red jacket','Star tee','Teal hoodie']};
const bottomNames={male:['Black cargos','Baggy denim','Street shorts'],female:['Black cargos','Tartan skirt','Baggy denim']};
const faceKeys=['default','happy','playful'];
const freshLook=()=>({top:0,bottom:0,face:0,equipped:[],fit:{}});
let state={premium:false,character:'male',looks:{male:freshLook(),female:freshLook()},background:'signal'};
let category='outfits',adjusting=null,ready=false,toastTimer,pendingPremium=null;
const premiumExtras=new Set(['beanie','bag','wallet','stars','choker']);
const premiumBackgrounds=new Set(['burst','wave','grid']);
const isPremium=(type,value)=>type==='top'||type==='bottom'?value===2:type==='accessory'?premiumExtras.has(value):type==='background'?premiumBackgrounds.has(value):false;
function requirePremium(type,value,action){if(!state.premium&&isPremium(type,value)){pendingPremium=action;openPremium();return true}return false}
function openPremium(){const on=state.premium;$('#premium-title').textContent=on?'Premium preview is on.':'Make a little more noise.';$('#premium-copy').textContent=on?'You can use the full collection. Turn the preview off to return to free options.':'Unlock exclusive clothing, accessories, and graphic backgrounds.';$('#premium-action').textContent=on?'Turn off premium preview':'Enable premium preview ↗';$('#premium-dialog').showModal()}
function turnOffPremium(){state.premium=false;for(const gender of ['male','female']){const l=state.looks[gender];if(l.top===2)l.top=0;if(l.bottom===2)l.bottom=0;l.equipped=l.equipped.filter(id=>!premiumExtras.has(id))}if(premiumBackgrounds.has(state.background))state.background='signal';dirty();renderAll()}
function premiumBadge(){const s=document.createElement('span');s.className='premium-badge';s.textContent='✦ Premium';return s}
const sprites=new Map(),characters=new Map(),available={male:false,female:false},loadedAtlases={male:false,female:false};
const look=()=>state.looks[state.character];
const accessories=[
 {id:'frames',name:'Clear frames',group:'eyewear',cell:[40,135,550,182],source:'classic',x:.50,y:.155,width:.42,order:5},
 {id:'shades',name:'Shades',group:'eyewear',cell:[647,134,573,190],source:'classic',x:.50,y:.155,width:.42,order:5},
 {id:'headphones',name:'Headphones',cell:[38,357,560,460],source:'classic',x:.50,y:.113,width:.63,order:4},
 {id:'cap',name:'Star cap',group:'headwear',cell:[681,421,516,365],source:'classic',x:.50,y:.065,width:.65,order:3},
 {id:'chain',name:'Star chain',group:'neckwear',cell:[145,820,345,392],source:'classic',x:.50,y:.29,width:.20,order:2},
 {id:'hoops',name:'Gold hoops',group:'earrings',cell:[724,927,422,201],source:'classic',pair:true,x:.50,y:.185,width:.063,spread:.205,order:1},
 {id:'bow',name:'Red bow',source:'extra',slot:0,x:.69,y:.065,width:.24,order:6},
 {id:'hearts',name:'Heart frames',group:'eyewear',source:'extra',slot:1,x:.50,y:.155,width:.43,order:5},
 {id:'stars',name:'Star earrings',group:'earrings',source:'extra',slot:2,pair:true,x:.50,y:.20,width:.055,spread:.205,order:1},
 {id:'beanie',name:'Night beanie',group:'headwear',source:'extra',slot:3,x:.50,y:.055,width:.65,heightScale:.62,order:3},
 {id:'bag',name:'Crossbody bag',source:'extra',slot:4,x:.50,y:.43,width:.57,order:2},
 {id:'cuff',name:'Studded cuff',source:'extra',slot:5,x:.88,y:.575,width:.125,order:6},
 {id:'clips',name:'Cherry clips',source:'extra',slot:6,x:.69,y:.10,width:.14,order:6},
 {id:'choker',name:'Star choker',group:'neckwear',source:'extra',slot:7,x:.50,y:.253,width:.23,order:2},
 {id:'wallet',name:'Wallet chain',source:'extra',slot:8,x:.67,y:.58,width:.20,order:2}
];
const extraCells=[[48,56,323,344],[418,134,418,180],[904,70,254,307],[26,469,388,351],[449,416,355,454],[875,542,325,229],[47,911,341,244],[444,935,368,244],[886,879,322,322]];
const collections={male:['frames','shades','headphones','cap','beanie','chain','hoops','bag','cuff','wallet'],female:['hearts','frames','shades','headphones','bow','clips','stars','hoops','choker','chain','bag','beanie']};
const byId=id=>accessories.find(a=>a.id===id);
const backgrounds=[
 {id:'signal',name:'Signal orange',color:'#ed4d25'}, {id:'petrol',name:'Petrol blue',color:'#527b7a'},
 {id:'gold',name:'Golden hour',color:'#b8934b'}, {id:'purple',name:'Purple haze',color:'#8d638e'},
 {id:'dark',name:'After dark',color:'#343934'}, {id:'rose',name:'Rose paper',color:'#d8afaa'},
 {id:'check',name:'Checkmate',color:'#ef4d24',pattern:'check'}, {id:'burst',name:'Noise burst',color:'#ed4d25',pattern:'burst'},
 {id:'dots',name:'Dot matrix',color:'#ddd09e',pattern:'dots'}, {id:'wave',name:'Sound wave',color:'#497e80',pattern:'wave'},
 {id:'tape',name:'Cut & paste',color:'#d8b0c1',pattern:'tape'}, {id:'grid',name:'Midnight grid',color:'#202b36',pattern:'grid'}
];
function notify(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3000)}
function dirty(){$('#save-state').textContent='Unsaved changes'}
function fitFor(id){return look().fit[id]||{x:0,y:0,scale:1}}
function compatible(ids,gender){const result=[];for(const id of ids){const item=byId(id);if(!item||!collections[gender].includes(id))continue;if(item.group){const old=result.findIndex(v=>byId(v).group===item.group);if(old>=0)result.splice(old,1)}if(!result.includes(id))result.push(id)}return result}
function readSaved(){
 try{
  const saved=JSON.parse(localStorage.getItem(STORAGE));
  if(saved){state.premium=saved.premium===true;
   if(['male','female'].includes(saved.character))state.character=saved.character;
   if(backgrounds.some(b=>b.id===saved.background))state.background=saved.background;
   for(const gender of ['male','female']){const source=saved.looks?.[gender];if(!source)continue;const target=state.looks[gender];if(Number.isInteger(source.outfit)&&source.top===undefined){target.top=source.outfit;target.bottom=gender==='male'?(source.outfit===2?1:0):(source.outfit===1?1:0)}
    for(const key of ['top','bottom','face'])if(Number.isInteger(source[key])&&source[key]>=0&&source[key]<3)target[key]=source[key];
    if(Array.isArray(source.equipped))target.equipped=compatible(source.equipped,gender);
    for(const id of collections[gender]){const f=source.fit?.[id];if(f&&[f.x,f.y,f.scale].every(Number.isFinite))target.fit[id]={x:Math.max(-50,Math.min(50,f.x)),y:Math.max(-50,Math.min(50,f.y)),scale:Math.max(.6,Math.min(1.5,f.scale))}}
   }$('#save-state').textContent='Saved looks loaded';
  }else{
   const previous=JSON.parse(localStorage.getItem('hmu-profile-v3'));
   if(previous){if(Array.isArray(previous.equipped))state.looks.male.equipped=compatible(previous.equipped,'male');if(Number.isInteger(previous.background)&&previous.background>=0&&previous.background<6)state.background=backgrounds[previous.background].id;}
  }
 }catch{}
 if(!state.premium){for(const gender of ['male','female']){const l=state.looks[gender];if(l.top===2)l.top=0;if(l.bottom===2)l.bottom=0;l.equipped=l.equipped.filter(id=>!premiumExtras.has(id))}if(premiumBackgrounds.has(state.background))state.background='signal'}adjusting=look().equipped.at(-1)||null;
}
function save(){try{localStorage.setItem(STORAGE,JSON.stringify(state));localStorage.removeItem('hmu-profile-v3');localStorage.removeItem('hmu-profile-v1');$('#save-state').textContent='Both looks saved on this device';notify('Your looks are saved.');return {saved:true}}catch{notify('Could not save. Enable browser storage and try again.');return {saved:false}}}
function sourceCutout(image,rect,matte='white'){
 const c=document.createElement('canvas');c.width=rect[2];c.height=rect[3];const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(image,...rect,0,0,c.width,c.height);
 const p=x.getImageData(0,0,c.width,c.height),d=p.data;
 for(let i=0;i<d.length;i+=4){const high=Math.max(d[i],d[i+1],d[i+2]),low=Math.min(d[i],d[i+1],d[i+2]);if(low>(matte==='checker'?155:195)&&high-low<22)d[i+3]=0}
 x.putImageData(p,0,0);return c;
}
function bounds(c){const w=c.width,h=c.height,d=c.getContext('2d').getImageData(0,0,w,h).data;let l=w,t=h,r=-1,b=-1;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(d[(y*w+x)*4+3]>100){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y)}if(r<l)throw Error('Empty artwork');return [l,t,r-l+1,b-t+1]}
function sprite(canvas){return {canvas,bounds:bounds(canvas)}}
function centered(ctx,s,x,y,width,heightScale=1){const b=s.bounds,height=width*b[3]/b[2]*heightScale;ctx.drawImage(s.canvas,...b,x-width/2,y-height/2,width,height)}
function currentCharacter(){return characters.get(`${state.character}-${look().top}-${look().bottom}-${look().face}`)}
function drawBackground(ctx,width,height,id){
 const b=backgrounds.find(item=>item.id===id)||backgrounds[0];ctx.save();ctx.scale(width/520,height/660);ctx.fillStyle=b.color;ctx.fillRect(0,0,520,660);
 if(b.pattern==='check'){ctx.fillStyle='#24251e';for(let y=0;y<12;y++)for(let x=0;x<10;x++)if((x+y)%2===0)ctx.fillRect(x*58,y*58,58,58)}
 if(b.pattern==='burst'){const cx=260,cy=300;ctx.fillStyle='#e7d9b7';for(let i=0;i<24;i+=2){const a=i*Math.PI/12;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+1000*Math.cos(a),cy+1000*Math.sin(a));ctx.lineTo(cx+1000*Math.cos(a+Math.PI/12),cy+1000*Math.sin(a+Math.PI/12));ctx.closePath();ctx.fill()}}
 if(b.pattern==='dots'){ctx.fillStyle='#20211c';for(let y=0;y<660;y+=20)for(let x=0;x<520;x+=20){ctx.beginPath();ctx.arc(x,y,2+3*(1-x/520),0,Math.PI*2);ctx.fill()}ctx.fillStyle='#ed4d25';ctx.save();ctx.translate(260,330);ctx.rotate(-.12);ctx.fillRect(-140,-275,280,550);ctx.restore()}
 if(b.pattern==='wave'){ctx.strokeStyle='#e2d8b5';ctx.lineWidth=13;for(let i=-5;i<19;i++){ctx.beginPath();for(let y=0;y<=680;y+=5){const x=i*40+Math.sin(y/85)*42;if(y===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.stroke()}}
 if(b.pattern==='tape'){ctx.fillStyle='#272721';ctx.save();ctx.translate(280,330);ctx.rotate(-.28);ctx.fillRect(-235,-310,470,620);ctx.fillStyle='#ee4d29';ctx.fillRect(-230,-230,460,115);ctx.fillStyle='#ebdfb7';ctx.fillRect(-230,170,460,75);ctx.restore();ctx.strokeStyle='#d8b0c1';ctx.lineWidth=2;for(let i=0;i<5;i++){ctx.beginPath();ctx.arc(430,160,70+i*22,0,Math.PI*2);ctx.stroke()}}
 if(b.pattern==='grid'){ctx.strokeStyle='#698583';ctx.lineWidth=1;for(let x=0;x<=520;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,660);ctx.stroke()}for(let y=0;y<=660;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(520,y);ctx.stroke()}ctx.strokeStyle='#ed4d25';ctx.lineWidth=24;ctx.beginPath();ctx.arc(260,270,182,0,Math.PI*2);ctx.stroke()}
 // Deterministic print texture. Non-representational geometry, shared by export.
 let seed=19;ctx.fillStyle='#151611';ctx.globalAlpha=.06;for(let i=0;i<1800;i++){seed=(seed*16807)%2147483647;const x=seed%520;seed=(seed*16807)%2147483647;ctx.fillRect(x,seed%660,1+(i%2),1)}ctx.restore();
}
function drawAvatar(){
 const bg=backgrounds.find(b=>b.id===state.background);drawBackground($('#background-canvas').getContext('2d'),520,660,state.background);
 $('#stage').style.color=['dark','grid','check','tape'].includes(bg.id)?'#f1eadb':'#20211c';$('#accessory-count').textContent=look().equipped.length+' EQUIPPED';
 $('#look-name').textContent=topNames[state.character][look().top];$('#look-summary').textContent=`${state.character==='male'?'Male':'Female'} · ${bottomNames[state.character][look().bottom]} · ${faceNames[look().face]}`;
 const c=$('#avatar'),x=c.getContext('2d');x.clearRect(0,0,520,660);const base=currentCharacter();
 if(!base){$('#artwork-status').hidden=false;$('#artwork-status').textContent='Loading this look…';$('#download').disabled=true;return}
 $('#artwork-status').hidden=true;$('#download').disabled=false;x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';
 const height=580,width=height*base.bounds[2]/base.bounds[3],left=(520-width)/2,top=48;
 x.drawImage(base.canvas,...base.bounds,left,top,width,height);
 for(const a of accessories.filter(a=>look().equipped.includes(a.id)).sort((a,b)=>a.order-b.order)){
  const s=sprites.get(a.id);if(!s)continue;const offset=state.character==='female'?(a.group==='eyewear'?.024:a.group==='earrings'?.028:a.id==='choker'?.033:a.id==='headphones'?.012:0):0;const f=fitFor(a.id),cx=left+a.x*width+f.x,cy=top+(a.y+offset)*height+f.y;
  if(a.pair){centered(x,sprites.get(a.id+'-left'),cx-width*a.spread,cy,width*a.width*f.scale);centered(x,sprites.get(a.id+'-right'),cx+width*a.spread,cy,width*a.width*f.scale)}else centered(x,s,cx,cy,width*a.width*f.scale,a.heightScale??1);
 }
}
function equip(id,enabled){if(enabled&&requirePremium('accessory',id,()=>equip(id,true)))return;const a=byId(id);if(!a||!collections[state.character].includes(id)||!sprites.has(id))throw Error('Accessory is not available');look().equipped=compatible(enabled?[...look().equipped,id]:look().equipped.filter(v=>v!==id),state.character);adjusting=enabled?id:look().equipped.at(-1)||null;dirty();drawAvatar();renderOptions()}
function switchCharacter(gender){if(!available[gender])return notify('That character is still loading.');state.character=gender;adjusting=look().equipped.at(-1)||null;dirty();renderAll()}
function selectVariant(key,index){if(requirePremium(key,index,()=>selectVariant(key,index)))return;const next={...look(),[key]:index};if(!characters.has(`${state.character}-${next.top}-${next.bottom}-${next.face}`))return notify('That look is still loading.');look()[key]=index;dirty();drawAvatar();renderOptions()}
function heading(title,note){const row=document.createElement('div'),a=document.createElement('strong'),b=document.createElement('span');row.className='option-heading';a.textContent=title;b.textContent=note;row.append(a,b);return row}
function thumb(s,type='accessory'){
 const c=document.createElement('canvas');c.width=180;c.height=type==='bottom'?175:type==='top'?145:112;
 if(s){const ctx=c.getContext('2d');let b=s.bounds;if(type==='face')b=[b[0],b[1],b[2],Math.round(b[3]*.27)];if(type==='top')b=[b[0],b[1]+Math.round(b[3]*.26),b[2],Math.round(b[3]*.34)];if(type==='bottom')b=[b[0],b[1]+Math.round(b[3]*.54),b[2],Math.round(b[3]*.46)];const scale=Math.min(160/b[2],(c.height-12)/b[3]);ctx.drawImage(s.canvas,...b,(180-b[2]*scale)/2,(c.height-b[3]*scale)/2,b[2]*scale,b[3]*scale)}return c;
}
function variantTile(index,type){
 const t=type==='top'?index:look().top,bottom=type==='bottom'?index:look().bottom,f=type==='face'?index:look().face,s=characters.get(`${state.character}-${t}-${bottom}-${f}`),b=document.createElement('button');
 b.className='tile variant-tile '+type+(look()[type]===index?' active':'');b.setAttribute('aria-pressed',look()[type]===index);b.disabled=!s;
 const name=document.createElement('span');name.textContent=type==='top'?topNames[state.character][index]:type==='bottom'?bottomNames[state.character][index]:faceNames[index];
 b.setAttribute('aria-label',name.textContent+(isPremium(type,index)?' — Premium':''));b.append(thumb(s,type),name);if(isPremium(type,index))b.append(premiumBadge());b.onclick=()=>selectVariant(type,index);return b;
}
function accessoryTile(a){const b=document.createElement('button'),active=look().equipped.includes(a.id);b.className='tile accessory-tile'+(active?' active':'');b.setAttribute('aria-pressed',active);b.setAttribute('aria-label',a.name+(isPremium('accessory',a.id)?' — Premium':''));b.disabled=!sprites.has(a.id);const name=document.createElement('span'),action=document.createElement('small');name.textContent=a.name;action.textContent=active?'Added · remove':sprites.has(a.id)?'+ Add':'Loading…';b.append(thumb(sprites.get(a.id)),name,action);if(isPremium('accessory',a.id))b.append(premiumBadge());b.onclick=()=>equip(a.id,!look().equipped.includes(a.id));return b}
function fitControls(){
 if(!look().equipped.length)return null;if(!look().equipped.includes(adjusting))adjusting=look().equipped.at(-1);
 const panel=document.createElement('div');panel.className='fit-panel';const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Adjust accessory fit';details.open=Boolean(look().fit[adjusting]);details.append(summary);
 const label=document.createElement('label'),select=document.createElement('select');label.textContent='Accessory';select.setAttribute('aria-label','Accessory to adjust');
 for(const id of look().equipped){const option=document.createElement('option');option.value=id;option.textContent=byId(id).name;select.append(option)}select.value=adjusting;select.onchange=()=>{adjusting=select.value;look().fit[adjusting]={...fitFor(adjusting)};renderOptions()};label.append(select);details.append(label);
 const f=fitFor(adjusting);for(const [key,name,min,max,value]of [['scale','Size',60,150,Math.round(f.scale*100)],['x','Left / right',-50,50,f.x],['y','Up / down',-50,50,f.y]]){const row=document.createElement('label'),text=document.createElement('span'),output=document.createElement('output'),input=document.createElement('input');row.className='fit-range';text.textContent=name;output.textContent=key==='scale'?value+'%':value;input.type='range';input.min=min;input.max=max;input.value=value;input.setAttribute('aria-label',name);input.oninput=()=>{const v=Number(input.value);look().fit[adjusting]={...fitFor(adjusting),[key]:key==='scale'?v/100:v};output.textContent=key==='scale'?v+'%':v;dirty();drawAvatar()};row.append(text,output,input);details.append(row)}
 const reset=document.createElement('button');reset.className='text-button';reset.textContent='Reset fit';reset.onclick=()=>{delete look().fit[adjusting];dirty();drawAvatar();renderOptions()};details.append(reset);panel.append(details);return panel;
}
function renderOptions(){
 const root=$('#options');root.replaceChildren();$('#editor-heading').textContent={outfits:'Find your fit.',faces:'Set the expression.',accessories:'Make it your own.',backgrounds:'Set the scene.'}[category];
 if(category==='outfits'||category==='faces'){for(const type of category==='outfits'?['top','bottom']:['face']){root.append(heading(type==='top'?'Tops':type==='bottom'?'Bottoms':'Expressions','3 choices'));const grid=document.createElement('div');grid.className='tiles variant-grid';for(let i=0;i<3;i++)grid.append(variantTile(i,type));root.append(grid)}}
 if(category==='accessories'){root.append(heading('Pick your extras',collections[state.character].length+' pieces'));const grid=document.createElement('div');grid.className='tiles accessory-grid';grid.append(...collections[state.character].map(id=>accessoryTile(byId(id))));root.append(grid);const note=document.createElement('p');note.className='accessory-note';note.textContent='Stack your favorites. Eyewear, hats, earrings and necklaces swap within their own group.';root.append(note);const fit=fitControls();if(fit)root.append(fit)}
 if(category==='backgrounds'){for(const graphic of [false,true]){root.append(heading(graphic?'Graphic backgrounds':'Solid colors','6 styles'));const grid=document.createElement('div');grid.className='background-grid';for(const bg of backgrounds.filter(b=>Boolean(b.pattern)===graphic)){const b=document.createElement('button');b.className='background-option';b.setAttribute('aria-pressed',state.background===bg.id);const c=document.createElement('canvas');c.width=180;c.height=130;drawBackground(c.getContext('2d'),180,130,bg.id);const name=document.createElement('strong');name.textContent=bg.name;b.append(c,name);if(isPremium('background',bg.id))b.append(premiumBadge());b.onclick=()=>{const apply=()=>{state.background=bg.id;dirty();drawAvatar();renderOptions()};if(!requirePremium('background',bg.id,apply))apply()};grid.append(b)}root.append(grid)}}
}
function renderAll(){$('#premium-button').textContent=state.premium?'✦ Premium on':'✦ Premium';$('#premium-button').classList.toggle('enabled',state.premium);$$('[data-character]').forEach(b=>{b.setAttribute('aria-pressed',b.dataset.character===state.character);b.disabled=!available[b.dataset.character]});$('#collection-label').textContent=state.character.toUpperCase()+' COLLECTION';$$('[data-category]').forEach(b=>{b.classList.toggle('active',b.dataset.category===category);b.setAttribute('aria-pressed',b.dataset.category===category)});drawAvatar();renderOptions()}
function imageLoad(src){return new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('Could not load '+src));i.src=src})}
function storeAccessory(a,image,rect,matte){const c=sourceCutout(image,rect,matte);sprites.set(a.id,sprite(c));if(a.pair){const half=Math.floor(c.width/2);for(const [side,x,w]of [['left',0,half],['right',half,c.width-half]]){const part=document.createElement('canvas');part.width=w;part.height=c.height;part.getContext('2d').drawImage(c,x,0,w,c.height,0,0,w,c.height);sprites.set(a.id+'-'+side,sprite(part))}}}
async function loadArt(){
 const results=await Promise.allSettled([
  (async()=>{const i=await imageLoad('assets/character-v3.png');characters.set('male-0-0-0',sprite(sourceCutout(i,[0,0,i.width,i.height],'checker')));available.male=true;ready=true;renderAll()})(),
  (async()=>{const i=await imageLoad('assets/accessories-v3.png');for(const a of accessories.filter(a=>a.source==='classic'))storeAccessory(a,i,a.cell,'checker');renderAll()})(),
  ...['male','female'].flatMap(gender=>faceKeys.map((expression,face)=>(async()=>{const i=await imageLoad(`assets/${gender}-mix-${expression}.png`);const w=Math.floor(i.width/3),h=Math.floor(i.height/3);for(let bottom=0;bottom<3;bottom++)for(let top=0;top<3;top++){if(gender==='male'&&face===0&&top===0&&bottom===0)continue;characters.set(`${gender}-${top}-${bottom}-${face}`,sprite(sourceCutout(i,[top*w,bottom*h,w,h])))}loadedAtlases[gender]=[0,1,2].every(f=>characters.has(`${gender}-2-2-${f}`));available[gender]=true;renderAll()})())),
  (async()=>{const i=await imageLoad('assets/extras-v4.png');const w=Math.floor(i.width/3),h=Math.floor(i.height/3);for(const a of accessories.filter(a=>a.source==='extra'))storeAccessory(a,i,extraCells[a.slot],'white');renderAll()})()
 ]);
 const failed=results.filter(r=>r.status==='rejected');if(failed.length){$('#save-state').textContent='Some artwork could not load. Reload to retry.';if(!currentCharacter()){$('#artwork-status').hidden=false;$('#artwork-status').textContent='This artwork could not load. Please reload.'}}
}
function configure(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['character','top','bottom','face','accessories','background'].includes(k)))throw Error('Invalid customization');
 const gender=input.character??state.character;if(!['male','female'].includes(gender)||!available[gender])throw Error('Character unavailable');
 const target=state.looks[gender],t=input.top??target.top,b=input.bottom??target.bottom,f=input.face??target.face;
 if(![t,b,f].every(n=>Number.isInteger(n)&&n>=0&&n<3)||!characters.has(`${gender}-${t}-${b}-${f}`))throw Error('Look unavailable');
 const ids=input.accessories??target.equipped;if(!Array.isArray(ids)||ids.some(id=>!collections[gender].includes(id)||!sprites.has(id))||new Set(ids).size!==ids.length||compatible(ids,gender).length!==ids.length)throw Error('Invalid or conflicting accessories');
 const bg=input.background??state.background;if(!backgrounds.some(b=>b.id===bg))throw Error('Invalid background');
 if(!state.premium&&(t===2||b===2||ids.some(id=>premiumExtras.has(id))||premiumBackgrounds.has(bg)))throw Error('Enable premium preview in the interface to use premium items');state.character=gender;target.top=t;target.bottom=b;target.face=f;target.equipped=[...ids];state.background=bg;adjusting=ids.at(-1)||null;dirty();renderAll();return readAvatar();
}
function readAvatar(){return {character:state.character,top:look().top,bottom:look().bottom,premium:state.premium,face:look().face,accessories:[...look().equipped],fit:structuredClone(look().fit),background:state.background,body:'intact',ready:Boolean(currentCharacter())}}
$('#premium-button').onclick=()=>{pendingPremium=null;openPremium()};$('#premium-close').onclick=()=>{pendingPremium=null;$('#premium-dialog').close()};$('#premium-dialog').addEventListener('cancel',()=>pendingPremium=null);$('#premium-action').onclick=()=>{if(state.premium){pendingPremium=null;turnOffPremium()}else{state.premium=true;const apply=pendingPremium;pendingPremium=null;dirty();renderAll();if(apply)apply();notify('Premium preview enabled. No payment.')}$('#premium-dialog').close()};
readSaved();$$('[data-character]').forEach(b=>b.onclick=()=>switchCharacter(b.dataset.character));$$('[data-category]').forEach(b=>b.onclick=()=>{category=b.dataset.category;renderAll()});$('#save').onclick=save;
$('#reset').onclick=()=>{state.looks[state.character]=freshLook();adjusting=null;dirty();renderAll();notify('Current character reset.')};
$('#shuffle').onclick=()=>{if(!loadedAtlases[state.character])return notify('The collection is still loading.');const options=collections[state.character].filter(id=>sprites.has(id)&&(state.premium||!premiumExtras.has(id))&&Math.random()>.8);look().top=Math.floor(Math.random()*(state.premium?3:2));look().bottom=Math.floor(Math.random()*(state.premium?3:2));look().face=Math.floor(Math.random()*3);look().equipped=compatible(options,state.character);look().fit={};adjusting=look().equipped.at(-1)||null;dirty();renderAll()};
$('#download').onclick=()=>{if(!currentCharacter())return;const c=document.createElement('canvas');c.width=1040;c.height=1320;const x=c.getContext('2d');drawBackground(x,c.width,c.height,state.background);x.drawImage($('#avatar'),0,0,c.width,c.height);c.toBlob(blob=>{if(!blob)return notify('Could not export the image.');const a=document.createElement('a');a.download=`hit-me-up-${state.character}.png`;a.href=URL.createObjectURL(blob);a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);notify('Your look is ready to download.')},'image/png')};
renderAll();loadArt();
if(document.modelContext?.registerTool){const lifecycle=new AbortController();const register=tool=>{try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{})}catch{}};
 register({name:'configure_avatar',description:'Configure the current male or female character, independent top, bottom and face selections, stackable accessories, and background. Does not save.',inputSchema:{type:'object',properties:{character:{type:'string',enum:['male','female']},top:{type:'integer',minimum:0,maximum:2},bottom:{type:'integer',minimum:0,maximum:2},face:{type:'integer',minimum:0,maximum:2},accessories:{type:'array',items:{type:'string',enum:accessories.map(a=>a.id)},uniqueItems:true},background:{type:'string',enum:backgrounds.map(b=>b.id)}},additionalProperties:false},annotations:{readOnlyHint:false},execute:configure});
 register({name:'read_avatar',description:'Read the current customization and asset readiness without changing it.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:readAvatar});
 addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
