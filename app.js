/* QUEST ARCADE v2 — single unified node type; no separate tasks. */
(() => {
  'use strict';
  const KEY = 'quest-arcade-save-v1';
  const MOTION_KEY = 'quest-arcade-motion';
  const LEVEL_XP = 180;
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const pad = n => String(n).padStart(2, '0');
  const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const dateTimeLocal = d => `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const shiftDate = days => { const d = new Date(); d.setDate(d.getDate()+days); return d; };
  const dueAt = (days, hour) => { const d = shiftDate(days); d.setHours(hour,0,0,0); return dateTimeLocal(d); };
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, s => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[s]));
  const CATEGORIES = { main:'主线', side:'支线', daily:'每日' };
  const normalize = (item = {}) => ({
    id: String(item.id || uid()), name: String(item.name || '未命名清单').slice(0,90), parentId: String(item.parentId || ''),
    collapsed: Boolean(item.collapsed), manualDone: item.manualDone === true,
    completedAt: typeof item.completedAt === 'string' ? item.completedAt : null,
    category: CATEGORIES[item.category] ? item.category : 'side',
    xp: [15,30,50].includes(Number(item.xp)) ? Number(item.xp) : 30,
    due: typeof item.due === 'string' && item.due && !Number.isNaN(new Date(item.due).valueOf()) ? item.due : '',
    reminderMinutes: item.reminderMinutes === '' || item.reminderMinutes == null ? null : Number(item.reminderMinutes),
    note: String(item.note || '').slice(0,280), notifiedAt: item.notifiedAt || null
  });
  function seed() {
    const now = new Date().toISOString();
    return [
      {id:'demo-app',name:'开发我的 APP',parentId:'',category:'main',xp:50},
      {id:'demo-ui',name:'界面设计',parentId:'demo-app',category:'main',xp:30},
      {id:'demo-login',name:'登录页面',parentId:'demo-ui',category:'side',xp:30},
      {id:'demo-wire',name:'绘制页面原型',parentId:'demo-login',category:'side',xp:15,manualDone:true,completedAt:now},
      {id:'demo-motion',name:'设计交互动效',parentId:'demo-login',category:'side',xp:30,due:dueAt(1,18)},
      {id:'demo-icons',name:'整理图标资源',parentId:'demo-ui',category:'side',xp:15},
      {id:'demo-api',name:'后端接口',parentId:'demo-app',category:'main',xp:30},
      {id:'demo-schema',name:'设计数据结构',parentId:'demo-api',category:'side',xp:30},
      {id:'demo-life',name:'日常成长',parentId:'',category:'main',xp:30},
      {id:'demo-japanese',name:'日语练习',parentId:'demo-life',category:'daily',xp:30},
      {id:'demo-words',name:'复习 20 个单词',parentId:'demo-japanese',category:'daily',xp:15,manualDone:true,completedAt:now},
      {id:'demo-listen',name:'听力训练 20 分钟',parentId:'demo-japanese',category:'daily',xp:15,due:dueAt(0,21),reminderMinutes:10},
      {id:'demo-desk',name:'收拾桌面',parentId:'demo-life',category:'side',xp:15,manualDone:true,completedAt:now}
    ].map(normalize);
  }
  function sanitizeNodes(raw) {
    const values = []; const ids = new Set();
    for (const item of raw) { if (!item || typeof item !== 'object') continue; const node = normalize(item); if (ids.has(node.id)) continue; ids.add(node.id); values.push(node); }
    const map = new Map(values.map(v => [v.id,v]));
    for (const node of values) {
      let parent = node.parentId; const seen = new Set([node.id]);
      while (parent) {
        if (!map.has(parent) || seen.has(parent)) { node.parentId = ''; break; }
        seen.add(parent); parent = map.get(parent).parentId;
      }
    }
    return values;
  }
  function migrateOld(saved) {
    const originals = Array.isArray(saved.lists) ? saved.lists : [];
    const oldNodes = originals.map(list => normalize({ ...list, name:list.name, manualDone:false, category:'main',xp:30 }));
    const parentIds = new Set(oldNodes.map(n=>n.id));
    for (const task of saved.tasks || []) {
      oldNodes.push(normalize({
        id: String(task.id || uid()), name:task.title, parentId:parentIds.has(task.listId) ? task.listId : '',
        category:task.category, xp:task.xp, due:task.due, reminderMinutes:task.reminderMinutes,
        note:task.note, manualDone:task.completed, completedAt:task.completedAt, notifiedAt:task.notifiedAt
      }));
    }
    return sanitizeNodes(oldNodes);
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return seed();
      const parsed = JSON.parse(raw);
      if (parsed?.version === 3 && Array.isArray(parsed.nodes)) return sanitizeNodes(parsed.nodes);
      if ((parsed?.version === 1 || parsed?.version === 2) && Array.isArray(parsed.tasks)) {
        try { if (!localStorage.getItem('quest-arcade-v2-backup')) localStorage.setItem('quest-arcade-v2-backup',raw); } catch {}
        return migrateOld(parsed);
      }
    } catch (err) { console.warn('本地存档读取失败：',err); }
    return seed();
  }
  let nodes = load();
  let selectedId = '', view = 'todo', filter = 'all';
  let selectedDate = dateKey(new Date());
  let currentYear = new Date().getFullYear(), currentMonth = new Date().getMonth();
  let preview = [];
  let lowMotion = localStorage.getItem(MOTION_KEY) === 'off';
  if (lowMotion) document.body.classList.add('reduce-motion');
  const byId = id => nodes.find(n => n.id === id);
  function save() { try { localStorage.setItem(KEY,JSON.stringify({version:3,nodes})); } catch { toast('保存失败，请检查浏览器存储空间。'); } }
  function childrenMap() {
    const map = new Map();
    for (const node of nodes) { if (!map.has(node.parentId)) map.set(node.parentId, []); map.get(node.parentId).push(node); }
    return map;
  }
  const childrenOf = id => nodes.filter(n=>n.parentId===id);
  function descendantIds(id, includeSelf=true) {
    const children = childrenMap(); const ids=new Set(); const stack = includeSelf ? [id] : (children.get(id)||[]).map(n=>n.id);
    while (stack.length) { const current=stack.pop(); if(ids.has(current)) continue; ids.add(current); for(const n of children.get(current)||[]) stack.push(n.id); }
    return ids;
  }
  function pathFor(id) {
    const result=[]; const seen=new Set(); let node=byId(id);
    while(node && !seen.has(node.id)) { result.unshift(node.name); seen.add(node.id); node=byId(node.parentId); }
    return result;
  }
  function levelFor(id) { return pathFor(id).length; }
  /* Iterative postorder evaluation — no recursion, any depth. Parent is complete iff every direct child is complete. */
  function evaluate() {
    const children=childrenMap(); const state=new Map();
    const stack=(children.get('')||[]).map(n=>[n,false]);
    const visited=new Set();
    while(stack.length) {
      const [node,expanded]=stack.pop();
      if(expanded) {
        const kids=children.get(node.id)||[];
        const done=kids.length ? kids.every(k=>state.get(k.id)?.done) : node.manualDone;
        const total=kids.length ? kids.reduce((n,k)=>n+(state.get(k.id)?.total||0),0) : 1;
        const cleared=kids.length ? kids.reduce((n,k)=>n+(state.get(k.id)?.cleared||0),0) : Number(done);
        const completedAt=done ? (kids.length ? kids.map(k=>state.get(k.id)?.completedAt||'').sort().at(-1) || null : node.completedAt) : null;
        state.set(node.id,{done,total,cleared,leaf:!kids.length,completedAt,childCount:kids.length});
      } else if(!visited.has(node.id)) {
        visited.add(node.id); stack.push([node,true]);
        for(const child of (children.get(node.id)||[]).slice().reverse()) stack.push([child,false]);
      }
    }
    // sanitizeNodes guarantees no cycles and roots, but handle isolated nodes defensively.
    for (const n of nodes) if (!state.has(n.id)) state.set(n.id,{done:n.manualDone,total:1,cleared:Number(n.manualDone),leaf:true,completedAt:n.completedAt,childCount:0});
    return state;
  }
  function rows() {
    const children=childrenMap(), result=[], seen=new Set();
    const stack=(children.get('')||[]).slice().reverse().map(node=>({node,depth:0}));
    while(stack.length) {
      const row=stack.pop(); if(seen.has(row.node.id))continue;
      seen.add(row.node.id); result.push(row);
      if(!row.node.collapsed) for(const child of (children.get(row.node.id)||[]).slice().reverse())stack.push({node:child,depth:row.depth+1});
    }
    return result;
  }
  function options(selected='',exclude='') {
    const excluded=exclude ? descendantIds(exclude) : new Set();
    const old=nodes.map(n=>n.collapsed); nodes.forEach(n=>n.collapsed=false); const all=rows(); nodes.forEach((n,i)=>n.collapsed=old[i]);
    return `<option value="" ${!selected?'selected':''}>冒险大厅 · 根目录</option>`+all.filter(({node})=>!excluded.has(node.id)).map(({node,depth})=>`<option value="${escapeHTML(node.id)}" ${node.id===selected?'selected':''}>${'　'.repeat(Math.min(depth,8))}${depth?'↳ ':''}${escapeHTML(node.name)}</option>`).join('');
  }
  function scopeNodes() {
    if (!selectedId) return nodes;
    const allowed=descendantIds(selectedId); return nodes.filter(n=>allowed.has(n.id));
  }
  function currentCards() { return selectedId ? [byId(selectedId),...childrenOf(selectedId)].filter(Boolean) : childrenOf(''); }
  const dueLabel = due => { if(!due)return '无时间限制'; const d=new Date(due); if(isNaN(d))return '时间未设置'; return `${d.getMonth()+1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  function todayCount(state) { return nodes.filter(n => n.due?.slice(0,10)===dateKey(new Date()) || (state.get(n.id)?.done && state.get(n.id)?.completedAt?.slice(0,10)===dateKey(new Date()))); }
  function renderTree(state) {
    const tree=$('#collection-tree');
    const allDone=nodes.filter(n=>state.get(n.id)?.done).length;
    let markup=`<div class="collection-node root-node ${!selectedId?'selected':''}"><span class="collection-toggle-spacer"></span><button type="button" class="collection-pick" data-node-select="" aria-pressed="${!selectedId}"><svg><use href="#i-sword"/></svg><span>冒险大厅</span><small>${allDone}/${nodes.length}</small></button></div>`;
    for(const {node,depth} of rows()) {
      const s=state.get(node.id), percent=s.total?Math.round(s.cleared/s.total*100):0;
      markup+=`<div class="collection-node ${selectedId===node.id?'selected':''} ${s.done?'cleared':''}" style="--nest:${Math.min(depth,8)}" data-depth="${depth}">
        ${s.childCount?`<button type="button" class="collection-expander ${node.collapsed?'is-collapsed':''}" data-node-toggle="${escapeHTML(node.id)}" aria-label="${node.collapsed?'展开':'折叠'} ${escapeHTML(node.name)}" aria-expanded="${!node.collapsed}"><svg><use href="#i-chevron"/></svg></button>`:'<span class="collection-toggle-spacer"></span>'}
        <button type="button" class="collection-pick" data-node-select="${escapeHTML(node.id)}" aria-pressed="${selectedId===node.id}" title="${escapeHTML(pathFor(node.id).join(' / '))}"><svg><use href="#${s.done?'i-trophy':'i-folder'}"/></svg><span>${escapeHTML(node.name)}</span>${depth>=8?`<em class="collection-depth">L${depth+1}</em>`:''}<small>${s.leaf?(s.done?'✓':'○'):`${s.cleared}/${s.total}`}</small></button>
        <div class="collection-actions"><button type="button" data-node-create="${escapeHTML(node.id)}" title="添加子清单" aria-label="${escapeHTML(node.name)} 添加子清单"><svg><use href="#i-folder-plus"/></svg></button><button type="button" data-node-edit="${escapeHTML(node.id)}" title="编辑清单" aria-label="编辑 ${escapeHTML(node.name)}"><svg><use href="#i-edit"/></svg></button><button type="button" data-node-delete="${escapeHTML(node.id)}" title="删除清单" aria-label="删除 ${escapeHTML(node.name)}"><svg><use href="#i-trash"/></svg></button></div>
      </div>`;
    }
    tree.innerHTML=markup;
    $('#list-total').textContent=nodes.length;
    const selected=byId(selectedId);
    const s=selected && state.get(selectedId);
    const perc=s ? Math.round(s.cleared/s.total*100) : nodes.length?Math.round(allDone/nodes.length*100):0;
    const text=selected ? (s.leaf?(s.done?'已通关':'叶子清单 · 待完成'):`${s.cleared} / ${s.total} 叶子已完成`) : `${allDone} / ${nodes.length} 节点已通关`;
    $('#collection-current').innerHTML=`<div class="collection-route"><span>当前区域</span><b title="${escapeHTML(pathFor(selectedId).join(' / '))}">${selected?escapeHTML(pathFor(selectedId).join(' / ')):'冒险大厅'}</b></div><span>${text}</span><button type="button" data-node-create="${escapeHTML(selectedId)}">+ 添加${selected?'子':''}清单</button><div class="collection-progress"><i style="width:${perc}%"></i></div>`;
  }
  function card(node,state) {
    const s=state.get(node.id), done=s.done;
    const percent=Math.round(s.cleared/s.total*100), hasChildren=!s.leaf;
    const when=node.due ? `<span><svg><use href="#i-calendar"/></svg>${escapeHTML(dueLabel(node.due))}</span>` : `<span>✧ 自由探索</span>`;
    const breadcrumb=pathFor(node.parentId);
    const badge=`<span class="kind-badge">${CATEGORIES[node.category]}</span><span class="xp-badge">${done?'✓ ':'+'}${node.xp} XP</span><span class="list-badge"><svg><use href="#i-folder"/></svg>${hasChildren?`${s.childCount} 个子清单 · ${s.cleared}/${s.total}`:'叶子清单 · 可手动完成'}</span>${breadcrumb.length?`<span class="list-badge">${escapeHTML(breadcrumb.slice(-2).join(' / '))}</span>`:''}`;
    const left=hasChildren?`<button type="button" class="parent-progress" data-node-select="${escapeHTML(node.id)}" title="进入子清单" aria-label="进入 ${escapeHTML(node.name)}"><span>${percent}%</span></button>`:done?`<button type="button" class="done-icon" data-node-restore="${escapeHTML(node.id)}" aria-label="恢复 ${escapeHTML(node.name)}"><svg><use href="#i-check"/></svg></button>`:`<button type="button" class="check-button" data-node-complete="${escapeHTML(node.id)}" aria-label="完成 ${escapeHTML(node.name)}"><svg><use href="#i-check"/></svg></button>`;
    return `<article class="quest-card ${done?'done-card':`type-${node.category}`}" data-node-id="${escapeHTML(node.id)}">
      ${left}<div class="quest-main"><div class="quest-badges">${badge}</div>
      <h3 class="quest-title"><button type="button" class="node-title-button" data-node-select="${escapeHTML(node.id)}">${escapeHTML(node.name)}</button></h3>
      ${node.note?`<p class="quest-note">${escapeHTML(node.note)}</p>`:''}
      ${hasChildren?`<div class="node-child-progress"><i style="width:${percent}%"></i></div>`:''}
      <div class="quest-meta">${when}${s.done?`<span><svg><use href="#i-check"/></svg>${hasChildren?'自动通关':'已通关'}</span>`:''}${!s.done && node.reminderMinutes!=null?`<span class="has-reminder"><svg><use href="#i-bell"/></svg>提前${node.reminderMinutes}分钟</span>`:''}</div></div>
      <div class="task-actions"><button type="button" class="action-icon" data-node-create="${escapeHTML(node.id)}" title="新增子清单" aria-label="新增子清单"><svg><use href="#i-folder-plus"/></svg></button><button type="button" class="action-icon" data-node-edit="${escapeHTML(node.id)}" title="编辑" aria-label="编辑"><svg><use href="#i-edit"/></svg></button>${node.due?`<button type="button" class="action-icon" data-node-calendar="${escapeHTML(node.id)}" title="导出日历" aria-label="导出日历"><svg><use href="#i-calendar"/></svg></button>`:''}<button type="button" class="action-icon danger" data-node-delete="${escapeHTML(node.id)}" title="删除" aria-label="删除"><svg><use href="#i-trash"/></svg></button></div>
    </article>`;
  }
  function renderCards(state) {
    let visible=currentCards(), todo=visible.filter(n=>!state.get(n.id).done);
    if(filter==='today')todo=todo.filter(n=>n.due?.slice(0,10)===dateKey(new Date()));
    if(filter==='upcoming')todo=todo.filter(n=>n.due && new Date(n.due)>=new Date() && new Date(n.due)<=new Date(Date.now()+7*86400000));
    // Completed tab is a historical overview of every completed node in the chosen subtree.
    const done=scopeNodes().filter(n=>state.get(n.id).done);
    todo.sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999'));
    done.sort((a,b)=>(state.get(b.id).completedAt||'').localeCompare(state.get(a.id).completedAt||''));
    $('#todo-list').innerHTML=todo.map(n=>card(n,state)).join('');
    $('#done-list').innerHTML=done.map(n=>card(n,state)).join('');
    $('#todo-empty').hidden=todo.length!==0; $('#done-empty').hidden=done.length!==0;
    $('#todo-count').textContent=scopeNodes().filter(n=>!state.get(n.id).done).length;
    $('#done-count').textContent=scopeNodes().filter(n=>state.get(n.id).done).length;
    $('#todo-meta').textContent=`${todo.length} LISTS AVAILABLE`;
    $('#done-meta').textContent=`${done.length} LISTS CLEARED`;
    $('#victory-total').textContent=pad(nodes.filter(n=>state.get(n.id).done).length);
  }
  function getXP(state) { return nodes.reduce((sum,n)=>sum+(state.get(n.id).done?n.xp:0),0); }
  function getLevel(state) { return Math.floor(getXP(state)/LEVEL_XP)+1; }
  function getStreak(state) {
    const days=new Set(nodes.filter(n=>state.get(n.id).done&&state.get(n.id).completedAt).map(n=>state.get(n.id).completedAt.slice(0,10)));
    let d=new Date(); if(!days.has(dateKey(d)))d.setDate(d.getDate()-1);
    let count=0;while(days.has(dateKey(d))&&count<366){count++;d.setDate(d.getDate()-1);}return count;
  }
  function renderStats(state) {
    const today=todayCount(state);
    $('#today-progress-number').textContent=`${today.filter(n=>state.get(n.id).done).length}/${today.length}`;
    $('#streak-number').textContent=getStreak(state);
    $('#total-xp-number').textContent=getXP(state).toLocaleString('zh-CN');
    $('#player-level').textContent=pad(getLevel(state)); $('#mascot-level').textContent=pad(getLevel(state));
    const exp=getXP(state)%LEVEL_XP;
    $('#xp-progress-fill').style.width=`${exp/LEVEL_XP*100}%`;
    $('#xp-progress-label').textContent=`${exp} / ${LEVEL_XP} XP`;
    $('#rank-title').textContent=['见习冒险者','初级探索者','资深开拓者','精英领航员','传说挑战者'][Math.min(4,Math.floor((getLevel(state)-1)/2))];
    const count=nodes.filter(n=>state.get(n.id).done).length;
    $('#achievement-strip').innerHTML=[{n:1,s:'✦',t:'冒险启程'},{n:3,s:'⚔',t:'三次通关'},{n:5,s:'★',t:'层层推进'},{n:10,s:'♛',t:'通关大师'}].map(m=>`<div class="achievement-card ${count>=m.n?'':'locked'}"><span class="achievement-medal">${m.s}</span><div><b>${m.t}</b><small>${count>=m.n?'已解锁':`通关 ${m.n} 个清单解锁`}</small></div></div>`).join('');
  }
  const formatFullDay = key => { const d=new Date(`${key}T12:00:00`);return `${d.getMonth()+1}月${d.getDate()}日 · ${['周日','周一','周二','周三','周四','周五','周六'][d.getDay()]}`;};
  function renderCalendar(state) {
    $('#calendar-month-label').textContent=$('#calendar-month-label-modal').textContent=`${currentYear} / ${pad(currentMonth+1)}`;
    const first=new Date(currentYear,currentMonth,1).getDay(); const cells=[];
    for(let i=0;i<42;i++){
      const d=new Date(currentYear,currentMonth,1-first+i), key=dateKey(d);
      const cls=['calendar-date'];if(d.getMonth()!==currentMonth)cls.push('other-month');if(key===dateKey(new Date()))cls.push('today');if(key===selectedDate)cls.push('selected');if(nodes.some(n=>n.due?.slice(0,10)===key))cls.push('has-tasks');
      cells.push(`<button type="button" class="${cls.join(' ')}" data-cal-date="${key}" aria-label="${key}" aria-pressed="${key===selectedDate}">${d.getDate()}</button>`);
    }
    $('#calendar-grid').innerHTML=$('#calendar-grid-modal').innerHTML=cells.join('');
    $('#calendar-day-title').textContent=$('#calendar-day-title-modal').textContent=`${formatFullDay(selectedDate)} 的安排`;
    const matching=nodes.filter(n=>n.due?.slice(0,10)===selectedDate).sort((a,b)=>a.due.localeCompare(b.due));
    const markup=matching.map(n=>`<div class="calendar-event"><i class="event-dot ${state.get(n.id).done?'completed':''}"></i><b title="${escapeHTML(n.name)}">${escapeHTML(n.name)}</b><span>${escapeHTML(n.due.slice(11,16))}</span></div>`).join('') || '<p class="event-empty">暂无安排，添加一个清单吧。</p>';
    $('#calendar-events').innerHTML=$('#calendar-events-modal').innerHTML=markup;
  }
  function render() { const state=evaluate();renderTree(state);renderCards(state);renderStats(state);renderCalendar(state); }
  function setView(next) {
    view=next==='done'?'done':'todo';
    $('#todo-view').hidden=view!=='todo'; $('#done-view').hidden=view!=='done';
    $$('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);if(b.getAttribute('role')==='tab')b.setAttribute('aria-selected',String(b.dataset.view===view));});
  }
  function selectNode(id) {
    if(id&&!byId(id))return;
    selectedId=id;
    let cursor=byId(id)?.parentId; const seen=new Set();
    while(cursor&&!seen.has(cursor)){seen.add(cursor);const n=byId(cursor);if(!n)break;n.collapsed=false;cursor=n.parentId;}
    render();
  }
  function showDialog(dialog){if(dialog&&!dialog.open)dialog.showModal();}
  function closeDialog(dialog){if(dialog?.open)dialog.close();}
  function openNode(node=null,parentId='',selected='') {
    $('#node-form').reset();
    $('#edit-node-id').value=node?.id||'';
    $('#node-dialog-title').textContent=node?'编辑清单':parentId?'新增子清单':'创建清单';
    $('#node-submit').innerHTML=`${node?'保存更改':'创建清单'} <svg><use href="#i-arrow"/></svg>`;
    $('#node-name').value=node?.name||'';
    const effectiveParent=node?node.parentId:parentId;
    $('#node-parent').innerHTML=options(effectiveParent,node?.id||'');
    $('#node-category').value=node?.category||'side'; $('#node-xp').value=String(node?.xp||30);
    $('#node-due').value=node?.due||(selected?`${selected}T18:00`:'');
    $('#node-reminder').value=node?.reminderMinutes==null?'':String(node.reminderMinutes);
    $('#node-note').value=node?.note||'';
    closeDialog($('#calendar-dialog'));showDialog($('#node-dialog'));$('#node-name').focus();
  }
  function saveNode(event) {
    event.preventDefault();const name=$('#node-name').value.trim(),parentId=$('#node-parent').value;
    const id=$('#edit-node-id').value, existing=byId(id),due=$('#node-due').value,reminder=$('#node-reminder').value;
    if(!name){toast('请输入清单名称。');return;}
    if(parentId&&!byId(parentId)){toast('上级清单不存在。');return;}
    if(reminder!==''&&!due){toast('设置提醒需要先填写日期。');return;}
    if(existing && descendantIds(id).has(parentId)){toast('不能把清单移动到自己的后代节点。');return;}
    const patch={name,parentId,category:$('#node-category').value,xp:Number($('#node-xp').value),due,
      reminderMinutes:reminder===''?null:Number(reminder),note:$('#node-note').value.trim(),notifiedAt:null};
    if(existing)Object.assign(existing,patch);
    else { const node=normalize({id:uid(),...patch});nodes.push(node);selectedId=node.id; }
    save();render();closeDialog($('#node-dialog'));setView('todo');
    toast(existing?'清单已更新。':'新清单创建成功。');
  }
  function toast(message){const el=document.createElement('div');el.className='toast';el.textContent=message;$('#toast-stack').append(el);setTimeout(()=>{el.classList.add('leaving');setTimeout(()=>el.remove(),270);},3200);}
  function burst(x,y,count=24){if(lowMotion||matchMedia('(prefers-reduced-motion: reduce)').matches)return;const layer=$('#effects-layer'),colors=['#76f8d0','#ffda83','#86c7ff','#faad68'];for(let i=0;i<count;i++){const el=document.createElement('i');el.className='confetti-particle';const a=Math.random()*Math.PI*2,d=70+Math.random()*190;Object.entries({'--start-x':`${x}px`,'--start-y':`${y}px`,'--dx':`${Math.cos(a)*d}px`,'--dy':`${Math.sin(a)*d+75}px`,'--rot':`${Math.random()*800-400}deg`,'--duration':`${700+Math.random()*800}ms`,'--particle-color':colors[i%colors.length]}).forEach(([k,v])=>el.style.setProperty(k,v));layer.append(el);setTimeout(()=>el.remove(),1700);}}
  function finishLeaf(id,button){
    const node=byId(id),before=evaluate(); if(!node || !before.get(id).leaf || before.get(id).done)return;
    const oldLevel=getLevel(before),now=new Date().toISOString(),r=button?.getBoundingClientRect();
    node.manualDone=true;node.completedAt=now;const after=evaluate();
    const newly=nodes.filter(n=>!before.get(n.id).done&&after.get(n.id).done);
    const parents=newly.filter(n=>n.id!==id);const gained=newly.reduce((sum,n)=>sum+n.xp,0);
    save();
    const x=r?r.x+r.width/2:innerWidth/2,y=r?r.y+r.height/2:innerHeight/2;
    burst(x,y,parents.length?52:25);
    const card=button?.closest('.quest-card');if(card&&!lowMotion)card.classList.add('card-finish');
    setTimeout(()=>{
      render();
      $('#victory-headline').textContent=getLevel(after)>oldLevel?'等级提升！':parents.length?`${parents.length} 层父清单连锁通关！`:'清单通关！';
      $('#victory-caption').textContent=parents.length?`子清单已全部完成，自动点亮：${parents.slice(0,3).map(n=>n.name).join('、')}${parents.length>3?' 等':''}`:'继续完成其他叶子清单，一步步解锁上级。';
      $('#victory-xp').textContent=`+${gained} XP`;showDialog($('#victory-dialog'));
      if(parents.length)burst(innerWidth/2,innerHeight/2,65);
    },lowMotion?0:280);
  }
  function restoreLeaf(id) {
    const node=byId(id),state=evaluate();if(!node||!state.get(id).leaf||!state.get(id).done)return;
    node.manualDone=false;node.completedAt=null;save();render();toast('已恢复为进行中；相关父清单同步重新计算。');
  }
  function deleteNode(id){
    const node=byId(id);if(!node)return;
    const children=childrenOf(id),message=`删除清单「${node.name}」？\n\n${children.length} 个直属子清单将移至上级，不会删除。`;
    if(!confirm(message))return;
    for(const child of children)child.parentId=node.parentId;
    nodes=nodes.filter(n=>n.id!==id);
    if(selectedId===id)selectedId=node.parentId;
    save();render();toast('清单已删除，子清单已保留。');
  }
  function icsEscape(value){return String(value).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');}
  const icsUtc=date=>date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  function exportICS(node){
    if(!node.due){toast('请先为清单设置计划时间。');return;}
    const start=new Date(node.due),end=new Date(start.getTime()+1800000);
    if(Number.isNaN(start.valueOf())){toast('日期无效。');return;}
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//QUEST ARCADE//CN','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:${node.id}@quest-arcade.local`,`DTSTAMP:${icsUtc(new Date())}`,`DTSTART:${icsUtc(start)}`,`DTEND:${icsUtc(end)}`,`SUMMARY:${icsEscape(node.name)}`,`DESCRIPTION:${icsEscape(node.note||'QUEST ARCADE 清单')}`];
    if(node.reminderMinutes!=null)lines.push('BEGIN:VALARM','ACTION:DISPLAY',`DESCRIPTION:${icsEscape(node.name)}`,`TRIGGER:${node.reminderMinutes===0?'PT0S':`-PT${node.reminderMinutes}M`}`,'END:VALARM');
    lines.push('END:VEVENT','END:VCALENDAR');const url=URL.createObjectURL(new Blob([lines.join('\r\n')+'\r\n'],{type:'text/calendar;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`quest-${dateKey(start)}.ics`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1800);toast('已生成日历文件，导入后提醒取决于日历应用。');
  }
  function openAI(){showDialog($('#ai-dialog'));$('#ai-input').focus();}
  function chat(sender,message){const el=document.createElement('div');el.className=`chat-message ${sender}`;const head=document.createElement('span');head.className='chat-role';head.textContent=sender==='bot'?'Q-BOT':'YOU';const p=document.createElement('p');p.textContent=message;el.append(head,p);$('#ai-chat').append(el);$('#ai-chat').scrollTop=$('#ai-chat').scrollHeight;}
  const cnNumber = text => {
    if (/^\d+$/.test(text)) return Number(text);
    const nums = { 零:0, 〇:0, 一:1, 二:2, 两:2, 三:3, 四:4, 五:5, 六:6, 七:7, 八:8, 九:9 };
    if (text.includes('十')) { const [left,right] = text.split('十'); return (left ? nums[left] : 1) * 10 + (right ? nums[right] : 0); }
    return nums[text] ?? null;
  };
  function parseDue(text) {
    const now = new Date();
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let hasDate = false, hasTime = false;
    const explicit = text.match(/(?:(\d{4})[年/.-])?(\d{1,2})[月/.-](\d{1,2})日?/);
    if (explicit) {
      const year = explicit[1] ? Number(explicit[1]) : now.getFullYear();
      date.setFullYear(year, Number(explicit[2]) - 1, Number(explicit[3]));
      if (!explicit[1] && date < new Date(now.getFullYear(), now.getMonth(), now.getDate())) date.setFullYear(year + 1);
      hasDate = true;
    } else if (/后天/.test(text)) { date.setDate(date.getDate() + 2); hasDate = true; }
    else if (/明天|明早|明晚/.test(text)) { date.setDate(date.getDate() + 1); hasDate = true; }
    else if (/今天|今晚|今早|今日/.test(text)) hasDate = true;
    else {
      const weekday = text.match(/(下周|本周|这周|周|星期)([一二三四五六日天])/);
      if (weekday) {
        const dnum = {一:1,二:2,三:3,四:4,五:5,六:6,日:0,天:0}[weekday[2]];
        const offset = (dnum - now.getDay() + 7) % 7;
        date.setDate(date.getDate() + offset + (weekday[1] === '下周' ? (offset === 0 ? 7 : 7) : (offset === 0 && weekday[1] === '周' ? 7 : 0)));
        hasDate = true;
      }
    }
    const time = text.match(/(凌晨|清晨|早上|上午|中午|下午|傍晚|晚上|今晚|明晚)?\s*([零〇一二两三四五六七八九十\d]{1,3})(?:[:：]([0-5]\d)|\s*点(?:\s*([零〇一二两三四五六七八九十\d]{1,3})\s*分?|半)?)/);
    if (time) {
      let hour = cnNumber(time[2]);
      if (hour != null && hour <= 23) {
        let minute = 0;
        if (time[3]) minute = Number(time[3]);
        else if (time[4] === '半') minute = 30;
        else if (time[4]) minute = cnNumber(time[4]) || 0;
        const period = time[1] || (text.includes('下午') ? '下午' : text.includes('晚上') ? '晚上' : '');
        if (/下午|晚上|傍晚|今晚|明晚/.test(period) && hour < 12) hour += 12;
        if (/凌晨|清晨|上午|早上/.test(period) && hour === 12) hour = 0;
        date.setHours(hour, minute, 0, 0); hasTime = true;
      }
    }
    if (!hasTime && (/今晚|晚上/.test(text))) { date.setHours(21, 0, 0, 0); hasTime = true; }
    if (!hasTime && /上午|早上/.test(text)) { date.setHours(9, 0, 0, 0); hasTime = true; }
    if (!hasTime && /下午/.test(text)) { date.setHours(15, 0, 0, 0); hasTime = true; }
    if (hasDate && !hasTime) date.setHours(18, 0, 0, 0);
    if (hasTime && !hasDate && date < now) date.setDate(date.getDate() + 1);
    return hasDate || hasTime ? dateTimeLocal(date) : '';
  }
  function extractTitle(text) {
    let title = text
      .replace(/(?:(?:\d{4})[年/.-])?\d{1,2}[月/.-]\d{1,2}日?/g, '')
      .replace(/今天|明天|后天|今晚|今早|明早|明晚|本周|这周|下周|每天|每日|周[一二三四五六日天]|星期[一二三四五六日天]/g, '')
      .replace(/(?:凌晨|清晨|早上|上午|中午|下午|傍晚|晚上)?\s*[零〇一二两三四五六七八九十\d]{1,3}(?:[:：][0-5]\d|\s*点(?:\s*[零〇一二两三四五六七八九十\d]{1,3}\s*分?|半)?)/g, '')
      .replace(/提前\s*\d+\s*(?:分钟|小时)\s*提醒(?:我)?/g, '')
      .replace(/(?:请|帮我|我想|需要|记得|提醒我|设置闹钟|加个闹钟|创建待办|添加待办|安排一下)/g, '')
      .replace(/(?:拆解|分成|拆分)\s*(?:成)?\s*\d+\s*(?:步|个任务|部分)/g, '')
      .replace(/^[，,、\s在于的前要]+|[，,、\s。！!]+$/g, '').trim();
    if (!title) title = text.slice(0, 60).trim();
    return title.slice(0, 90);
  }
  function parseTasks(message) {
    // Deliberately deterministic, offline rule-based demo — NOT AI inference.
    const segments = message.split(/[\n;；。]+|[，,](?=(?:今天|明天|后天|上午|下午|晚上|凌晨|中午|今晚|周[一二三四五六日天]|星期|每天))|[，,](?=然后|再|还有)/).map(s => s.replace(/^(然后|再|还有)/, '').trim()).filter(Boolean);
    const extracted = [];
    let lastExplicitDate = '';
    for (const segment of segments.slice(0, 12)) {
      const ahead = segment.match(/提前\s*(\d+)\s*(分钟|小时)\s*提醒/);
      let reminder = ahead ? Number(ahead[1]) * (ahead[2] === '小时' ? 60 : 1) : /提醒|闹钟|通知/.test(segment) ? 10 : null;
      if (reminder != null && reminder > 1440) reminder = 1440;
      let due = parseDue(segment);
      const mentionsDate = /今天|明天|后天|今晚|今早|明早|明晚|本周|这周|下周|周[一二三四五六日天]|星期[一二三四五六日天]|\d{1,2}[月/.-]\d{1,2}/.test(segment);
      if (mentionsDate && due) lastExplicitDate = due.slice(0, 10);
      else if (due && lastExplicitDate) due = `${lastExplicitDate}${due.slice(10)}`;
      if (!due) reminder = null;
      const repeat = /每天|每日|天天/.test(segment) ? 'daily' : 'none';
      const category = repeat === 'daily' || /学习|日语|锻炼|健身|复习/.test(segment) ? 'daily' : /项目|工作|开发|完成|报告|会议/.test(segment) ? 'main' : 'side';
      const xp = category === 'main' ? 30 : 15;
      const title = extractTitle(segment);
      const split = segment.match(/(?:拆解|分成|拆分)\s*(?:成)?\s*([2-5])\s*(?:步|个任务|部分)/);
      if (split) {
        const count = Number(split[1]);
        const prefixes = count === 2 ? ['规划', '执行'] : count === 3 ? ['规划', '执行', '检查'] : ['规划', '准备', '执行', '检查', '复盘'].slice(0, count);
        prefixes.forEach(prefix => extracted.push({ title: `${prefix}｜${title}`, due, reminderMinutes: reminder, repeat, category, xp }));
      } else extracted.push({ title, due, reminderMinutes: reminder, repeat, category, xp });
    }
    return extracted;
  }
  function parseSuggestions(message) {
    const lines=message.split(/\n|[；;]/).map(s=>s.trim()).filter(Boolean);
    const result=[];
    for(const line of lines.slice(0,15)) {
      if(/[>＞→]/.test(line)) {
        // Explicit A > B > C hierarchy: all segments are lists, not subtasks.
        const path=line.split(/\s*(?:>|＞|→)\s*/).map(s=>s.trim()).filter(Boolean);
        if(path.length>1) {
          result.push({path:path.join(' > '),due:'',reminderMinutes:null,parentId:selectedId});
          continue;
        }
      }
      for(const item of parseTasks(line)) {
        let path=item.title;
        const step=item.title.match(/^(规划|准备|执行|检查|复盘)｜(.+)$/);
        if(step)path=`${step[2]} > ${step[1]}`;
        result.push({path,due:item.due,reminderMinutes:item.reminderMinutes,parentId:selectedId});
      }
    }
    return result.slice(0,20);
  }
  function renderPreview(){
    $('#ai-preview-list').innerHTML=preview.map((v,index)=>`<div class="preview-item" data-preview-index="${index}">
      <label class="ai-preview-path">层级路径（用 &gt; 分隔）<input class="preview-path" maxlength="260" aria-label="清单层级路径" value="${escapeHTML(v.path)}" /></label>
      <input type="datetime-local" class="preview-due" aria-label="计划时间" value="${escapeHTML(v.due)}" />
      <select class="preview-parent" aria-label="起始上级清单">${options(v.parentId)}</select>
      <select class="preview-reminder" aria-label="提醒设置"><option value="" ${v.reminderMinutes==null?'selected':''}>不提醒</option>${[0,5,10,15,30,60,120,1440].map(n=>`<option value="${n}" ${v.reminderMinutes===n?'selected':''}>${n?'提前'+n+'分钟':'准时提醒'}</option>`).join('')}</select>
      <small>逐级生成子清单 · 完成状态自动从叶子向上汇总</small>
    </div>`).join('');
    $('#preview-count').textContent=`${preview.length} 个候选路径`;
    $('#ai-preview').hidden=preview.length===0;
    $('#ai-chat').scrollTop=$('#ai-chat').scrollHeight;
  }
  function runParse(message){
    if(!message.trim())return;
    chat('user',message.trim());preview=parseSuggestions(message.trim());
    chat('bot',preview.length?`已使用离线规则整理出 ${preview.length} 个候选清单路径。支持“项目 > 阶段 > 事项”，请修改预览后确认创建。`:'暂未识别清单，请试试「旅行 > 交通 > 购买机票」。');
    renderPreview();$('#ai-input').value='';
  }
  function confirmPreview(){
    const candidates=[];
    for(const el of $$('.preview-item')){
      const segments=$('.preview-path',el).value.split(/\s*(?:>|＞|→)\s*/).map(s=>s.trim()).filter(Boolean);
      const parentId=$('.preview-parent',el).value,due=$('.preview-due',el).value,reminderRaw=$('.preview-reminder',el).value;
      if(!segments.length){toast('候选清单名称不能为空。');return;}
      if(!segments.every(s=>s.length<=90)){toast('每层清单名称不能超过 90 字。');return;}
      if(reminderRaw!==''&&!due){toast('提醒需要先设置计划时间。');return;}
      if(parentId&&!byId(parentId)){toast('上级清单无效。');return;}
      candidates.push({segments,parentId,due,reminderMinutes:reminderRaw===''?null:Number(reminderRaw)});
    }
    let created=0, last='';
    for(const {segments,parentId,due,reminderMinutes} of candidates){
      let parent=parentId;
      for(let i=0;i<segments.length;i++){
        const name=segments[i],leaf=i===segments.length-1;
        let item=nodes.find(n=>n.parentId===parent&&n.name===name);
        // Existing same-name intermediate list is reused; single leaf is created unless we are forming a path.
        if(!item || (leaf&&segments.length===1)) {
          item=normalize({id:uid(),name,parentId:parent,category:'side',xp:leaf?30:50,
            due:leaf?due:'',reminderMinutes:leaf?reminderMinutes:null});
          nodes.push(item);created++;
        } else if(leaf&&due&&!item.due){item.due=due;item.reminderMinutes=reminderMinutes;}
        parent=item.id;last=item.id;
      }
    }
    save();preview=[];$('#ai-preview').hidden=true;
    if(last)selectNode(last);else render();
    setView('todo');closeDialog($('#ai-dialog'));
    chat('bot',`清单树已更新：新增 ${created} 个节点。`);toast(`新增 ${created} 个清单节点。`);
  }
  async function requestNotifications(){
    if(!('Notification'in window)){toast('浏览器不支持通知，可导出 .ics。');return;}
    if(!window.isSecureContext){toast('浏览器通知需要 HTTPS 或 localhost。');return;}
    try {const p=await Notification.requestPermission();toast(p==='granted'?'通知已授权（仅网页运行时检查）。':'通知未获授权，可导出日历。');}
    catch{toast('无法申请通知权限。');}
  }
  function checkReminders(){
    const state=evaluate(), now=Date.now();let changed=false;
    for(const node of nodes){
      if(state.get(node.id).done||!node.due||node.reminderMinutes==null||node.notifiedAt)continue;
      const at=new Date(node.due).getTime()-node.reminderMinutes*60000;
      if(!Number.isFinite(at)||at>now||now-at>10800000)continue;
      node.notifiedAt=new Date().toISOString();changed=true;toast(`清单提醒：${node.name}`);
      if('Notification'in window&&Notification.permission==='granted'&&window.isSecureContext){
        try{new Notification('QUEST ARCADE · 清单提醒',{body:node.name,icon:'assets/icon.svg',tag:`quest-${node.id}`});}catch{}
      }
    }
    if(changed)save();
  }
  function initEvents(){
    document.addEventListener('click',event=>{
      const btn=event.target.closest('button');if(!btn)return;
      if(btn.hasAttribute('data-close-dialog')){closeDialog(btn.closest('dialog'));return;}
      if(btn.hasAttribute('data-open-task')){openNode(null,selectedId);return;}
      if(btn.hasAttribute('data-list-create')){openNode(null,btn.dataset.listCreate);return;}
      if(btn.hasAttribute('data-node-create')){openNode(null,btn.dataset.nodeCreate);return;}
      if(btn.hasAttribute('data-node-edit')){openNode(byId(btn.dataset.nodeEdit));return;}
      if(btn.hasAttribute('data-node-delete')){deleteNode(btn.dataset.nodeDelete);return;}
      if(btn.hasAttribute('data-node-select')){selectNode(btn.dataset.nodeSelect);return;}
      if(btn.hasAttribute('data-node-toggle')){const node=byId(btn.dataset.nodeToggle);if(node){node.collapsed=!node.collapsed;save();render();}return;}
      if(btn.hasAttribute('data-node-complete')){finishLeaf(btn.dataset.nodeComplete,btn);return;}
      if(btn.hasAttribute('data-node-restore')){restoreLeaf(btn.dataset.nodeRestore);return;}
      if(btn.hasAttribute('data-node-calendar')){const node=byId(btn.dataset.nodeCalendar);if(node)exportICS(node);return;}
      if(btn.hasAttribute('data-view')){setView(btn.dataset.view);return;}
      if(btn.hasAttribute('data-filter')){filter=['all','today','upcoming'].includes(btn.dataset.filter)?btn.dataset.filter:'all';$$('[data-filter]').forEach(b=>b.classList.toggle('active',b.dataset.filter===filter));renderCards(evaluate());return;}
      if(btn.hasAttribute('data-open-ai')){openAI();return;}
      if(btn.hasAttribute('data-open-calendar')){showDialog($('#calendar-dialog'));return;}
      if(btn.hasAttribute('data-month-step')){const next=new Date(currentYear,currentMonth+Number(btn.dataset.monthStep),1);currentYear=next.getFullYear();currentMonth=next.getMonth();renderCalendar(evaluate());return;}
      if(btn.hasAttribute('data-cal-date')){selectedDate=btn.dataset.calDate;const d=new Date(`${selectedDate}T12:00:00`);currentYear=d.getFullYear();currentMonth=d.getMonth();renderCalendar(evaluate());return;}
      if(btn.hasAttribute('data-add-selected')){openNode(null,selectedId,selectedDate);return;}
      if(btn.hasAttribute('data-ai-example')){runParse(btn.dataset.aiExample);return;}
    });
    $('#node-form').addEventListener('submit',saveNode);
    $('#ai-compose').addEventListener('submit',event=>{event.preventDefault();runParse($('#ai-input').value);});
    $('#ai-input').addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();$('#ai-compose').requestSubmit();}});
    $('#ai-confirm').addEventListener('click',confirmPreview);
    $('#notifications-button').addEventListener('click',requestNotifications);
    $('#motion-toggle').addEventListener('click',()=>{lowMotion=!lowMotion;document.body.classList.toggle('reduce-motion',lowMotion);localStorage.setItem(MOTION_KEY,lowMotion?'off':'on');$('#motion-toggle').classList.toggle('active',lowMotion);toast(lowMotion?'动画已关闭。':'动画已开启。');});
    $('#motion-toggle').classList.toggle('active',lowMotion);
    $$('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog)closeDialog(dialog);}));
    document.addEventListener('visibilitychange',()=>{if(!document.hidden){renderStats(evaluate());checkReminders();}});
    setInterval(checkReminders,30000);
  }
  initEvents();render();checkReminders();
})();
