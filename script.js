'use strict';

// Arcana Sort — classic Ball Sort mechanics.
// One move = ONE top ball. Visuals never become the source of truth.
const CAPACITY = 4;
const COLORS = {red:'#c96c62',blue:'#679dc5',green:'#8fbf78',violet:'#a77ac5',amber:'#d6ad58'};
const LEVELS = [
  {name:'First Pour', time:180, puzzle:[['red','blue','red','blue'],['blue','red','blue','red'],[],[]]},
  {name:'Three Colors', time:240, puzzle:[['red','blue','green','red'],['green','blue','red','green'],['blue','red','blue','green'],[],[]]},
  {name:'Four Colors', time:300, puzzle:[['green','violet','blue','red'],['green','red','red','green'],['violet','blue','green','blue'],['red','blue','violet','violet'],[],[]]},
  {name:'Five Colors', time:360, puzzle:[['green','amber','amber','violet'],['red','amber','green','red'],['red','green','blue','blue'],['blue','amber','blue','violet'],['green','red','violet','violet'],[],[]]}
];

const state={level:0,status:'playing',selected:null,flasks:[],moves:0,time:0,timerId:null,session:0,unlocked:1,musicOn:false,audio:null,musicNodes:[],history:[],hints:0,sorted:0,paused:false};
const $=id=>document.getElementById(id);
const rack=$('rack'),message=$('message'),movesEl=$('moves'),timerEl=$('timer'),levelName=$('levelName'),modal=$('modal');

function loadNumber(key,fallback){try{const n=Number(localStorage.getItem(key));return Number.isFinite(n)?n:fallback}catch{return fallback}}
function save(){try{localStorage.setItem('arcanaUnlocked',String(state.unlocked))}catch{}}
function cloneFlasks(flasks){return flasks.map(s=>s.slice())}
function formatTime(s){return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`}
function isCompleteTube(s){return s.length===CAPACITY&&s.every(c=>c===s[0])}
function sortedCount(){return state.flasks.filter(isCompleteTube).length}
function isSolved(){return state.flasks.every(s=>s.length===0||isCompleteTube(s))}
function makePuzzle(level){return cloneFlasks(LEVELS[level].puzzle)}
function legalMove(flasks,from,to){
  if(from===to||!flasks[from].length||flasks[to].length>=CAPACITY)return false;
  const color=flasks[from][flasks[from].length-1];
  const target=flasks[to][flasks[to].length-1];
  return !target||target===color;
}

function render(){
  rack.innerHTML='';
  state.flasks.forEach((stack,i)=>{
    const btn=document.createElement('button');
    btn.className='flask-wrap'+(state.selected===i?' selected':'');
    btn.type='button';
    btn.setAttribute('aria-label',`Flask ${i+1}`);
    btn.onclick=()=>chooseFlask(i);

    const flask=document.createElement('span');flask.className='flask';
    const neck=document.createElement('span');neck.className='neck';flask.appendChild(neck);
    const liquid=document.createElement('span');liquid.className='liquid';liquid.style.height=`${stack.length/CAPACITY*100}%`;
    stack.forEach(c=>{const e=document.createElement('span');e.className=`element ${c}`;e.style.background=COLORS[c];liquid.appendChild(e)});
    flask.appendChild(liquid);btn.appendChild(flask);
    const label=document.createElement('span');label.className='label';label.textContent=i+1;btn.appendChild(label);
    if(isCompleteTube(stack)) btn.classList.add('complete');
    rack.appendChild(btn);
  });

  movesEl.textContent=state.moves;
  timerEl.textContent=formatTime(state.time);
  levelName.textContent=`Level ${state.level+1} — ${LEVELS[state.level].name}`;
  const sortedEl=$('sorted'); if(sortedEl) sortedEl.textContent=`${sortedCount()}/${countColors()}`;
  const undoBtn=$('undoBtn'); if(undoBtn) undoBtn.disabled=state.history.length===0||state.status!=='playing'||state.paused;
}

function countColors(){
  const set=new Set();state.flasks.forEach(s=>s.forEach(c=>set.add(c)));return set.size;
}

function chooseFlask(i){
  if(state.status!=='playing'||state.paused)return;
  ensureAudio();
  if(state.selected===null){
    if(!state.flasks[i].length){message.textContent='That flask is empty. Choose a filled flask.';shake(i);return}
    state.selected=i;
    message.textContent='Now choose a destination flask.';
    sfx(360,.08);
    render();
    return;
  }
  if(state.selected===i){state.selected=null;message.textContent='Selection cancelled.';render();return}
  const from=state.selected;
  // Keep the source selected when the destination is illegal, matching the reference game's forgiving UX.
  if(!legalMove(state.flasks,from,i)){
    message.textContent=state.flasks[i].length>=CAPACITY?'That flask is full.':'You can only pour onto the same color or into an empty flask.';
    invalid(i);return;
  }
  state.selected=null;
  pourOne(from,i);
}

function pourOne(from,to){
  state.history.push(cloneFlasks(state.flasks));
  const color=state.flasks[from].pop();
  state.flasks[to].push(color);
  state.moves++;
  message.textContent='Nice pour.';
  sfx(240,.12,'triangle');
  render();

  const targetEl=rack.children[to];
  if(targetEl){targetEl.classList.add('pour');setTimeout(()=>targetEl.classList.remove('pour'),260)}
  if(isCompleteTube(state.flasks[to])){message.textContent='Color complete!';sfx(520,.2)}
  if(isSolved())win();
}

function invalid(i){sfx(100,.1,'sawtooth');shake(i)}
function shake(i){const el=rack.children[i];if(!el)return;el.classList.remove('invalid');void el.offsetWidth;el.classList.add('invalid')}

function resetLevel(level=state.level){
  stopTimer();
  state.session++;
  state.level=level;
  state.status='playing';
  state.paused=false;
  state.selected=null;
  state.moves=0;
  state.hints=0;
  state.history=[];
  state.time=LEVELS[level].time;
  state.flasks=makePuzzle(level);
  message.textContent='Select a flask to begin.';
  closeModal();
  render();
  startTimer();
}

function startTimer(){
  const mySession=state.session;
  stopTimer();
  state.timerId=setInterval(()=>{
    if(mySession!==state.session||state.status!=='playing'||state.paused)return;
    if(state.time>0){
      state.time--;
      timerEl.textContent=formatTime(state.time);
      if(state.time<=0)lose();
    }
  },1000);
}
function stopTimer(){if(state.timerId!==null){clearInterval(state.timerId);state.timerId=null}}

function undo(){
  if(state.status!=='playing'||state.paused||!state.history.length)return;
  state.flasks=state.history.pop();state.selected=null;
  message.textContent='Last move undone.';render();sfx(180,.1)
}

function hint(){
  if(state.status!=='playing'||state.paused)return;
  const move=findHint(state.flasks);
  if(!move){message.textContent='No safe move found from this position.';return}
  state.hints++;
  const [from,to]=move;
  const a=rack.children[from],b=rack.children[to];
  if(a){a.classList.add('hint-source');setTimeout(()=>a.classList.remove('hint-source'),900)}
  if(b){b.classList.add('hint-target');setTimeout(()=>b.classList.remove('hint-target'),900)}
  message.textContent=`Hint: pour flask ${from+1} into flask ${to+1}.`;
}

// Breadth-first search from the current position. It only searches the same legal rules as the game.
function findHint(start){
  const key=s=>s.map(x=>x.join(',')).join('|');
  const solved=s=>s.every(x=>x.length===0||isCompleteTube(x));
  const q=[{f:cloneFlasks(start),first:null}];
  const seen=new Set([key(start)]);
  let head=0;
  while(head<q.length && head<30000){
    const node=q[head++];
    if(node.first&&node.first.length)return node.first;
    for(let i=0;i<node.f.length;i++){
      for(let j=0;j<node.f.length;j++){
        if(!legalMove(node.f,i,j))continue;
        const next=cloneFlasks(node.f);next[j].push(next[i].pop());
        const k=key(next);if(seen.has(k))continue;
        seen.add(k);
        const first=node.first||[i,j];
        if(solved(next))return first;
        q.push({f:next,first});
      }
    }
  }
  return null;
}

function togglePause(){
  if(state.status!=='playing')return;
  state.paused=!state.paused;
  const btn=$('pauseBtn');
  if(state.paused){state.selected=null;message.textContent='Paused.';if(btn)btn.textContent='▶ Resume';showPauseOverlay()}
  else{message.textContent='Back to the puzzle.';if(btn)btn.textContent='⏸ Pause';closeModal();render()}
}
function showPauseOverlay(){showModal('Paused','<p>The puzzle is waiting for you.</p>','Resume',()=>togglePause())}

function win(){
  if(state.status!=='playing')return;
  state.status='won';stopTimer();
  state.unlocked=Math.max(state.unlocked,Math.min(LEVELS.length,state.level+2));save();
  message.textContent='Every color is sorted.';
  sfx(660,.35);
  const next=state.level<LEVELS.length-1;
  showModal('Puzzle Complete!',`<p>Level ${state.level+1} is solved.</p><p>Time: <strong>${formatTime(LEVELS[state.level].time-state.time)}</strong><br>Moves: <strong>${state.moves}</strong><br>Sorted: <strong>${sortedCount()}/${countColors()}</strong></p>`,next?'Next Level':'Play Again',()=>{closeModal();resetLevel(next?state.level+1:0)});
}
function lose(){
  if(state.status!=='playing')return;
  state.status='lost';stopTimer();
  showModal('Time is up','<p>Try the same puzzle again. Your board will be restored to its starting layout.</p>','Restart',()=>{closeModal();resetLevel(state.level)});
  sfx(80,.3,'sawtooth');
}

function showModal(title,body,button,action){
  $('modalTitle').textContent=title;$('modalBody').innerHTML=body;$('modalButton').textContent=button;$('modalButton').onclick=action;modal.classList.remove('hidden')
}
function closeModal(){modal.classList.add('hidden')}
function showRules(){
  showModal('How to Play',`<p><b>1.</b> Click a non-empty flask. Its top ball is selected.</p><p><b>2.</b> Click another flask to pour <strong>one ball</strong>.</p><p><b>3.</b> A ball can go into an empty flask or onto the same color.</p><p><b>4.</b> Only the top ball moves. Balls underneath stay in place.</p><p><b>5.</b> If a move is illegal, nothing changes and your selection stays active.</p><p><b>6.</b> Complete every color as a full single-color flask to win.</p>`,'Got it',closeModal)
}

function ensureAudio(){if(state.audio)return;try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;state.audio=new AC()}catch{state.audio=null}}
function sfx(freq,dur,type='sine'){if(!state.audio||!state.musicOn)return;try{const o=state.audio.createOscillator(),g=state.audio.createGain();o.type=type;o.frequency.value=freq;g.gain.value=.045;o.connect(g);g.connect(state.audio.destination);o.start();o.stop(state.audio.currentTime+dur)}catch{}}
function startMusic(){if(!state.musicOn||!state.audio||state.musicNodes.length)return;try{if(state.audio.state==='suspended')state.audio.resume();const master=state.audio.createGain();master.gain.value=.018;master.connect(state.audio.destination);[130.81,164.81,196].forEach((f,i)=>{const o=state.audio.createOscillator();o.type=i?'sine':'triangle';o.frequency.value=f;o.connect(master);o.start();state.musicNodes.push(o)});state.musicNodes.push(master)}catch{}}
function stopMusic(){state.musicNodes.forEach(n=>{try{if(n.stop)n.stop()}catch{}try{n.disconnect()}catch{}});state.musicNodes=[]}

$('restartBtn').onclick=()=>{ensureAudio();resetLevel()};
$('howBtn').onclick=()=>showRules();
$('undoBtn').onclick=()=>undo();
$('hintBtn').onclick=()=>hint();
$('pauseBtn').onclick=()=>togglePause();
$('nextBtn').onclick=()=>{if(state.level<LEVELS.length-1)resetLevel(state.level+1)};
$('musicBtn').onclick=()=>{ensureAudio();state.musicOn=!state.musicOn;$('musicBtn').textContent=state.musicOn?'♫ Music On':'♫ Calm Music';if(state.musicOn)startMusic();else stopMusic()};
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.classList.contains('hidden'))closeModal()});

state.unlocked=Math.min(LEVELS.length,Math.max(1,loadNumber('arcanaUnlocked',1)));
resetLevel(0);
setTimeout(showRules,150);


// Small flask interaction sounds. No external audio files are required.
let interactionAudio = null;

function flaskSound(kind = "select") {
  try {
    interactionAudio = interactionAudio || new (window.AudioContext || window.webkitAudioContext)();
    if (interactionAudio.state === "suspended") interactionAudio.resume();

    const osc = interactionAudio.createOscillator();
    const gain = interactionAudio.createGain();

    const now = interactionAudio.currentTime;
    const settings = {
      select: [520, 0.055],
      pour: [360, 0.085],
      invalid: [170, 0.07],
      complete: [720, 0.11]
    }[kind] || [420, 0.06];

    osc.type = "sine";
    osc.frequency.setValueAtTime(settings[0], now);
    osc.frequency.exponentialRampToValueAtTime(settings[0] * 0.72, now + settings[1]);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.045, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + settings[1]);

    osc.connect(gain);
    gain.connect(interactionAudio.destination);
    osc.start(now);
    osc.stop(now + settings[1] + 0.01);
  } catch (_) {
    // Sound must never affect gameplay.
  }
}
