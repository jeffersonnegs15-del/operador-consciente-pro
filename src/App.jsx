import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, ReferenceLine
} from "recharts";

const G = {
  bg0:"#020408",bg1:"#050810",bg2:"#080d18",bg3:"#0c1220",bg4:"#101828",
  au:"#c89520",auL:"#dead3a",auXL:"#f0c84a",auDim:"rgba(200,149,32,0.10)",
  up:"#00b87c",upDim:"rgba(0,184,124,0.10)",
  dn:"#d93030",dnDim:"rgba(217,48,48,0.10)",
  bl:"#1a84c8",cy:"#00a8bc",pu:"#8050f0",am:"#e8960a",amDim:"rgba(232,150,10,0.10)",
  t0:"#d8e8f4",t1:"#8096aa",t2:"#3a5068",
  b0:"rgba(200,149,32,0.07)",b1:"rgba(200,149,32,0.16)",
  mono:"'IBM Plex Mono','Fira Code','Consolas',monospace",
  serif:"'Palatino Linotype',Georgia,serif",
  sans:"'DM Sans','Segoe UI',system-ui,sans-serif",
  r:"7px",rL:"12px",
};

const DB = {
  get:(k,d=null)=>{try{const v=localStorage.getItem(`ocp_${k}`);return v!=null?JSON.parse(v):d;}catch{return d;}},
  set:(k,v)=>{try{localStorage.setItem(`ocp_${k}`,JSON.stringify(v));}catch{}},
};

const fmt = {
  brl:(v)=>`R$${Number(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}`,
  pct:(v,d=1)=>`${Number(v||0).toFixed(d)}%`,
  n:(v,d=2)=>Number(v||0).toFixed(d),
  date:()=>new Date().toLocaleDateString("pt-BR"),
  time:()=>new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}),
  short:(s,n=14)=>s?.length>n?s.substring(0,n)+"…":s||"",
};

const SETUPS = ["Pullback/Fibonacci","Rompimento/Retest","Reversão/Exaustão","VWAP Bounce","Abertura — Momentum","Gap Fill","Lateralidade/Range","Outro"];
const EMOCOES = ["Calmo","Confiante","Ansioso","Eufórico","Frustrado","Impaciente","Com Medo"];

function calcStats(trades=[]) {
  if(!trades.length) return {lucro:0,wins:0,losses:0,wr:0,rrMed:0,maxDD:0,pf:0,ev:0,avgWin:0,avgLoss:1,n:0,sharpe:0,bySetup:{}};
  const W=trades.filter(t=>t.lucro>0),L=trades.filter(t=>t.lucro<0);
  const lucro=trades.reduce((a,t)=>a+t.lucro,0);
  const wr=(W.length/trades.length)*100;
  const rrMed=trades.reduce((a,t)=>a+(+t.rr||0),0)/trades.length;
  const avgWin=W.length?W.reduce((a,t)=>a+t.lucro,0)/W.length:0;
  const avgLoss=L.length?Math.abs(L.reduce((a,t)=>a+t.lucro,0)/L.length):1;
  const pf=L.length?(avgWin*W.length)/(avgLoss*L.length):0;
  const ev=(wr/100)*avgWin-(1-wr/100)*avgLoss;
  let peak=0,maxDD=0,acc=0;
  trades.forEach(t=>{acc+=t.lucro;if(acc>peak)peak=acc;const d=peak-acc;if(d>maxDD)maxDD=d;});
  const ret=trades.map(t=>t.lucro),mn=ret.reduce((a,b)=>a+b,0)/ret.length;
  const va=ret.reduce((a,b)=>a+(b-mn)**2,0)/ret.length;
  const sharpe=va>0?(mn/Math.sqrt(va))*Math.sqrt(252):0;
  const bySetup={};
  trades.forEach(t=>{const k=t.setup||"?";if(!bySetup[k])bySetup[k]={l:0,n:0,w:0};bySetup[k].l+=t.lucro;bySetup[k].n++;if(t.lucro>0)bySetup[k].w++;});
  return {lucro,wins:W.length,losses:L.length,wr,rrMed,maxDD,pf,ev,avgWin,avgLoss,n:trades.length,sharpe,bySetup};
}

function calcTrib(trades=[]) {
  const m={};
  trades.forEach(t=>{
    if(!t.data)return;
    const parts=t.data.split("/");
    if(parts.length<3)return;
    const k=`${parts[2]}-${parts[1]}`;
    if(!m[k])m[k]={lucro:0,prej:0,irrf:0,n:0};
    m[k].n++;
    if(t.lucro>0){m[k].lucro+=t.lucro;m[k].irrf+=t.lucro*0.01;}
    else m[k].prej+=Math.abs(t.lucro);
  });
  let saldo=0;
  return Object.entries(m).sort().map(([mes,d])=>{
    const res=d.lucro-d.prej;
    const base=Math.max(0,res-saldo);
    saldo=Math.max(0,saldo-Math.max(0,res));
    if(res<0)saldo+=Math.abs(res);
    const devido=base*0.20;
    const darf=Math.max(0,devido-d.irrf);
    return{mes,lucro:d.lucro,prej:d.prej,base,irrf:d.irrf,devido,darf,n:d.n};
  });
}

function Kard({children,title,color=G.au,style,pad=true}){
  return(
    <div style={{background:G.bg2,border:`1px solid ${G.b0}`,borderRadius:G.rL,overflow:"hidden",...style}}>
      {title&&<div style={{padding:"8px 14px",borderBottom:`1px solid ${G.b0}`,background:G.bg3}}>
        <span style={{fontSize:9,color,fontWeight:"bold",textTransform:"uppercase",letterSpacing:"2px",fontFamily:G.mono}}>{title}</span>
      </div>}
      <div style={pad?{padding:14}:{}}>{children}</div>
    </div>
  );
}

function KStat({label,value,color=G.au,sub,tiny}){
  return(
    <div style={{background:G.bg3,border:`1px solid ${color}14`,borderRadius:G.r,padding:tiny?"9px 10px":"13px 14px",textAlign:"center"}}>
      <div style={{fontSize:tiny?14:21,fontWeight:"bold",color,fontFamily:G.mono,lineHeight:1}}>{value}</div>
      <div style={{fontSize:8,color:G.t2,textTransform:"uppercase",letterSpacing:"1.5px",marginTop:4,fontFamily:G.mono}}>{label}</div>
      {sub&&<div style={{fontSize:9,color:G.t1,marginTop:2}}>{sub}</div>}
    </div>
  );
}

function KBtn({children,onClick,v="p",sm,full,disabled,style}){
  const C={p:[G.au,"#000"],s:[G.up,"#000"],d:[G.dn,"#fff"],g:["transparent",G.au],m:[G.bg4,G.t1]};
  const[bg,fg]=C[v]||C.p;
  return(
    <button onClick={onClick} disabled={disabled}
      style={{display:"block",width:full?"100%":"auto",padding:sm?"5px 11px":"8px 16px",
      background:v==="g"?"transparent":bg,border:`1px solid ${v==="g"?G.b1:bg}`,
      borderRadius:G.r,color:fg,fontWeight:"bold",cursor:disabled?"not-allowed":"pointer",
      fontSize:sm?10:12,fontFamily:G.mono,opacity:disabled?0.45:1,whiteSpace:"nowrap",
      transition:"all 0.12s",...style}}>
      {children}
    </button>
  );
}

function KInp({label,value,onChange,type="text",placeholder,sm,rows}){
  return(
    <div style={{marginBottom:10}}>
      {label&&<div style={{fontSize:8,color:G.t2,marginBottom:3,textTransform:"uppercase",letterSpacing:"1.5px",fontFamily:G.mono}}>{label}</div>}
      {rows
        ?<textarea value={value} rows={rows} onChange={onChange} placeholder={placeholder}
          style={{width:"100%",padding:"8px 10px",background:G.bg4,border:`1px solid ${G.b0}`,borderRadius:G.r,color:G.t0,fontSize:12,fontFamily:G.sans,resize:"vertical",boxSizing:"border-box",outline:"none"}}/>
        :<input type={type} value={value} onChange={onChange} placeholder={placeholder}
          style={{width:"100%",padding:sm?"7px 9px":"9px 11px",background:G.bg4,border:`1px solid ${G.b0}`,borderRadius:G.r,color:G.t0,fontSize:sm?11:12,fontFamily:G.mono,boxSizing:"border-box",outline:"none"}}/>
      }
    </div>
  );
}

function KSel({label,value,onChange,options,sm}){
  return(
    <div style={{marginBottom:10}}>
      {label&&<div style={{fontSize:8,color:G.t2,marginBottom:3,textTransform:"uppercase",letterSpacing:"1.5px",fontFamily:G.mono}}>{label}</div>}
      <select value={value} onChange={onChange}
        style={{width:"100%",padding:sm?"7px 9px":"9px 11px",background:G.bg4,border:`1px solid ${G.b0}`,borderRadius:G.r,color:G.t0,fontSize:sm?11:12,fontFamily:G.mono}}>
        {options.map(o=><option key={o?.v??o} value={o?.v??o}>{o?.l??o}</option>)}
      </select>
    </div>
  );
}

function KTag({children,color=G.au,sm}){
  return(
    <span style={{display:"inline-block",padding:sm?"1px 6px":"2px 9px",borderRadius:20,fontSize:sm?8:10,fontWeight:"bold",
      background:`${color}18`,color,border:`1px solid ${color}28`,fontFamily:G.mono,whiteSpace:"nowrap"}}>
      {children}
    </span>
  );
}

function TT({active,payload,label,prefix=""}){
  if(!active||!payload?.length)return null;
  return(
    <div style={{background:G.bg1,border:`1px solid ${G.b1}`,borderRadius:G.r,padding:"8px 12px",fontSize:10,fontFamily:G.mono}}>
      {label&&<div style={{color:G.t1,marginBottom:4}}>{label}</div>}
      {payload.map((p,i)=><div key={i} style={{color:p.color||G.au}}>{p.name}: {prefix}{typeof p.value==="number"?p.value.toFixed(2):p.value}</div>)}
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────
function Dashboard({trades,config}){
  const st=useMemo(()=>calcStats(trades),[trades]);
  const trib=useMemo(()=>calcTrib(trades),[trades]);
  const hoje=fmt.date();
  const todayT=trades.filter(t=>t.data===hoje);
  const stHoje=useMemo(()=>calcStats(todayT),[todayT]);
  const darf=trib.reduce((a,m)=>a+m.darf,0);
  const capital=config.capital||15000;
  const curva=useMemo(()=>{let a=capital;return trades.map((t,i)=>({i:i+1,v:parseFloat((a+=t.lucro).toFixed(2))}));},[trades,capital]);
  const porDia=useMemo(()=>{const m={};trades.forEach(t=>{if(!m[t.data])m[t.data]=0;m[t.data]+=t.lucro;});return Object.entries(m).slice(-20).map(([d,v])=>({d:d?.substring(0,5)||"",v:parseFloat(v.toFixed(2))}));},[trades]);
  const setupPerf=useMemo(()=>Object.entries(st.bySetup||{}).map(([k,v])=>({name:fmt.short(k,12),v:parseFloat(v.l.toFixed(2))})).sort((a,b)=>b.v-a.v),[st]);

  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:8}}>
        <KStat label="Capital" value={fmt.brl(capital+st.lucro)} color={st.lucro>=0?G.up:G.dn} tiny/>
        <KStat label="Hoje" value={fmt.brl(stHoje.lucro)} color={stHoje.lucro>=0?G.up:G.dn} tiny/>
        <KStat label="Winrate" value={fmt.pct(st.wr)} color={st.wr>=55?G.up:G.am} tiny/>
        <KStat label="Profit F." value={fmt.n(st.pf)} color={st.pf>=1.5?G.up:G.am} tiny/>
        <KStat label="EV/Trade" value={fmt.brl(st.ev)} color={st.ev>=0?G.up:G.dn} tiny/>
        <KStat label="DARF" value={fmt.brl(darf)} color={darf>0?G.dn:G.up} tiny/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
        <KStat label="Trades" value={st.n} color={G.bl} tiny/>
        <KStat label="Max DD" value={fmt.brl(st.maxDD)} color={G.dn} tiny/>
        <KStat label="R/R Médio" value={fmt.n(st.rrMed)} color={G.cy} tiny/>
        <KStat label="Sharpe" value={fmt.n(st.sharpe)} color={st.sharpe>=1?G.up:G.am} tiny/>
      </div>
      {darf>0&&<div style={{padding:12,background:G.dnDim,border:`1px solid ${G.dn}40`,borderRadius:G.r,fontSize:12,color:G.dn,fontFamily:G.mono}}>
        ⚠ DARF PENDENTE: {fmt.brl(darf)} — Código 6015 · Último dia útil do próximo mês
      </div>}
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:12}}>
        <Kard title="Curva de Capital">
          {curva.length<2?<div style={{textAlign:"center",padding:36,color:G.t2,fontSize:11}}>Registre trades para visualizar</div>:
          <ResponsiveContainer width="100%" height={170}>
            <AreaChart data={curva}>
              <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={G.au} stopOpacity={0.28}/>
                <stop offset="95%" stopColor={G.au} stopOpacity={0}/>
              </linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke={G.b0}/>
              <XAxis dataKey="i" tick={{fontSize:8,fill:G.t2}}/><YAxis tick={{fontSize:8,fill:G.t2}}/>
              <Tooltip content={<TT prefix="R$"/>}/>
              <Area type="monotone" dataKey="v" stroke={G.au} fill="url(#cg)" strokeWidth={2} dot={false}/>
            </AreaChart>
          </ResponsiveContainer>}
        </Kard>
        <Kard title="Setup Performance">
          {setupPerf.length<1?<div style={{textAlign:"center",padding:36,color:G.t2,fontSize:11}}>Sem dados</div>:
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={setupPerf} layout="vertical">
              <XAxis type="number" tick={{fontSize:8,fill:G.t2}}/>
              <YAxis type="category" dataKey="name" tick={{fontSize:8,fill:G.t2}} width={70}/>
              <Tooltip content={<TT prefix="R$"/>}/>
              <Bar dataKey="v" radius={[0,4,4,0]}>{setupPerf.map((e,i)=><Cell key={i} fill={e.v>=0?G.up:G.dn}/>)}</Bar>
            </BarChart>
          </ResponsiveContainer>}
        </Kard>
      </div>
      <Kard title="Resultado Diário — Últimos 20 Pregões">
        {porDia.length<2?<div style={{textAlign:"center",padding:24,color:G.t2,fontSize:11}}>Sem dados</div>:
        <ResponsiveContainer width="100%" height={110}>
          <BarChart data={porDia}>
            <CartesianGrid strokeDasharray="3 3" stroke={G.b0}/>
            <XAxis dataKey="d" tick={{fontSize:8,fill:G.t2}}/><YAxis tick={{fontSize:8,fill:G.t2}}/>
            <ReferenceLine y={0} stroke={G.b1}/>
            <Tooltip content={<TT prefix="R$"/>}/>
            <Bar dataKey="v" radius={[3,3,0,0]}>{porDia.map((e,i)=><Cell key={i} fill={e.v>=0?G.up:G.dn}/>)}</Bar>
          </BarChart>
        </ResponsiveContainer>}
      </Kard>
    </div>
  );
}

// ── Terminal ───────────────────────────────────────────────────
function Terminal({trades,setTrades,config}){
  const hoje=fmt.date();
  const [form,setForm]=useState({ativo:"WIN",dir:"",contratos:1,setup:"Pullback/Fibonacci",entrada:"",stop:"",alvo:"",emocao:"Calmo",seguiu:false});
  const [checks,setChecks]=useState({e:false,s:false,a:false,n:false,r:false});
  const [open,setOpen]=useState(false);
  const [filtro,setFiltro]=useState("");
  const todayT=trades.filter(t=>t.data===hoje);
  const lucroHoje=todayT.reduce((a,t)=>a+t.lucro,0);
  const stHoje=useMemo(()=>calcStats(todayT),[todayT]);
  const filtrados=filtro?trades.filter(t=>t.data===filtro):trades;

  const preview=useMemo(()=>{
    if(!form.entrada||!form.stop||!form.alvo||!form.dir)return null;
    const e=+form.entrada,a=+form.alvo,s=+form.stop;
    const vp=form.ativo==="WDO"?10.0:0.20;
    const diff=form.dir==="Compra"?a-e:e-a;
    const rPts=Math.abs(e-s);
    const rr=rPts>0?(Math.abs(a-e)/rPts).toFixed(2):"0";
    const liq=diff*form.contratos*vp-form.contratos*(form.ativo==="WDO"?1.14:0.64);
    return{liq:liq.toFixed(2),rr,risco:(rPts*form.contratos*vp).toFixed(2)};
  },[form]);

  const registrar=()=>{
    if(!form.dir||!form.entrada||!form.stop||!form.alvo)return;
    const e=+form.entrada,a=+form.alvo,s=+form.stop;
    const vp=form.ativo==="WDO"?10.0:0.20,c=form.ativo==="WDO"?1.14:0.64;
    const diff=form.dir==="Compra"?a-e:e-a;
    const liq=diff*form.contratos*vp-form.contratos*c;
    const rr=Math.abs(e-s)>0?(Math.abs(a-e)/Math.abs(e-s)).toFixed(2):"0.00";
    setTrades([{id:Date.now(),data:hoje,hora:fmt.time(),ativo:form.ativo,dir:form.dir,contratos:form.contratos,
      setup:form.setup,entrada:e,alvo:a,stop:s,lucro:parseFloat(liq.toFixed(2)),pts:Math.abs(a-e),rr,
      status:liq>0?"Gain":liq<0?"Loss":"BE",emocao:form.emocao,seguiu:form.seguiu,conciliado:false},...trades]);
    setForm(p=>({...p,dir:"",entrada:"",stop:"",alvo:""}));
    setChecks({e:false,s:false,a:false,n:false,r:false});
    setOpen(false);
  };

  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {lucroHoje<=-config.stopDiario&&<div style={{padding:12,background:G.dnDim,border:`1px solid ${G.dn}`,borderRadius:G.r,color:G.dn,fontSize:12,fontFamily:G.mono}}>
        🚨 STOP DIÁRIO ATINGIDO — Feche a plataforma imediatamente.
      </div>}
      {lucroHoje>=(config.metaDiaria||250)&&<div style={{padding:12,background:G.upDim,border:`1px solid ${G.up}`,borderRadius:G.r,color:G.up,fontSize:12,fontFamily:G.mono}}>
        ✅ META DIÁRIA ATINGIDA — Considere encerrar com consistência.
      </div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8}}>
        <KStat label="Hoje" value={fmt.brl(lucroHoje)} color={lucroHoje>=0?G.up:G.dn} tiny/>
        <KStat label="Winrate" value={fmt.pct(stHoje.wr)} color={G.au} tiny/>
        <KStat label="Trades" value={todayT.length} color={G.bl} tiny/>
        <KStat label="R/R Médio" value={fmt.n(stHoje.rrMed)} color={G.cy} tiny/>
        <KStat label="Meta %" value={fmt.pct(config.metaDiaria?(lucroHoje/config.metaDiaria)*100:0,0)} color={G.pu} tiny/>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <KBtn onClick={()=>setOpen(p=>!p)} v={open?"d":"p"}>{open?"✕ Cancelar":"+ Nova Operação"}</KBtn>
        <input type="date" value={filtro} onChange={e=>setFiltro(e.target.value)}
          style={{padding:"6px 10px",background:G.bg3,border:`1px solid ${G.b0}`,borderRadius:G.r,color:G.t0,fontSize:11,fontFamily:G.mono}}/>
        {filtro&&<KBtn sm v="g" onClick={()=>setFiltro("")}>Limpar</KBtn>}
      </div>
      {open&&<Kard title="Registrar Operação WIN/WDO" color={G.cy}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
          <KSel label="Ativo" value={form.ativo} onChange={e=>setForm(p=>({...p,ativo:e.target.value}))} options={["WIN","WDO"]} sm/>
          <KInp label="Contratos" value={form.contratos} onChange={e=>setForm(p=>({...p,contratos:+e.target.value}))} type="number" sm/>
          <KSel label="Setup" value={form.setup} onChange={e=>setForm(p=>({...p,setup:e.target.value}))} options={SETUPS} sm/>
        </div>
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          {["Compra","Venda"].map(d=>(
            <button key={d} onClick={()=>setForm(p=>({...p,dir:d}))}
              style={{flex:1,padding:"8px",borderRadius:G.r,border:`2px solid ${d==="Compra"?G.up:G.dn}${form.dir===d?"cc":"33"}`,
              background:form.dir===d?(d==="Compra"?G.upDim:G.dnDim):"transparent",
              color:d==="Compra"?G.up:G.dn,fontWeight:"bold",cursor:"pointer",fontSize:12,fontFamily:G.mono}}>
              {d==="Compra"?"▲ COMPRA":"▼ VENDA"}
            </button>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          <KInp label="Entrada" value={form.entrada} onChange={e=>setForm(p=>({...p,entrada:e.target.value}))} placeholder={form.ativo==="WIN"?"130000":"5200"} sm/>
          <KInp label="Stop" value={form.stop} onChange={e=>setForm(p=>({...p,stop:e.target.value}))} placeholder={form.ativo==="WIN"?"129800":"5195"} sm/>
          <KInp label="Alvo" value={form.alvo} onChange={e=>setForm(p=>({...p,alvo:e.target.value}))} placeholder={form.ativo==="WIN"?"130600":"5212"} sm/>
        </div>
        {preview&&<div style={{display:"flex",gap:14,padding:"8px 10px",background:G.bg3,borderRadius:G.r,marginBottom:8,fontSize:11,fontFamily:G.mono}}>
          <span><span style={{color:G.t2}}>Potencial: </span><span style={{color:+preview.liq>=0?G.up:G.dn,fontWeight:"bold"}}>{fmt.brl(+preview.liq)}</span></span>
          <span><span style={{color:G.t2}}>R/R: </span><span style={{color:+preview.rr>=1.5?G.up:G.am,fontWeight:"bold"}}>{preview.rr}</span></span>
          <span><span style={{color:G.t2}}>Risco: </span><span style={{color:G.dn,fontWeight:"bold"}}>{fmt.brl(+preview.risco)}</span></span>
        </div>}
        <KSel label="Emoção" value={form.emocao} onChange={e=>setForm(p=>({...p,emocao:e.target.value}))} options={EMOCOES} sm/>
        <div style={{padding:10,background:G.auDim,borderRadius:G.r,marginBottom:10}}>
          <div style={{fontSize:9,color:G.au,fontWeight:"bold",textTransform:"uppercase",letterSpacing:"1.5px",marginBottom:7,fontFamily:G.mono}}>Checklist WIN/WDO</div>
          {[["e","Entrada no nível correto do setup"],["s","Stop baseado em estrutura com folga"],["a","Alvo realista — R/R mínimo 1,5:1"],["n","Índice/Dólar futuro e agenda macro verificados"],["r","Dentro dos parâmetros da fase atual"]].map(([k,l])=>(
            <label key={k} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,cursor:"pointer"}}>
              <input type="checkbox" checked={checks[k]} onChange={e=>setChecks(p=>({...p,[k]:e.target.checked}))} style={{accentColor:G.au}}/>
              <span style={{fontSize:11,color:G.t1,fontFamily:G.sans}}>{l}</span>
            </label>
          ))}
          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
            <input type="checkbox" checked={form.seguiu} onChange={e=>setForm(p=>({...p,seguiu:e.target.checked}))} style={{accentColor:G.up}}/>
            <span style={{fontSize:11,color:G.t1,fontFamily:G.sans}}>Estou 100% dentro do plano</span>
          </label>
        </div>
        <KBtn onClick={registrar} v="s" full>✓ Confirmar Operação</KBtn>
      </Kard>}
      <Kard title={`Operações${filtro?" — "+filtro:" — Todas"}`}>
        {filtrados.length===0?<div style={{textAlign:"center",padding:28,color:G.t2,fontSize:11}}>Nenhuma operação registrada.</div>:
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:10,fontFamily:G.mono}}>
            <thead><tr style={{background:G.bg3}}>
              {["Data","Hora","Ativo","Dir","Cont","Setup","Entrada","Stop","Alvo","Pts","R/R","Lucro","Status","Emoção",""].map(h=>(
                <th key={h} style={{padding:"5px 8px",textAlign:"left",color:G.t2,fontSize:8,borderBottom:`1px solid ${G.b0}`,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{filtrados.map(t=>(
              <tr key={t.id} style={{borderBottom:`1px solid rgba(255,255,255,0.02)`}}>
                <td style={{padding:"5px 8px",color:G.t1}}>{t.data}</td>
                <td style={{padding:"5px 8px",color:G.t1}}>{t.hora}</td>
                <td style={{padding:"5px 8px",color:G.au,fontWeight:"bold"}}>{t.ativo}</td>
                <td style={{padding:"5px 8px",color:t.dir==="Compra"?G.up:G.dn,fontWeight:"bold"}}>{t.dir==="Compra"?"▲":"▼"}</td>
                <td style={{padding:"5px 8px",color:G.t0}}>{t.contratos}</td>
                <td style={{padding:"5px 8px",color:G.t2,fontSize:9}}>{fmt.short(t.setup,14)}</td>
                <td style={{padding:"5px 8px",color:G.t0}}>{t.entrada}</td>
                <td style={{padding:"5px 8px",color:G.dn}}>{t.stop}</td>
                <td style={{padding:"5px 8px",color:G.up}}>{t.alvo}</td>
                <td style={{padding:"5px 8px",color:G.t1}}>{t.pts}</td>
                <td style={{padding:"5px 8px",color:G.pu}}>{t.rr}</td>
                <td style={{padding:"5px 8px",color:t.lucro>=0?G.up:G.dn,fontWeight:"bold"}}>{fmt.brl(t.lucro)}</td>
                <td style={{padding:"5px 8px"}}><KTag color={t.status==="Gain"?G.up:t.status==="Loss"?G.dn:G.am} sm>{t.status}</KTag></td>
                <td style={{padding:"5px 8px",fontSize:9,color:G.t2}}>{t.emocao}</td>
                <td style={{padding:"5px 8px"}}><KBtn sm v="g" onClick={()=>setTrades(trades.filter(x=>x.id!==t.id))} style={{color:G.dn,borderColor:G.dn,padding:"2px 6px"}}>✕</KBtn></td>
              </tr>
            ))}</tbody>
          </table>
        </div>}
      </Kard>
    </div>
  );
}

// ── Diário ─────────────────────────────────────────────────────
function Diario({diario,setDiario,trades}){
  const hoje=fmt.date();
  const todayT=trades.filter(t=>t.data===hoje);
  const [form,setForm]=useState({mercado:"Tendência Alta",emocao:"Calmo",seguiu:"Sim, 100%",setup:"Pullback/Fibonacci",rating:3,acertos:"",erros:"",licao:""});
  const salvar=()=>{
    if(!form.licao.trim())return;
    setDiario([{...form,data:hoje,hora:fmt.time(),lucro:todayT.reduce((a,t)=>a+t.lucro,0),n:todayT.length,id:Date.now()},...diario]);
    setForm(p=>({...p,acertos:"",erros:"",licao:""}));
  };
  return(
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,alignItems:"start"}}>
      <Kard title={`Registro — ${hoje}`} color={G.dn}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <KSel label="Tipo de mercado" value={form.mercado} onChange={e=>setForm(p=>({...p,mercado:e.target.value}))} options={["Tendência Alta","Tendência Baixa","Lateralidade","Misto/Confuso"]} sm/>
          <KSel label="Emoção" value={form.emocao} onChange={e=>setForm(p=>({...p,emocao:e.target.value}))} options={EMOCOES} sm/>
          <KSel label="Seguiu o plano?" value={form.seguiu} onChange={e=>setForm(p=>({...p,seguiu:e.target.value}))} options={["Sim, 100%","Parcialmente","Não"]} sm/>
          <KSel label="Setup principal" value={form.setup} onChange={e=>setForm(p=>({...p,setup:e.target.value}))} options={SETUPS} sm/>
        </div>
        <div style={{marginBottom:10}}>
          <div style={{fontSize:8,color:G.t2,marginBottom:5,textTransform:"uppercase",letterSpacing:"1.5px",fontFamily:G.mono}}>Qualidade do dia</div>
          <div style={{display:"flex",gap:5}}>
            {[1,2,3,4,5].map(v=>(
              <button key={v} onClick={()=>setForm(p=>({...p,rating:v}))}
                style={{flex:1,padding:"6px",borderRadius:G.r,border:`1px solid ${form.rating===v?G.au:G.b0}`,background:form.rating===v?G.auDim:"transparent",color:form.rating===v?G.au:G.t2,cursor:"pointer",fontSize:12,fontFamily:G.mono}}>
                {v}
              </button>
            ))}
          </div>
        </div>
        {[["O que fiz bem","acertos",2],["O que errei","erros",2],["Principal lição","licao",3]].map(([l,k,r])=>(
          <KInp key={k} label={l} value={form[k]} onChange={e=>setForm(p=>({...p,[k]:e.target.value}))} rows={r}/>
        ))}
        <KBtn onClick={salvar} v="p" full>Salvar Registro</KBtn>
      </Kard>
      <Kard title="Histórico do Diário">
        {diario.length===0?<div style={{textAlign:"center",padding:32,color:G.t2,fontSize:11}}>Nenhum registro ainda.</div>:
        <div style={{maxHeight:520,overflowY:"auto"}}>
          {diario.map(e=>(
            <div key={e.id} style={{padding:12,background:G.bg3,borderRadius:G.r,marginBottom:8,border:`1px solid ${G.b0}`}}>
              <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:4,marginBottom:6}}>
                <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
                  <span style={{fontSize:10,color:G.t2,fontFamily:G.mono}}>{e.data}</span>
                  <KTag sm>{e.mercado}</KTag>
                  <KTag color={e.emocao==="Calmo"||e.emocao==="Confiante"?G.up:G.am} sm>{e.emocao}</KTag>
                  <span style={{color:G.au}}>{"★".repeat(e.rating||3)}</span>
                </div>
                <span style={{fontSize:11,color:e.lucro>=0?G.up:G.dn,fontFamily:G.mono,fontWeight:"bold"}}>{fmt.brl(e.lucro||0)}</span>
              </div>
              {e.licao&&<div style={{fontSize:12,color:G.t1,fontStyle:"italic",lineHeight:1.7,fontFamily:G.serif}}>"{e.licao}"</div>}
            </div>
          ))}
        </div>}
      </Kard>
    </div>
  );
}

// ── Gestão de Risco ────────────────────────────────────────────
function GestaoRisco({config,setConfig,trades}){
  const [cap,setCap]=useState(config.capital||15000);
  const [rOp,setROp]=useState(config.riscoOp||1);
  const [rDia,setRDia]=useState(config.riscoDia||2);
  const [pts,setPts]=useState(100);
  const [ativo,setAtivo]=useState("WIN");
  const vp=ativo==="WDO"?10.0:0.20;
  const perdaOp=cap*(rOp/100);
  const riskC=pts*vp;
  const contr=Math.max(1,Math.floor(perdaOp/riskC));
  const perdaDia=cap*(rDia/100);
  const st=useMemo(()=>calcStats(trades),[trades]);
  return(
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,alignItems:"start"}}>
      <Kard title="Calculadora WIN/WDO" color={G.up}>
        <KSel label="Ativo" value={ativo} onChange={e=>setAtivo(e.target.value)} options={["WIN","WDO"]} sm/>
        <KInp label="Capital Total (R$)" value={cap} onChange={e=>setCap(+e.target.value)} type="number" sm/>
        <KInp label="Stop Loss (pontos)" value={pts} onChange={e=>setPts(+e.target.value)} type="number" sm/>
        <div style={{marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
            <span style={{fontSize:8,color:G.t2,textTransform:"uppercase",letterSpacing:"1px",fontFamily:G.mono}}>Risco/Operação</span>
            <span style={{fontSize:11,color:G.up,fontFamily:G.mono,fontWeight:"bold"}}>{rOp}%</span>
          </div>
          <input type="range" min={0.1} max={3} step={0.1} value={rOp} onChange={e=>setROp(+e.target.value)} style={{width:"100%",accentColor:G.up}}/>
        </div>
        <div style={{marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
            <span style={{fontSize:8,color:G.t2,textTransform:"uppercase",letterSpacing:"1px",fontFamily:G.mono}}>Risco Diário</span>
            <span style={{fontSize:11,color:G.dn,fontFamily:G.mono,fontWeight:"bold"}}>{rDia}%</span>
          </div>
          <input type="range" min={0.5} max={5} step={0.5} value={rDia} onChange={e=>setRDia(+e.target.value)} style={{width:"100%",accentColor:G.dn}}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
          <KStat label="Perda Máx/Op" value={fmt.brl(perdaOp)} color={G.am} tiny/>
          <KStat label="Contratos" value={contr} color={G.up} tiny/>
          <KStat label="Risco/Contrato" value={fmt.brl(riskC)} color={G.bl} tiny/>
          <KStat label="Stop Diário" value={fmt.brl(perdaDia)} color={G.dn} tiny/>
        </div>
        <KBtn onClick={()=>setConfig({...config,capital:cap,riscoOp:rOp,riscoDia:rDia,stopDiario:parseFloat(perdaDia.toFixed(2)),metaDiaria:parseFloat((cap*0.016).toFixed(2))})} v="p" full>Salvar Parâmetros</KBtn>
      </Kard>
      <Kard title="EV da Estratégia" color={G.cy}>
        <KStat label="EV por Trade" value={fmt.brl(st.ev)} color={st.ev>=0?G.up:G.dn} sub={st.ev>=0?"estratégia lucrativa":"revise antes de escalar"}/>
        <div style={{marginTop:10,fontSize:11,color:G.t1,lineHeight:1.8,fontFamily:G.sans}}>
          EV positivo = estratégia viável para incrementar contratos. EV negativo = corrija o processo antes de aumentar capital.
        </div>
      </Kard>
    </div>
  );
}

// ── Alertas ────────────────────────────────────────────────────
function Alertas({trades,config}){
  const hoje=fmt.date();
  const todayT=trades.filter(t=>t.data===hoje);
  const lucroHoje=todayT.reduce((a,t)=>a+t.lucro,0);
  const st=useMemo(()=>calcStats(trades),[trades]);
  const trib=useMemo(()=>calcTrib(trades),[trades]);
  const darf=trib.reduce((a,m)=>a+m.darf,0);
  const lista=useMemo(()=>{
    const a=[];
    if(lucroHoje<=-config.stopDiario) a.push({nv:"CRÍTICO",cor:G.dn,ico:"🚨",cat:"Risco",t:"Limite Diário Atingido",m:`Você perdeu ${fmt.brl(Math.abs(lucroHoje))}. Feche a plataforma.`,ac:"Feche agora"});
    if(lucroHoje<0&&Math.abs(lucroHoje)>=config.stopDiario*0.7&&Math.abs(lucroHoje)<config.stopDiario) a.push({nv:"ALERTA",cor:G.am,ico:"⚠️",cat:"Risco",t:"70% do Limite",m:`${fmt.brl(Math.abs(lucroHoje))} de ${fmt.brl(config.stopDiario)} consumido.`,ac:"Reduza para 1 contrato"});
    if(todayT.length>=10) a.push({nv:"ALERTA",cor:G.am,ico:"🔄",cat:"Comportamento",t:"Possível Overtrade",m:`${todayT.length} operações hoje.`,ac:"Pause 30 minutos"});
    let seq=0;for(const t of[...trades].slice(0,5).reverse()){if(t.lucro<0)seq++;else break;}
    if(seq>=3) a.push({nv:"CRÍTICO",cor:G.dn,ico:"🔴",cat:"Psicologia",t:`${seq} Losses Consecutivos`,m:"Risco alto de tilt e vingança.",ac:"Pare, volte amanhã"});
    if(st.n>=20&&st.ev<0) a.push({nv:"CRÍTICO",cor:G.dn,ico:"📉",cat:"Performance",t:"EV Negativo",m:`EV ${fmt.brl(st.ev)}/trade.`,ac:"Pause e revise no simulador"});
    if(darf>0) a.push({nv:"FISCAL",cor:G.au,ico:"📋",cat:"Tributário",t:"DARF Pendente",m:`${fmt.brl(darf)} — Código 6015.`,ac:"Acesse Central Tributária"});
    if(a.length===0) a.push({nv:"OK",cor:G.up,ico:"✅",cat:"Sistema",t:"Nenhum alerta ativo",m:"Tudo dentro dos parâmetros.",ac:""});
    return a.sort((a,b)=>({CRÍTICO:0,ALERTA:1,FISCAL:2,OK:3})[a.nv]-({CRÍTICO:0,ALERTA:1,FISCAL:2,OK:3})[b.nv]);
  },[trades,config,lucroHoje,todayT,st,darf]);

  return(
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {lista.map((a,i)=>(
        <div key={i} style={{padding:14,background:`${a.cor}06`,border:`1px solid ${a.cor}28`,borderRadius:G.rL,borderLeft:`3px solid ${a.cor}`}}>
          <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
            <span style={{fontSize:20,flexShrink:0}}>{a.ico}</span>
            <div style={{flex:1}}>
              <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:4,flexWrap:"wrap"}}>
                <KTag color={a.cor} sm>{a.nv}</KTag>
                <KTag color={G.t2} sm>{a.cat}</KTag>
                <span style={{fontSize:13,fontWeight:"bold",color:"#fff",fontFamily:G.sans}}>{a.t}</span>
              </div>
              <div style={{fontSize:12,color:G.t1,lineHeight:1.7,fontFamily:G.sans,marginBottom:a.ac?5:0}}>{a.m}</div>
              {a.ac&&<div style={{fontSize:11,color:a.cor,fontFamily:G.mono,fontWeight:"bold"}}>→ {a.ac}</div>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Central Tributária ─────────────────────────────────────────
function CentralTributaria({trades}){
  const trib=useMemo(()=>calcTrib(trades),[trades]);
  const ano=new Date().getFullYear().toString();
  const tribAno=trib.filter(m=>m.mes.startsWith(ano));
  const totLucro=tribAno.reduce((a,m)=>a+m.lucro,0);
  const totPrej=tribAno.reduce((a,m)=>a+m.prej,0);
  const totDarf=tribAno.reduce((a,m)=>a+m.darf,0);
  const totIrrf=tribAno.reduce((a,m)=>a+m.irrf,0);
  const totDevido=tribAno.reduce((a,m)=>a+m.devido,0);
  const exportar=()=>{
    const linhas=[`IR DAY TRADE WIN/WDO — ${ano}`,`Lucro: ${fmt.brl(totLucro)} | Prejuízo: ${fmt.brl(totPrej)} | IR: ${fmt.brl(totDevido)} | DARF: ${fmt.brl(totDarf)}`,``,`Mês;Trades;Lucro;Prejuízo;Base;IR;IRRF;DARF`,...tribAno.map(m=>`${m.mes};${m.n};${m.lucro.toFixed(2)};${m.prej.toFixed(2)};${m.base.toFixed(2)};${m.devido.toFixed(2)};${m.irrf.toFixed(2)};${m.darf.toFixed(2)}`)];
    const blob=new Blob([linhas.join("\n")],{type:"text/plain;charset=utf-8"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`IR_WIN_WDO_${ano}.txt`;a.click();
  };
  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {totDarf>0&&<div style={{padding:12,background:G.dnDim,border:`1px solid ${G.dn}40`,borderRadius:G.r,fontSize:12,color:G.dn,fontFamily:G.mono}}>
        ⚠ DARF: {fmt.brl(totDarf)} — Código 6015 — Último dia útil do mês seguinte
      </div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
        <KStat label="Lucro Anual" value={fmt.brl(totLucro)} color={G.up} tiny/>
        <KStat label="Prejuízo Anual" value={fmt.brl(totPrej)} color={G.dn} tiny/>
        <KStat label="DARF a Recolher" value={fmt.brl(totDarf)} color={totDarf>0?G.dn:G.up} tiny/>
      </div>
      <div style={{display:"flex",gap:8}}><KBtn onClick={exportar} v="g">⬇ Exportar TXT</KBtn></div>
      <Kard title={`Apuração — ${ano}`} color={G.am}>
        {tribAno.length===0?<div style={{textAlign:"center",padding:32,color:G.t2,fontSize:11}}>Sem trades no ano.</div>:
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:10,fontFamily:G.mono}}>
            <thead><tr style={{background:G.bg3}}>
              {["Mês","Trades","Lucro","Prejuízo","Base","IR 20%","IRRF 1%","DARF"].map(h=>(
                <th key={h} style={{padding:"5px 8px",textAlign:"right",color:G.t2,fontSize:8,borderBottom:`1px solid ${G.b0}`,textTransform:"uppercase"}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{tribAno.map(m=>(
              <tr key={m.mes} style={{borderBottom:`1px solid rgba(255,255,255,0.02)`}}>
                <td style={{padding:"5px 8px",color:G.t0,textAlign:"right"}}>{m.mes}</td>
                <td style={{padding:"5px 8px",color:G.t1,textAlign:"right"}}>{m.n}</td>
                <td style={{padding:"5px 8px",color:G.up,textAlign:"right"}}>{fmt.brl(m.lucro)}</td>
                <td style={{padding:"5px 8px",color:G.dn,textAlign:"right"}}>{fmt.brl(m.prej)}</td>
                <td style={{padding:"5px 8px",color:G.t0,textAlign:"right"}}>{fmt.brl(m.base)}</td>
                <td style={{padding:"5px 8px",color:G.am,textAlign:"right"}}>{fmt.brl(m.devido)}</td>
                <td style={{padding:"5px 8px",color:G.au,textAlign:"right"}}>{fmt.brl(m.irrf)}</td>
                <td style={{padding:"5px 8px",color:m.darf>0?G.dn:G.up,textAlign:"right",fontWeight:"bold"}}>{fmt.brl(m.darf)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>}
      </Kard>
    </div>
  );
}

// ── Relatórios ─────────────────────────────────────────────────
function Relatorios({trades,config}){
  const st=useMemo(()=>calcStats(trades),[trades]);
  const porSetup=useMemo(()=>Object.entries(st.bySetup||{}).map(([k,v])=>({setup:k,l:parseFloat(v.l.toFixed(2)),n:v.n,wr:v.n?((v.w/v.n)*100).toFixed(0):0})).sort((a,b)=>b.l-a.l),[st]);
  const exportCSV=()=>{
    const h=["ID","Data","Hora","Ativo","Dir","Contratos","Setup","Entrada","Stop","Alvo","Pts","RR","Lucro","Status","Emoção","Seguiu"].join(";");
    const rows=trades.map(t=>[t.id,t.data,t.hora,t.ativo,t.dir,t.contratos,t.setup,t.entrada,t.stop,t.alvo,t.pts,t.rr,t.lucro?.toFixed(2),t.status,t.emocao,t.seguiu?"Sim":"Não"].join(";"));
    const blob=new Blob(["\uFEFF"+[h,...rows].join("\n")],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`OCP_Trades_${new Date().toISOString().substring(0,10)}.csv`;a.click();
  };
  const exportJSON=()=>{
    const blob=new Blob([JSON.stringify({exportadoEm:new Date().toISOString(),config,stats:st,trades},null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`OCP_Backup_${new Date().toISOString().substring(0,10)}.json`;a.click();
  };
  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"flex",gap:8}}><KBtn onClick={exportCSV} v="g">⬇ CSV</KBtn><KBtn onClick={exportJSON} v="g">⬇ Backup JSON</KBtn></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8}}>
        <KStat label="Trades" value={st.n} color={G.bl} tiny/>
        <KStat label="Resultado" value={fmt.brl(st.lucro)} color={st.lucro>=0?G.up:G.dn} tiny/>
        <KStat label="Winrate" value={fmt.pct(st.wr)} color={G.au} tiny/>
        <KStat label="Sharpe" value={fmt.n(st.sharpe)} color={st.sharpe>=1?G.up:G.am} tiny/>
        <KStat label="Max DD" value={fmt.brl(st.maxDD)} color={G.dn} tiny/>
      </div>
      <Kard title="Performance por Setup" color={G.au}>
        {porSetup.length===0?<div style={{textAlign:"center",padding:24,color:G.t2,fontSize:11}}>Sem dados</div>:
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:10,fontFamily:G.mono}}>
          <thead><tr>{["Setup","Trades","WR","Resultado","Avaliação"].map(h=><th key={h} style={{padding:"5px 8px",textAlign:"left",color:G.t2,fontSize:8,borderBottom:`1px solid ${G.b0}`,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
          <tbody>{porSetup.map((r,i)=>(
            <tr key={i} style={{borderBottom:`1px solid rgba(255,255,255,0.02)`}}>
              <td style={{padding:"5px 8px",color:G.au}}>{fmt.short(r.setup,16)}</td>
              <td style={{padding:"5px 8px",color:G.t1}}>{r.n}</td>
              <td style={{padding:"5px 8px",color:+r.wr>=55?G.up:G.am}}>{r.wr}%</td>
              <td style={{padding:"5px 8px",color:r.l>=0?G.up:G.dn,fontWeight:"bold"}}>{fmt.brl(r.l)}</td>
              <td style={{padding:"5px 8px"}}><KTag color={r.l>=0&&+r.wr>=55?G.up:r.l<0?G.dn:G.am} sm>{r.l>=0&&+r.wr>=55?"✓ Forte":r.l>=0?"→ Ok":"✗ Revisar"}</KTag></td>
            </tr>
          ))}</tbody>
        </table>}
      </Kard>
    </div>
  );
}

// ── Configurações ──────────────────────────────────────────────
function Config({config,setConfig}){
  const [form,setForm]=useState({...config});
  const salvar=()=>{setConfig(form);alert("Configurações salvas!");};
  const resetar=()=>{if(window.confirm("Apagar todos os dados?")){Object.keys(localStorage).filter(k=>k.startsWith("ocp_")).forEach(k=>localStorage.removeItem(k));window.location.reload();}};
  return(
    <div style={{maxWidth:560}}>
      <Kard title="Perfil do Operador" color={G.au} style={{marginBottom:12}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <KInp label="Nome" value={form.nome||""} onChange={e=>setForm(p=>({...p,nome:e.target.value}))} sm/>
          <KInp label="Capital Inicial (R$)" value={form.capital||""} onChange={e=>setForm(p=>({...p,capital:+e.target.value}))} type="number" sm/>
          <KInp label="Meta Diária (R$)" value={form.metaDiaria||""} onChange={e=>setForm(p=>({...p,metaDiaria:+e.target.value}))} type="number" sm/>
          <KInp label="Stop Diário (R$)" value={form.stopDiario||""} onChange={e=>setForm(p=>({...p,stopDiario:+e.target.value}))} type="number" sm/>
          <KSel label="Corretora" value={form.corretora||"Clear"} onChange={e=>setForm(p=>({...p,corretora:e.target.value}))} options={["Clear","XP","Rico","BTG","Modal","Genial","NuInvest","Outra"]} sm/>
          <KSel label="Conta" value={form.conta||"Real"} onChange={e=>setForm(p=>({...p,conta:e.target.value}))} options={["Real","Simulador","Prop Firm"]} sm/>
        </div>
      </Kard>
      <div style={{display:"flex",gap:8}}>
        <KBtn onClick={salvar} v="s">Salvar</KBtn>
        <KBtn onClick={resetar} v="d">🗑 Resetar Tudo</KBtn>
      </div>
    </div>
  );
}

// ── Nav & Sidebar ──────────────────────────────────────────────
const NAV=[
  {id:"dashboard",ico:"▣",l:"Dashboard"},
  {id:"terminal",ico:"⚡",l:"Terminal"},
  {id:"diario",ico:"📓",l:"Diário"},
  {id:"risco",ico:"🛡️",l:"Gestão Risco"},
  {id:"alertas",ico:"🔔",l:"Alertas"},
  {id:"tributario",ico:"📋",l:"Central Tribut."},
  {id:"relatorios",ico:"📊",l:"Relatórios"},
  {id:"config",ico:"⚙️",l:"Configurações"},
];

function Sidebar({active,setActive,alertCount,config}){
  return(
    <div style={{width:186,minWidth:186,background:G.bg1,borderRight:`1px solid ${G.b0}`,display:"flex",flexDirection:"column"}}>
      <div style={{padding:"13px 12px 11px",borderBottom:`1px solid ${G.b0}`}}>
        <div style={{fontSize:8,color:G.au,fontFamily:G.mono,letterSpacing:"2.5px",marginBottom:2}}>OPERADOR CONSCIENTE</div>
        <div style={{fontSize:14,color:"#fff",fontFamily:G.mono,fontWeight:"bold",letterSpacing:"1px"}}>WIN/WDO PRO</div>
        <div style={{fontSize:8,color:G.t2,marginTop:2,fontFamily:G.mono}}>{config.nome||"Trader"} · Day Trade</div>
      </div>
      <div style={{flex:1,padding:"5px 3px",overflowY:"auto"}}>
        {NAV.map(item=>(
          <button key={item.id} onClick={()=>setActive(item.id)}
            style={{width:"100%",display:"flex",alignItems:"center",gap:7,padding:"7px 8px",borderRadius:G.r,border:"none",
            background:active===item.id?G.auDim:"transparent",color:active===item.id?G.auXL:G.t1,
            cursor:"pointer",marginBottom:1,fontSize:11,fontFamily:G.sans,textAlign:"left",
            borderLeft:active===item.id?`2px solid ${G.au}`:"2px solid transparent",transition:"all 0.12s"}}>
            <span style={{fontSize:12,minWidth:15}}>{item.ico}</span>
            <span style={{fontWeight:active===item.id?"bold":"normal"}}>{item.l}</span>
            {item.id==="alertas"&&alertCount>0&&<span style={{marginLeft:"auto",background:G.dn,color:"#fff",borderRadius:10,fontSize:8,padding:"1px 5px",fontFamily:G.mono}}>{alertCount}</span>}
          </button>
        ))}
      </div>
      <div style={{padding:"9px 11px",borderTop:`1px solid ${G.b0}`,fontSize:8,color:G.t2,fontFamily:G.mono,lineHeight:1.6}}>
        v4.1 · {fmt.date()}<br/>operadorconsciente.com.br
      </div>
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────
export default function App(){
  const [active,setActive]=useState("dashboard");
  const [trades,setTradesRaw]=useState(()=>DB.get("trades_main",[]));
  const [diario,setDiarioRaw]=useState(()=>DB.get("diario_main",[]));
  const [config,setConfigRaw]=useState(()=>DB.get("config_main",{
    nome:"Trader",capital:15000,metaDiaria:250,stopDiario:150,
    riscoOp:1,riscoDia:2,fase:2,corretora:"Clear",conta:"Real"
  }));

  const setTrades=useCallback(v=>{setTradesRaw(v);DB.set("trades_main",v);},[]);
  const setDiario=useCallback(v=>{setDiarioRaw(v);DB.set("diario_main",v);},[]);
  const setConfig=useCallback(v=>{setConfigRaw(v);DB.set("config_main",v);},[]);

  const hoje=fmt.date();
  const lucroHoje=trades.filter(t=>t.data===hoje).reduce((a,t)=>a+t.lucro,0);
  const trib=useMemo(()=>calcTrib(trades),[trades]);
  const darf=trib.reduce((a,m)=>a+m.darf,0);
  const st=useMemo(()=>calcStats(trades),[trades]);

  const alertCount=useMemo(()=>{
    let n=0;
    if(lucroHoje<=-config.stopDiario)n++;
    if(darf>0)n++;
    let seq=0;for(const t of[...trades].slice(0,5).reverse()){if(t.lucro<0)seq++;else break;}
    if(seq>=3)n++;
    if(st.n>=20&&st.ev<0)n++;
    return n;
  },[trades,lucroHoje,config.stopDiario,darf,st]);

  const views={
    dashboard:<Dashboard trades={trades} config={config}/>,
    terminal:<Terminal trades={trades} setTrades={setTrades} config={config}/>,
    diario:<Diario diario={diario} setDiario={setDiario} trades={trades}/>,
    risco:<GestaoRisco config={config} setConfig={setConfig} trades={trades}/>,
    alertas:<Alertas trades={trades} config={config}/>,
    tributario:<CentralTributaria trades={trades}/>,
    relatorios:<Relatorios trades={trades} config={config}/>,
    config:<Config config={config} setConfig={setConfig}/>,
  };

  return(
    <div style={{display:"flex",height:"100vh",background:G.bg0,color:G.t0,fontFamily:G.sans,overflow:"hidden"}}>
      <Sidebar active={active} setActive={setActive} alertCount={alertCount} config={config}/>
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{background:G.bg1,borderBottom:`1px solid ${G.b0}`,padding:"0 18px",height:43,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <span style={{fontSize:9,color:G.t2,fontFamily:G.mono}}>
            {NAV.find(n=>n.id===active)?.ico} {NAV.find(n=>n.id===active)?.l}
          </span>
          <div style={{display:"flex",gap:12,alignItems:"center",fontSize:9,fontFamily:G.mono}}>
            <span style={{color:G.t2}}>{hoje}</span>
            <span style={{color:lucroHoje>=0?G.up:G.dn,fontWeight:"bold"}}>Hoje: {fmt.brl(lucroHoje)}</span>
            <span style={{color:G.t2}}>{trades.filter(t=>t.data===hoje).length} trades</span>
            {darf>0&&<span style={{color:G.dn}}>⚠ DARF: {fmt.brl(darf)}</span>}
            <span style={{color:G.au}}>{config.nome}</span>
          </div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:14}}>
          {views[active]}
        </div>
      </div>
    </div>
  );
}
