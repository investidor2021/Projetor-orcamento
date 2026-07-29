import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, Building2, CheckCircle2,
  ChevronDown, CircleDollarSign, Download, FileText, Gauge, Info, Landmark,
  Layers3, Menu, Plus, RefreshCw, Search, ShieldAlert, SlidersHorizontal, Target,
  TableProperties, Trash2, TrendingUp, X
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend,
  Line, ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import "./styles.css";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const pct = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}%`;
const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const colors = { pessimista: "#f17860", realista: "#d6a944", otimista: "#5ec9a6" };

function sum(rows) { return rows.reduce((a, r) => a + r.value, 0); }
function cv(values) {
  const valid = values.filter(v => Number.isFinite(v) && v !== 0);
  if (valid.length < 2) return 0;
  const avg = valid.reduce((a,b)=>a+b,0)/valid.length;
  return Math.sqrt(valid.reduce((a,b)=>a+(b-avg)**2,0)/(valid.length-1))/Math.abs(avg)*100;
}

function App() {
  const [data, setData] = useState(null);
  const [years, setYears] = useState([2023, 2024, 2025, 2026]);
  const [origin, setOrigin] = useState("Todas");
  const [tab, setTab] = useState("visao");
  const [scenario, setScenario] = useState("realista");
  const [rates, setRates] = useState(null);
  const [drawer, setDrawer] = useState(false);
  const [study, setStudy] = useState(() => JSON.parse(localStorage.getItem("revenue-study") || "[]"));

  useEffect(() => { fetch(`${import.meta.env.BASE_URL}data/revenues.json`).then(r => r.json()).then(d => {
    setData(d); setRates(structuredClone(d.defaults));
  }); }, []);
  useEffect(() => localStorage.setItem("revenue-study", JSON.stringify(study)), [study]);

  const model = useMemo(() => {
    if (!data || !rates) return null;
    const cats = data.categories.filter(c => origin === "Todas" || c.origin === origin);
    const annual = {};
    for (const y of [2022,2023,2024,2025]) {
      annual[y] = {};
      for (const c of cats) annual[y][c.id] = sum(data.records.filter(r => r.year===y && r.category===c.id));
    }
    const actual26 = {};
    const base26 = {};
    for (const c of cats) {
      actual26[c.id] = sum(data.records.filter(r => r.year===2026 && r.category===c.id));
      const histRatios = [2023,2024,2025].map(y => {
        const first = sum(data.records.filter(r => r.year===y && r.month<=6 && r.category===c.id));
        const total = sum(data.records.filter(r => r.year===y && r.category===c.id));
        return first > 0 ? total/first : null;
      }).filter(Boolean);
      const factor = histRatios.length ? histRatios.reduce((a,b)=>a+b,0)/histRatios.length : 2;
      base26[c.id] = actual26[c.id] * Math.min(3, Math.max(1, factor));
      annual[2026] ??= {}; annual[2026][c.id] = base26[c.id];
    }
    const projections = {};
    for (const s of ["pessimista","realista","otimista"]) {
      projections[s] = {};
      for (const c of cats) {
        const rate = rates[s][c.id] ?? rates[s].default;
        projections[s][c.id] = base26[c.id] * (1 + rate/100);
      }
    }
    const totals = Object.fromEntries(["pessimista","realista","otimista"].map(s => [s, Object.values(projections[s]).reduce((a,b)=>a+b,0)]));
    const total26 = Object.values(base26).reduce((a,b)=>a+b,0);
    const trend = [2022,2023,2024,2025,2026].map(y => ({
      year: String(y), total: Object.values(annual[y]||{}).reduce((a,b)=>a+b,0), missing: y===2022
    }));
    const monthly = months.map((m,i) => ({month:m, ...Object.fromEntries([2023,2024,2025,2026].map(y => [y, sum(data.records.filter(r=>r.year===y&&r.month===i+1&&cats.some(c=>c.id===r.category))) ]))}));
    const risks = cats.map(c => {
      const vals=[2023,2024,2025].map(y=>annual[y][c.id]);
      const volatility=cv(vals);
      const concentration = total26 ? base26[c.id]/total26*100 : 0;
      const score=Math.min(100, volatility*1.3+concentration*.55+(c.risk==="Alto"?25:c.risk==="Médio"?14:6));
      return {...c, volatility, concentration, score, base:base26[c.id]};
    }).sort((a,b)=>b.score-a.score);
    return {cats, annual, actual26, base26, projections, totals, total26, trend, monthly, risks};
  }, [data, rates, origin]);

  if (!model) return <div className="loading"><RefreshCw className="spin"/> Estruturando as receitas...</div>;
  const expected = model.totals.realista;
  const growth = model.total26 ? (expected/model.total26-1)*100 : 0;
  const topRisk = model.risks[0];
  const activeProj = model.projections[scenario];

  const nav = [
    ["visao","Visão executiva",Gauge], ["historico","Histórico",BarChart3],
    ["cenarios","Cenários 2027",SlidersHorizontal], ["risco","Risco & alertas",ShieldAlert],
    ["detalhes","Receitas detalhadas",Layers3], ["base","Base completa",TableProperties],
    ["estudos",`Meus estudos${study.length?` (${study.length})`:""}`,Search],
    ["metodo","Metodologia",FileText]
  ];

  return <div className="app">
    <aside className={drawer ? "sidebar open" : "sidebar"}>
      <button className="close-mobile" onClick={()=>setDrawer(false)}><X/></button>
      <div className="brand"><div className="brandmark"><Landmark/></div><div><strong>Observatório</strong><span>Receitas públicas</span></div></div>
      <div className="municipality"><span>Município analisado</span><strong>{data.municipality}</strong><small>SP · Projeção LOA 2027</small></div>
      <nav>{nav.map(([id,label,Icon])=><button key={id} className={tab===id?"active":""} onClick={()=>{setTab(id);setDrawer(false)}}><Icon size={18}/>{label}</button>)}</nav>
      <div className="sidebar-note"><CheckCircle2/><div><strong>Base processada</strong><span>3 CSVs + balancete 2026</span></div></div>
    </aside>
    <main>
      <header>
        <button className="menu" onClick={()=>setDrawer(true)}><Menu/></button>
        <div><p>PLANEJAMENTO ORÇAMENTÁRIO</p><h1>{nav.find(n=>n[0]===tab)[1]}</h1></div>
        <div className="header-actions"><span className="updated"><span/> Dados até jun/2026</span><button onClick={()=>window.print()}><Download size={17}/> Exportar</button></div>
      </header>

      <section className="filters">
        <div><label>Períodos comparados</label><div className="checks">{[2022,2023,2024,2025,2026].map(y=><label key={y} className={y===2022?"disabled":""}><input type="checkbox" disabled={y===2022} checked={years.includes(y)} onChange={()=>setYears(v=>v.includes(y)?v.filter(x=>x!==y):[...v,y])}/><span>{y}</span></label>)}</div></div>
        <div className="origin-filter"><label>Origem</label><div className="segmented">{["Todas","Município","União","Estado"].map(o=><button className={origin===o?"active":""} onClick={()=>setOrigin(o)} key={o}>{o}</button>)}</div></div>
      </section>

      {tab==="visao" && <Dashboard model={model} expected={expected} growth={growth} topRisk={topRisk} setTab={setTab}/>}
      {tab==="historico" && <Historical model={model} years={years}/>}
      {tab==="cenarios" && <Scenarios model={model} rates={rates} setRates={setRates} scenario={scenario} setScenario={setScenario}/>}
      {tab==="risco" && <Risk model={model}/>}
      {tab==="detalhes" && <Detailed data={data} study={study} setStudy={setStudy} setTab={setTab}/>}
      {tab==="base" && <FullDatabase data={data}/>}
      {tab==="estudos" && <Studies data={data} study={study} setStudy={setStudy} setTab={setTab}/>}
      {tab==="metodo" && <Method data={data}/>}
    </main>
  </div>;
}

function FullDatabase({data}) {
  const defaultColumns=["year","monthName","agency","resourceSource","category","account","value","sourceFile"];
  const [visible,setVisible]=useState(defaultColumns);
  const [query,setQuery]=useState("");
  const [year,setYear]=useState("Todos");
  const [filters,setFilters]=useState([]);
  const [headerFilters,setHeaderFilters]=useState({});
  const [filterColumn,setFilterColumn]=useState("agency");
  const [filterValue,setFilterValue]=useState("");
  const [sort,setSort]=useState({key:"year",direction:"desc"});
  const [page,setPage]=useState(1);
  const [summaryModal,setSummaryModal]=useState(null);
  const pageSize=50;
  const columns=Object.fromEntries(data.rawColumns.map(c=>[c.key,c]));
  const searchable=data.rawColumns.map(c=>c.key);
  const rows=useMemo(()=>{
    const q=query.trim().toLowerCase();
    const filtered=data.rawRecords.filter(row=>{
      if(year!=="Todos"&&row.year!==+year) return false;
      if(q&&!searchable.some(key=>String(row[key]??"").toLowerCase().includes(q))) return false;
      if(!filters.every(f=>String(row[f.key]??"").toLowerCase().includes(f.value.toLowerCase()))) return false;
      return Object.entries(headerFilters).every(([key,value])=>!value||String(row[key]??"").toLowerCase().includes(value.toLowerCase()));
    });
    return filtered.sort((a,b)=>{
      const av=a[sort.key]??"", bv=b[sort.key]??"";
      const result=typeof av==="number"&&typeof bv==="number"?av-bv:String(av).localeCompare(String(bv),"pt-BR");
      return sort.direction==="asc"?result:-result;
    });
  },[data,query,year,filters,headerFilters,sort]);
  useEffect(()=>setPage(1),[query,year,filters,headerFilters,visible]);
  const pages=Math.max(1,Math.ceil(rows.length/pageSize));
  const shown=rows.slice((page-1)*pageSize,page*pageSize);
  const financialRows=rows.filter(r=>r.isAnalytical);
  const gross=financialRows.filter(r=>Number(r.value)>0).reduce((a,r)=>a+Number(r.value),0);
  const deductions=Math.abs(financialRows.filter(r=>Number(r.value)<0).reduce((a,r)=>a+Number(r.value),0));
  const net=gross-deductions;
  const addFilter=()=>{if(!filterValue.trim())return;setFilters(f=>[...f,{key:filterColumn,value:filterValue.trim()}]);setFilterValue("")};
  const toggleColumn=key=>setVisible(v=>v.includes(key)?v.filter(x=>x!==key):[...v,key]);
  const changeSort=key=>setSort(s=>({key,direction:s.key===key&&s.direction==="asc"?"desc":"asc"}));
  const setHeaderFilter=(key,value)=>setHeaderFilters(old=>({...old,[key]:value}));
  const clearAllFilters=()=>{setQuery("");setYear("Todos");setFilters([]);setHeaderFilters({})};
  const exportRows=()=>{
    const escape=v=>`"${String(v??"").replaceAll('"','""')}"`;
    const header=visible.map(k=>escape(columns[k].label)).join(";");
    const body=rows.map(r=>visible.map(k=>escape(r[k])).join(";")).join("\r\n");
    const blob=new Blob(["\ufeff",header,"\r\n",body],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=`base-receitas-filtrada-${new Date().toISOString().slice(0,10)}.csv`;link.click();URL.revokeObjectURL(url);
  };
  return <div className="page">
    <div className="database-hero"><div><span>BASE ANALÍTICA INTEGRAL</span><h2>Planilha de receitas</h2><p>{data.rawRecords.length.toLocaleString("pt-BR")} registros importados dos arquivos originais, com códigos e dimensões preservados.</p></div><button onClick={exportRows}><Download/> Exportar filtrado</button></div>
    <div className="financial-summary">
      <button onClick={()=>setSummaryModal("gross")}><span>Arrecadação bruta <Info/></span><strong>{brl.format(gross)}</strong><small>X · soma dos lançamentos positivos</small></button>
      <div className="summary-operator">−</div>
      <button className="deduction" onClick={()=>setSummaryModal("deductions")}><span>Deduções <Info/></span><strong>{brl.format(deductions)}</strong><small>Y · Fundeb e demais valores negativos</small></button>
      <div className="summary-operator">=</div>
      <button className="net" onClick={()=>setSummaryModal("net")}><span>Arrecadação líquida <Info/></span><strong>{brl.format(net)}</strong><small>X − Y · valor após as deduções</small></button>
    </div>
    <Card title="Filtros da base" subtitle="Combine qualquer coluna do CSV; todos os filtros são cumulativos">
      <div className="database-toolbar">
        <label className="searchbox"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Pesquisar em todas as colunas..."/></label>
        <select value={year} onChange={e=>setYear(e.target.value)}><option>Todos</option>{[2023,2024,2025,2026].map(y=><option key={y}>{y}</option>)}</select>
        <select value={filterColumn} onChange={e=>setFilterColumn(e.target.value)}>{data.rawColumns.map(c=><option value={c.key} key={c.key}>{c.label}</option>)}</select>
        <input value={filterValue} onChange={e=>setFilterValue(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addFilter()} placeholder="Valor do filtro"/>
        <button onClick={addFilter}><Plus/> Adicionar</button>
        <details className="column-picker"><summary><TableProperties/> Colunas</summary><div>{data.rawColumns.map(c=><label key={c.key}><input type="checkbox" checked={visible.includes(c.key)} onChange={()=>toggleColumn(c.key)}/>{c.label}</label>)}</div></details>
      </div>
      <div className="quick-filters">
        <label><span>Mês</span><input value={headerFilters.monthName||""} onChange={e=>setHeaderFilter("monthName",e.target.value)} placeholder="Ex.: Janeiro"/></label>
        <label><span>Órgão</span><input value={headerFilters.agency||""} onChange={e=>setHeaderFilter("agency",e.target.value)} placeholder="Nome do órgão"/></label>
        <label><span>Fonte de recurso</span><input value={headerFilters.resourceSource||""} onChange={e=>setHeaderFilter("resourceSource",e.target.value)} placeholder="Tesouro, federal..."/></label>
        <label><span>Categoria</span><input value={headerFilters.category||""} onChange={e=>setHeaderFilter("category",e.target.value)} placeholder="Receitas correntes..."/></label>
        <label><span>Natureza da receita</span><input value={headerFilters.account||""} onChange={e=>setHeaderFilter("account",e.target.value)} placeholder="IPTU, ICMS, serviços..."/></label>
        <button onClick={clearAllFilters}><X/> Limpar tudo</button>
      </div>
      <div className="filter-chips">{filters.map((f,i)=><button key={`${f.key}-${i}`} onClick={()=>setFilters(old=>old.filter((_,idx)=>idx!==i))}><span>{columns[f.key].label}:</span> {f.value}<X/></button>)}{Object.entries(headerFilters).filter(([,v])=>v).map(([key,value])=><button key={`header-${key}`} onClick={()=>setHeaderFilter(key,"")}><span>{columns[key].label}:</span> {value}<X/></button>)}</div>
    </Card>
    <section className="sheet-card">
      <div className="sheet-meta"><span>Exibindo {(page-1)*pageSize+1}–{Math.min(page*pageSize,rows.length)} de {rows.length.toLocaleString("pt-BR")}</span><span>Clique no cabeçalho para ordenar</span></div>
      <div className="sheet-wrap"><table><thead><tr>{visible.map(key=><th key={key} onClick={()=>changeSort(key)} className={sort.key===key?"sorted":""}>{columns[key].label}<small>{sort.key===key?(sort.direction==="asc"?"↑":"↓"):""}</small></th>)}</tr><tr className="column-filter-row">{visible.map(key=><th key={`filter-${key}`}><div><Search/><input value={headerFilters[key]||""} onChange={e=>setHeaderFilter(key,e.target.value)} onClick={e=>e.stopPropagation()} placeholder="Filtrar..."/>{headerFilters[key]?<button onClick={e=>{e.stopPropagation();setHeaderFilter(key,"")}}><X/></button>:null}</div></th>)}</tr></thead><tbody>{shown.map((row,idx)=><tr key={`${row.sourceFile}-${(page-1)*pageSize+idx}`}>{visible.map(key=><td key={key} className={columns[key].type==="currency"?"numeric":""}>{columns[key].type==="currency"&&row[key]!=null?brl.format(row[key]):String(row[key]??"")}</td>)}</tr>)}</tbody></table></div>
      <div className="pagination"><button disabled={page===1} onClick={()=>setPage(p=>p-1)}>Anterior</button><span>Página <strong>{page}</strong> de {pages}</span><button disabled={page===pages} onClick={()=>setPage(p=>p+1)}>Próxima</button></div>
    </section>
    {summaryModal&&<FinancialModal type={summaryModal} gross={gross} deductions={deductions} net={net} rows={financialRows} onClose={()=>setSummaryModal(null)}/>}
  </div>
}

function FinancialModal({type,gross,deductions,net,rows,onClose}) {
  const config={
    gross:{title:"Arrecadação bruta (X)",value:gross,text:"Soma de todos os lançamentos analíticos positivos dentro dos filtros atuais."},
    deductions:{title:"Deduções (Y)",value:deductions,text:"Soma em valor absoluto dos lançamentos analíticos negativos, incluindo as deduções para formação do Fundeb."},
    net:{title:"Arrecadação líquida (X − Y)",value:net,text:"Resultado disponível após subtrair as deduções da arrecadação bruta."}
  }[type];
  const lines=(type==="gross"?rows.filter(r=>r.value>0):type==="deductions"?rows.filter(r=>r.value<0):[])
    .sort((a,b)=>Math.abs(b.value)-Math.abs(a.value)).slice(0,8);
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="financial-modal" onMouseDown={e=>e.stopPropagation()}><button className="modal-close" onClick={onClose}><X/></button><span>COMPOSIÇÃO DO VALOR</span><h3>{config.title}</h3><strong className="modal-value">{brl.format(config.value)}</strong><p>{config.text}</p><div className="formula-box"><div><small>Arrecadação bruta (X)</small><b>{brl.format(gross)}</b></div><em>−</em><div><small>Deduções (Y)</small><b>{brl.format(deductions)}</b></div><em>=</em><div><small>Arrecadação líquida</small><b>{brl.format(net)}</b></div></div>{lines.length>0&&<div className="modal-lines"><h4>Maiores componentes nos filtros atuais</h4>{lines.map((r,i)=><div key={`${r.sourceFile}-${i}`}><span><b>{r.account}</b><small>{r.year} · {r.agency||r.sourceFile}</small></span><strong>{brl.format(Math.abs(r.value))}</strong></div>)}</div>}<footer>Somente contas analíticas são somadas, evitando duplicidade dos níveis sintéticos do balancete de 2026.</footer></section></div>
}

function Detailed({data,study,setStudy,setTab}) {
  const [query,setQuery]=useState("");
  const [theme,setTheme]=useState("Todos");
  const [detailOrigin,setDetailOrigin]=useState("Todas");
  const [year,setYear]=useState("Todos");
  const themes=["Todos",...new Set(data.detailItems.map(i=>i.theme))];
  const origins=["Todas",...new Set(data.detailItems.map(i=>i.origin))];
  const totals=useMemo(()=>{
    const out={};
    for(const r of data.detailRecords) if(year==="Todos"||r.year===+year) out[r.item]=(out[r.item]||0)+r.value;
    return out;
  },[data,year]);
  const rows=data.detailItems.filter(i=>{
    const hay=`${i.code} ${i.name} ${i.theme} ${i.application} ${i.applicationDetail} ${i.agency}`.toLowerCase();
    return (theme==="Todos"||i.theme===theme)&&(detailOrigin==="Todas"||i.origin===detailOrigin)&&(!query||hay.includes(query.toLowerCase()));
  }).map(i=>({...i,total:totals[i.id]||0})).sort((a,b)=>Math.abs(b.total)-Math.abs(a.total));
  const toggle=id=>setStudy(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);
  const themeTotals=[...new Set(data.detailItems.map(i=>i.theme))].map(t=>({name:t,value:rows.filter(r=>r.theme===t).reduce((a,r)=>a+r.total,0),count:rows.filter(r=>r.theme===t).length})).sort((a,b)=>b.value-a.value);
  return <div className="page">
    <div className="detail-hero"><div><span>215 RUBRICAS MAPEADAS</span><h2>Explorador de receitas</h2><p>Do grupo contábil ao programa, aplicação e órgão arrecadador.</p></div><button onClick={()=>setTab("estudos")}><Search/> Abrir estudo <b>{study.length}</b></button></div>
    <div className="detail-summary">{themeTotals.slice(0,5).map(t=><div key={t.name}><span>{t.name}</span><strong>{compact.format(t.value)}</strong><small>{t.count} rubricas visíveis</small></div>)}</div>
    <Card title="Fragmentação completa" subtitle="Use os filtros, pesquise uma rubrica e adicione-a ao seu estudo">
      <div className="detail-filters">
        <label className="searchbox"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar IPTU, SUAS, convênio, fundo, aplicação..."/></label>
        <select value={theme} onChange={e=>setTheme(e.target.value)}>{themes.map(t=><option key={t}>{t}</option>)}</select>
        <select value={detailOrigin} onChange={e=>setDetailOrigin(e.target.value)}>{origins.map(o=><option key={o}>{o}</option>)}</select>
        <select value={year} onChange={e=>setYear(e.target.value)}><option>Todos</option>{[2023,2024,2025].map(y=><option key={y}>{y}</option>)}</select>
      </div>
      <div className="results-line"><strong>{rows.length}</strong> rubricas encontradas <span>·</span> {brl.format(rows.reduce((a,r)=>a+r.total,0))}</div>
      <div className="table-wrap detail-table"><table><thead><tr><th>Estudo</th><th>Código / receita</th><th>Segmento</th><th>Origem</th><th>Aplicação</th><th>Órgão</th><th>Valor</th></tr></thead>
      <tbody>{rows.map(r=><tr key={r.id} className={study.includes(r.id)?"selected-row":""}><td><button className={`study-add ${study.includes(r.id)?"added":""}`} onClick={()=>toggle(r.id)}>{study.includes(r.id)?<CheckCircle2/>:<Plus/>}</button></td><td><small className="account-code">{r.code}</small><strong>{r.name}</strong></td><td><span className="theme-pill">{r.theme}</span></td><td>{r.origin}</td><td className="wrap-cell">{r.applicationDetail&&!r.applicationDetail.startsWith("CÓDIGO")?r.applicationDetail:r.application}</td><td className="wrap-cell">{r.agency}</td><td><strong>{brl.format(r.total)}</strong></td></tr>)}</tbody></table></div>
    </Card>
  </div>
}

function Studies({data,study,setStudy,setTab}) {
  const [activeStudy,setActiveStudy]=useState(null);
  const items=study.map(id=>data.detailItems.find(i=>i.id===id)).filter(Boolean);
  const annual=[2023,2024,2025].map(year=>({year:String(year),...Object.fromEntries(items.map(i=>[i.id,sum(data.detailRecords.filter(r=>r.item===i.id&&r.year===year))]))}));
  const monthly=months.map((month,idx)=>({
    month,
    ...Object.fromEntries(items.map(i=>[
      i.id,
      sum(data.detailRecords.filter(r=>r.item===i.id&&r.month===idx+1))
    ]))
  }));
  const annualTotals=annual.map(row=>items.reduce((total,item)=>total+(row[item.id]||0),0));
  const continuousDown=annualTotals[1]<annualTotals[0]&&annualTotals[2]<annualTotals[1];
  const continuousUp=annualTotals[1]>annualTotals[0]&&annualTotals[2]>annualTotals[1];
  const studyChange=(current,previous)=>previous?pct((current/previous-1)*100):"sem base comparável";
  const trendTitle=continuousDown?"Queda contínua no conjunto":continuousUp?"Crescimento contínuo no conjunto":"Comportamento oscilante";
  const trendText=continuousDown
    ? `A seleção caiu ${studyChange(annualTotals[1],annualTotals[0])} em 2024 e ${studyChange(annualTotals[2],annualTotals[1])} em 2025.`
    : continuousUp
      ? `A seleção cresceu ${studyChange(annualTotals[1],annualTotals[0])} em 2024 e ${studyChange(annualTotals[2],annualTotals[1])} em 2025.`
      : `A trajetória mudou de direção: ${studyChange(annualTotals[1],annualTotals[0])} em 2024 e ${studyChange(annualTotals[2],annualTotals[1])} em 2025.`;
  const palette=["#167c69","#d6a944","#d86751","#527cba","#8659a8","#4ca8a0","#b46f31","#65736f"];
  if(!items.length) return <div className="page empty-study"><div><Search/><h2>Seu estudo está vazio</h2><p>Escolha quaisquer receitas no explorador para montar análises personalizadas.</p><button onClick={()=>setTab("detalhes")}>Explorar receitas <ArrowUpRight/></button></div></div>;
  return <div className="page">
    <div className="study-head"><div><span>ESTUDO PERSONALIZADO</span><h2>{items.length} receitas selecionadas</h2><p>A seleção fica salva neste navegador e pode ser alterada a qualquer momento.</p></div><div><button onClick={()=>setTab("detalhes")}><Plus/> Adicionar receitas</button><button className="clear" onClick={()=>setStudy([])}><Trash2/> Limpar</button></div></div>
    <div className="study-list">{items.map((i,idx)=><div key={i.id} role="button" tabIndex="0" title="Clique para destacar esta receita nos gráficos" className={activeStudy===i.id?"focused":activeStudy?"dimmed":""} onClick={()=>setActiveStudy(v=>v===i.id?null:i.id)} onKeyDown={e=>e.key==="Enter"&&setActiveStudy(v=>v===i.id?null:i.id)}><span style={{background:palette[idx%palette.length]}}/><div><strong>{i.name}</strong><small>{i.theme} · {i.origin}</small></div><button onClick={e=>{e.stopPropagation();setStudy(s=>s.filter(x=>x!==i.id));if(activeStudy===i.id)setActiveStudy(null)}}><X/></button></div>)}</div>
    <div className="study-focus-hint">{activeStudy?<><CheckCircle2/> Série destacada: <strong>{items.find(i=>i.id===activeStudy)?.name}</strong></>:<>Clique em um card acima para destacar a receita nos gráficos.</>}</div>
    <div className={`study-conclusion ${continuousDown?"down":continuousUp?"up":"mixed"}`}><TrendingUp/><div><strong>{trendTitle}</strong><span>{trendText}</span></div><div className="study-years">{annualTotals.map((v,i)=><span key={i}><small>{2023+i}</small>{compact.format(v)}</span>)}</div></div>
    <div className="grid two">
      <Card title="Comparação anual" subtitle="Evolução das receitas selecionadas">
        <ResponsiveContainer width="100%" height={320}><BarChart data={annual}><CartesianGrid stroke="#e8ece8" vertical={false}/><XAxis dataKey="year" axisLine={false} tickLine={false}/><YAxis tickFormatter={v=>compact.format(v)} axisLine={false} tickLine={false}/><Tooltip content={<StudyTooltip items={items} activeStudy={activeStudy}/>}/>{items.map((i,idx)=><Bar key={i.id} dataKey={i.id} fill={palette[idx%palette.length]} fillOpacity={!activeStudy||activeStudy===i.id?1:.12} radius={[3,3,0,0]}/>)}</BarChart></ResponsiveContainer>
      </Card>
      <Card title="Perfil mensal acumulado" subtitle="Soma de janeiro a dezembro em 2023–2025">
        <ResponsiveContainer width="100%" height={320}><AreaChart data={monthly}><CartesianGrid stroke="#e8ece8" vertical={false}/><XAxis dataKey="month" axisLine={false} tickLine={false}/><YAxis tickFormatter={v=>compact.format(v)} axisLine={false} tickLine={false}/><Tooltip content={<StudyTooltip items={items} activeStudy={activeStudy}/>}/>{items.map((i,idx)=><Area key={i.id} type="monotone" dataKey={i.id} stroke={palette[idx%palette.length]} fill={palette[idx%palette.length]} fillOpacity={(!activeStudy||activeStudy===i.id)?.08:.01} strokeOpacity={!activeStudy||activeStudy===i.id?1:.12} strokeWidth={activeStudy===i.id?4:2}/>)}</AreaChart></ResponsiveContainer>
      </Card>
    </div>
    <Card title="Quadro do estudo" subtitle="Valores anuais, média, crescimento e participação no conjunto">
      <div className="table-wrap"><table><thead><tr><th>Receita</th><th>Segmento</th><th>2023</th><th>2024</th><th>2025</th><th>Média</th><th>Cresc. 23–25</th><th>Participação</th></tr></thead><tbody>{items.map(i=>{const vals=[2023,2024,2025].map(y=>sum(data.detailRecords.filter(r=>r.item===i.id&&r.year===y)));const total=items.reduce((a,item)=>a+sum(data.detailRecords.filter(r=>r.item===item.id)),0);const own=vals.reduce((a,b)=>a+b,0);return <tr key={i.id}><td><strong>{i.name}</strong></td><td>{i.theme}</td>{vals.map((v,j)=><td key={j}>{brl.format(v)}</td>)}<td>{brl.format(own/3)}</td><td>{vals[0]?pct((vals[2]/vals[0]-1)*100):"N/D"}</td><td>{total?(own/total*100).toFixed(1).replace(".",","):"0"}%</td></tr>})}</tbody></table></div>
    </Card>
  </div>
}

function StudyTooltip({active,payload,label,items,activeStudy}) {
  if(!active||!payload?.length) return null;
  const visible=activeStudy?payload.filter(p=>p.dataKey===activeStudy):payload.slice(0,4);
  return <div className="study-tooltip"><strong>{label}</strong>{visible.map(p=><div key={p.dataKey}><span style={{background:p.color}}/><em>{items.find(i=>i.id===p.dataKey)?.name||"Receita"}</em><b>{brl.format(p.value)}</b></div>)}{!activeStudy&&payload.length>4?<small>+ {payload.length-4} receitas — clique em um card para isolar</small>:null}</div>
}

function Dashboard({model,expected,growth,topRisk,setTab}) {
  const gap=model.totals.otimista-model.totals.pessimista;
  const bars=model.cats.map(c=>({name:c.name, base:model.base26[c.id], projected:model.projections.realista[c.id]})).sort((a,b)=>b.projected-a.projected).slice(0,7);
  return <div className="page">
    <div className="status-banner"><div className="signal amber"/><div><span>CENÁRIO ATUAL</span><strong>Atenção: base 2026 parcialmente realizada</strong><p>A projeção anual usa a sazonalidade observada em 2023–2025. Revise as premissas antes da LOA.</p></div><button onClick={()=>setTab("metodo")}>Ver metodologia <ArrowUpRight size={15}/></button></div>
    <div className="kpis">
      <Kpi icon={CircleDollarSign} label="Base anualizada 2026" value={brl.format(model.total26)} note={`${brl.format(Object.values(model.actual26).reduce((a,b)=>a+b,0))} realizado até junho`}/>
      <Kpi icon={Target} label="Projeção realista 2027" value={brl.format(expected)} note={`${pct(growth)} sobre a base 2026`} positive/>
      <Kpi icon={SlidersHorizontal} label="Amplitude dos cenários" value={brl.format(gap)} note="otimista menos pessimista"/>
      <Kpi icon={ShieldAlert} label="Maior exposição" value={topRisk?.name||"—"} note={`${topRisk?.score.toFixed(0)} / 100 no índice de risco`} danger/>
    </div>
    <div className="grid two">
      <Card title="Trajetória das receitas mapeadas" subtitle="Receitas próprias e transferências · realizado 2023–2025 e base anualizada 2026">
        <ResponsiveContainer width="100%" height={285}><AreaChart data={model.trend.filter(d=>!d.missing)}>
          <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5ec9a6" stopOpacity=".38"/><stop offset="1" stopColor="#5ec9a6" stopOpacity=".02"/></linearGradient></defs>
          <CartesianGrid stroke="#e8ece8" vertical={false}/><XAxis dataKey="year" axisLine={false} tickLine={false}/><YAxis tickFormatter={v=>compact.format(v)} axisLine={false} tickLine={false}/>
          <Tooltip formatter={v=>brl.format(v)}/><Area type="monotone" dataKey="total" stroke="#167c69" strokeWidth={3} fill="url(#area)"/>
        </AreaChart></ResponsiveContainer>
      </Card>
      <Card title="2026 × cenário realista" subtitle="Sete maiores fontes de receita">
        <ResponsiveContainer width="100%" height={285}><BarChart data={bars} layout="vertical" margin={{left:25}}>
          <CartesianGrid stroke="#eef0ed" horizontal={false}/><XAxis type="number" tickFormatter={v=>compact.format(v)} axisLine={false} tickLine={false}/><YAxis dataKey="name" type="category" width={95} axisLine={false} tickLine={false}/>
          <Tooltip formatter={v=>brl.format(v)}/><Bar dataKey="base" name="Base 2026" fill="#c9d2cc" radius={[0,4,4,0]}/><Bar dataKey="projected" name="Realista 2027" fill="#167c69" radius={[0,4,4,0]}/>
        </BarChart></ResponsiveContainer>
      </Card>
    </div>
    <div className="grid insight-grid">
      <Insight icon={AlertTriangle} tone="red" title={`Choque de -5% no ${topRisk.name}`} value={brl.format(topRisk.base*.05)} text="de perda potencial sobre a base anualizada."/>
      <Insight icon={TrendingUp} tone="green" title="Potencial otimista" value={brl.format(model.totals.otimista-model.totals.realista)} text="acima do cenário realista."/>
      <Insight icon={Building2} tone="gold" title="Concentração da maior receita" value={`${topRisk.concentration.toFixed(1).replace(".",",")}%`} text="da base selecionada; monitore mensalmente."/>
    </div>
  </div>
}

function Historical({model,years}) {
  const rows=model.cats.map(c=>{
    const vals=[2023,2024,2025].map(y=>model.annual[y][c.id]||0);
    return {...c, vals, avg:sum(vals.map(value=>({value})))/3, volatility:cv(vals)};
  });
  const chart=model.monthly.map(r=>Object.fromEntries(Object.entries(r).filter(([k])=>k==="month"||years.includes(+k))));
  return <div className="page">
    <div className="grid two">
      <Card title="Sazonalidade mensal" subtitle="Valores realizados; 2026 disponível até junho">
        <ResponsiveContainer width="100%" height={330}><AreaChart data={chart}>
          <CartesianGrid stroke="#e8ece8" vertical={false}/><XAxis dataKey="month" axisLine={false} tickLine={false}/><YAxis tickFormatter={v=>compact.format(v)} axisLine={false} tickLine={false}/>
          <Tooltip formatter={v=>brl.format(v)}/><Legend/>
          {[2023,2024,2025,2026].filter(y=>years.includes(y)).map((y,i)=><Area key={y} type="monotone" dataKey={String(y)} fillOpacity={i===3?.15:.03} fill={["#8ba39a","#d6a944","#167c69","#e06e56"][i]} stroke={["#8ba39a","#d6a944","#167c69","#e06e56"][i]} strokeWidth={i===3?3:2}/>)}
        </AreaChart></ResponsiveContainer>
      </Card>
      <Card title="Leitura da base" subtitle="Qualidade e cobertura dos dados">
        <div className="quality"><div className="quality-score">82<span>/100</span></div><div><strong>Boa cobertura histórica</strong><p>36 meses completos e seis meses de 2026. O ano de 2022 não foi fornecido.</p></div></div>
        <div className="quality-list"><span><CheckCircle2/> 2023–2025: detalhamento mensal</span><span><CheckCircle2/> Deduções do Fundeb consideradas</span><span className="warn"><AlertTriangle/> 2026: PDF acumulado, sem abertura mensal</span><span className="warn"><Info/> 2022: aguardando fonte</span></div>
      </Card>
    </div>
    <Card title="Base histórica por receita" subtitle="Média e volatilidade calculadas sobre 2023–2025">
      <div className="table-wrap"><table><thead><tr><th>Receita</th><th>Origem</th><th>2022</th><th>2023</th><th>2024</th><th>2025</th><th>Base 2026</th><th>Média 3 anos</th><th>Oscilação</th></tr></thead>
      <tbody>{rows.map(r=><tr key={r.id}><td><strong>{r.name}</strong></td><td><span className={`pill ${r.origin==="União"?"federal":"state"}`}>{r.origin}</span></td><td className="muted">N/D</td>{r.vals.map((v,i)=><td key={i}>{brl.format(v)}</td>)}<td>{brl.format(model.base26[r.id])}</td><td>{brl.format(r.avg)}</td><td><span className={`risk-dot ${r.volatility>20?"high":r.volatility>8?"medium":"low"}`}/>{r.volatility.toFixed(1).replace(".",",")}%</td></tr>)}</tbody></table></div>
    </Card>
  </div>
}

function Scenarios({model,rates,setRates,scenario,setScenario}) {
  const sensitivity=[...model.cats].sort((a,b)=>model.base26[b.id]-model.base26[a.id]).slice(0,6);
  const update=(s,id,v)=>setRates(old=>({...old,[s]:{...old[s],[id]:+v}}));
  return <div className="page">
    <div className="scenario-head"><div><span>MODELO EDITÁVEL</span><h2>Simulador de cenários 2027</h2><p>Ajuste cada premissa e veja o impacto imediatamente.</p></div><div className="scenario-switch">{["pessimista","realista","otimista"].map(s=><button key={s} className={scenario===s?"active "+s:""} onClick={()=>setScenario(s)}><span/>{s}</button>)}</div></div>
    <div className="kpis three">
      {["pessimista","realista","otimista"].map(s=><Kpi key={s} label={`Cenário ${s}`} value={brl.format(model.totals[s])} note={`${pct((model.totals[s]/model.total26-1)*100)} sobre 2026`} tone={s}/>)}
    </div>
    <Card title={`Premissas do cenário ${scenario}`} subtitle="Percentuais editáveis por fonte">
      <div className="assumption-grid">{model.cats.map(c=><label className="rate" key={c.id}><span><strong>{c.name}</strong><small>{c.origin}</small></span><div><input type="range" min="-15" max="20" step=".5" value={rates[scenario][c.id]??rates[scenario].default} onChange={e=>update(scenario,c.id,e.target.value)}/><output className={(rates[scenario][c.id]??rates[scenario].default)<0?"negative":""}>{pct(rates[scenario][c.id]??rates[scenario].default)}</output></div></label>)}</div>
    </Card>
    <div className="grid two">
      <Card title="Comparativo por receita" subtitle="Base anualizada 2026 e projeções">
        <div className="table-wrap compact-table"><table><thead><tr><th>Receita</th><th>2026</th><th>Pess.</th><th>Real.</th><th>Otim.</th></tr></thead><tbody>{model.cats.map(c=><tr key={c.id}><td><strong>{c.name}</strong></td><td>{compact.format(model.base26[c.id])}</td><td>{compact.format(model.projections.pessimista[c.id])}</td><td>{compact.format(model.projections.realista[c.id])}</td><td>{compact.format(model.projections.otimista[c.id])}</td></tr>)}<tr className="total"><td>Total</td><td>{compact.format(model.total26)}</td>{["pessimista","realista","otimista"].map(s=><td key={s}>{compact.format(model.totals[s])}</td>)}</tr></tbody></table></div>
      </Card>
      <Card title="Sensibilidade: choque de 5%" subtitle="Impacto isolado nas maiores receitas">
        <div className="sensitivity-note"><Info/><p><strong>Justificativa do teste.</strong> O choque de 5% é padronizado, fácil de comunicar e permite comparar exposições. Todas as demais receitas são mantidas constantes; reduz-se apenas a fonte analisada. O cálculo é <b>base anualizada de 2026 × 5%</b>, portanto receitas maiores provocam perdas absolutas maiores mesmo quando apresentam baixa volatilidade.</p></div>
        <div className="sensitivity">{sensitivity.map(c=><div key={c.id}><div><strong>{c.name}</strong><span>{c.origin}</span></div><div className="impact"><ArrowDownRight/> {brl.format(model.base26[c.id]*.05)}</div><div className="bar"><span style={{width:`${Math.min(100,model.base26[c.id]/model.base26[sensitivity[0].id]*100)}%`}}/></div></div>)}</div>
      </Card>
    </div>
  </div>
}

function Risk({model}) {
  return <div className="page">
    <div className="risk-hero"><div><span>ÍNDICE COMPOSTO</span><h2>Mapa de exposição da arrecadação</h2><p>Combina volatilidade histórica, concentração e previsibilidade institucional.</p></div><Gauge size={60}/></div>
    <div className="risk-cards">{model.risks.slice(0,4).map((r,i)=><div className="risk-card" key={r.id}><div className="rank">0{i+1}</div><span className={`risk-label ${r.score>=60?"high":r.score>=35?"medium":"low"}`}>{r.score>=60?"Alto":r.score>=35?"Médio":"Baixo"}</span><h3>{r.name}</h3><strong>{r.score.toFixed(0)}<small>/100</small></strong><div className="meter"><span style={{width:`${r.score}%`}}/></div><p>{r.concentration.toFixed(1).replace(".",",")}% da base · oscilação {r.volatility.toFixed(1).replace(".",",")}%</p></div>)}</div>
    <Card title="Matriz de acompanhamento" subtitle="Priorização para o monitoramento mensal">
      <div className="table-wrap"><table><thead><tr><th>Receita</th><th>Dependência</th><th>Base 2026</th><th>Concentração</th><th>Volatilidade</th><th>Risco</th><th>Indicador-chave</th></tr></thead><tbody>{model.risks.map(r=><tr key={r.id}><td><strong>{r.name}</strong></td><td>{r.origin}</td><td>{brl.format(r.base)}</td><td>{r.concentration.toFixed(1).replace(".",",")}%</td><td>{r.volatility.toFixed(1).replace(".",",")}%</td><td><span className={`risk-badge ${r.score>=60?"high":r.score>=35?"medium":"low"}`}>{r.score.toFixed(0)}</span></td><td className="macro">{r.macro}</td></tr>)}</tbody></table></div>
    </Card>
    <div className="alerts"><Insight icon={AlertTriangle} tone="red" title="Gatilho vermelho" value="−5% vs. curva" text="Bloqueio preventivo de despesas discricionárias."/><Insight icon={Info} tone="gold" title="Gatilho amarelo" value="−2% vs. curva" text="Revisão de empenhos e das premissas mensais."/><Insight icon={CheckCircle2} tone="green" title="Faixa segura" value="≥ 98% da curva" text="Execução compatível com o cenário selecionado."/></div>
  </div>
}

function Method({data}) {
  return <div className="page method">
    <div className="method-intro"><span>RASTREABILIDADE</span><h2>Como os números foram construídos</h2><p>O painel não preenche lacunas silenciosamente. Cada limitação da fonte fica visível para apoiar uma decisão responsável.</p></div>
    <div className="timeline">{data.sources.map((s,i)=><div key={s.year}><div className="timeline-year">{s.year}</div><div className="timeline-card"><FileText/><div><strong>{s.file}</strong><span>Cobertura: {s.coverage}</span><p>{s.method}.</p></div></div></div>)}</div>
    <div className="grid two">
      <Card title="Regras do modelo" subtitle="Premissas auditáveis">
        <ol className="rules"><li><strong>Classificação por natureza da receita</strong><span>IPTU, ITBI, IRRF, ISSQN, FPM, ITR, SUS, FNDE, ICMS, IPVA, IPI, CIDE, LC 176 e transferências conveniadas.</span></li><li><strong>Valores líquidos</strong><span>Deduções do Fundeb vinculadas a FPM, ITR, ICMS, IPVA e IPI são incorporadas.</span></li><li><strong>Anualização de 2026</strong><span>{data.assumptions.base2026}</span></li><li><strong>Cenários 2027</strong><span>Base anualizada multiplicada pelas taxas editáveis de cada cenário.</span></li></ol>
      </Card>
      <Card title="Pendências para elevar a confiança" subtitle="Próximos dados recomendados">
        <div className="pending"><div><AlertTriangle/><span><strong>Histórico de 2022</strong><small>Necessário para completar os cinco anos solicitados.</small></span></div><div><AlertTriangle/><span><strong>Execução mensal de 2026</strong><small>Substitui o rateio visual do PDF e melhora a curva de alertas.</small></span></div><div><Info/><span><strong>Previsão LOA por receita</strong><small>Permite calcular probabilidade de cumprimento e desvio realizado × previsto.</small></span></div><div><Info/><span><strong>Indicadores da LRF</strong><small>RCL, pessoal, resultado primário e caixa para medir impacto fiscal.</small></span></div></div>
      </Card>
    </div>
  </div>
}

function Card({title,subtitle,children}) { return <section className="card"><div className="card-title"><div><h3>{title}</h3><p>{subtitle}</p></div><button className="icon-btn"><ChevronDown/></button></div>{children}</section> }
function Kpi({icon:Icon,label,value,note,positive,danger,tone}) { return <div className={`kpi ${tone||""}`}><div className="kpi-top">{Icon&&<Icon/>}<span>{label}</span></div><strong>{value}</strong><p className={positive?"positive":danger?"danger":""}>{positive?<ArrowUpRight/>:danger?<ShieldAlert/>:null}{note}</p></div> }
function Insight({icon:Icon,tone,title,value,text}) { return <div className={`insight ${tone}`}><div className="insight-icon"><Icon/></div><div><span>{title}</span><strong>{value}</strong><p>{text}</p></div></div> }

createRoot(document.getElementById("root")).render(<App />);
