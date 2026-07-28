import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, Building2, CheckCircle2,
  ChevronDown, CircleDollarSign, Download, FileText, Gauge, Info, Landmark,
  Menu, RefreshCw, ShieldAlert, SlidersHorizontal, Target, TrendingUp, X
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

  useEffect(() => { fetch(`${import.meta.env.BASE_URL}data/revenues.json`).then(r => r.json()).then(d => {
    setData(d); setRates(structuredClone(d.defaults));
  }); }, []);

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
        <div className="origin-filter"><label>Origem</label><div className="segmented">{["Todas","União","Estado"].map(o=><button className={origin===o?"active":""} onClick={()=>setOrigin(o)} key={o}>{o}</button>)}</div></div>
      </section>

      {tab==="visao" && <Dashboard model={model} expected={expected} growth={growth} topRisk={topRisk} setTab={setTab}/>}
      {tab==="historico" && <Historical model={model} years={years}/>}
      {tab==="cenarios" && <Scenarios model={model} rates={rates} setRates={setRates} scenario={scenario} setScenario={setScenario}/>}
      {tab==="risco" && <Risk model={model}/>}
      {tab==="metodo" && <Method data={data}/>}
    </main>
  </div>;
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
      <Card title="Trajetória das transferências" subtitle="Realizado 2023–2025 e base anualizada 2026">
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
        <ol className="rules"><li><strong>Classificação por natureza da receita</strong><span>FPM, ITR, SUS, FNDE, ICMS, IPVA, IPI, CIDE, LC 176 e transferências conveniadas.</span></li><li><strong>Valores líquidos</strong><span>Deduções do Fundeb vinculadas a FPM, ITR, ICMS, IPVA e IPI são incorporadas.</span></li><li><strong>Anualização de 2026</strong><span>{data.assumptions.base2026}</span></li><li><strong>Cenários 2027</strong><span>Base anualizada multiplicada pelas taxas editáveis de cada cenário.</span></li></ol>
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
