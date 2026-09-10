"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BookOpen, Camera, CheckCircle2, Clock3, Upload, XCircle, Zap } from "lucide-react";
import { toast, Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

type Photo = { id:string; store:string; promoter:string; campaign:string; status:string; reason?:string; filename:string };
const goals = [
  ["Clight",1],["Tang",4],["Oreo Golden",2],["Trakinas",10],
  ["Chocolate",3],["Normandy",15],["Club Social",10],["Snack",3],
] as const;

export function CampaignControl() {
  const inputRef=useRef<HTMLInputElement>(null);
  const [photos,setPhotos]=useState<Photo[]>([]);
  const [loading,setLoading]=useState(true);
  const [sending,setSending]=useState(false);
  const [form,setForm]=useState({store:"Dourados",promoter:"",campaign:"Clight"});
  const load=async()=>{try{const r=await fetch("/api/photos?month=2026-09");const d=await r.json();setPhotos(d.photos||[])}catch{toast.error("Não foi possível carregar as fotos")}finally{setLoading(false)}};
  useEffect(()=>{void load()},[]);
  const approved=photos.filter(p=>p.status==="approved").length;
  const rejected=photos.filter(p=>p.status==="rejected").length;
  const pending=photos.length-approved-rejected;
  const required=goals.reduce((sum,item)=>sum+item[1],0);
  const rows=useMemo(()=>goals.map(([campaign,target])=>{const matches=photos.filter(p=>p.campaign===campaign);const done=matches.filter(p=>p.status==="approved").length;return{campaign,target,done,pending:matches.filter(p=>!["approved","rejected"].includes(p.status)).length,missing:Math.max(0,target-done)}}),[photos]);
  const submit=async(file:File)=>{if(!form.store||!form.promoter)return toast.error("Informe a loja e o promotor");setSending(true);const body=new FormData();body.set("photo",file);body.set("store",form.store);body.set("promoter",form.promoter);body.set("campaign",form.campaign);body.set("month","2026-09");try{const r=await fetch("/api/photos",{method:"POST",body});const d=await r.json();if(!r.ok)throw new Error(d.error);toast.success("Foto recebida e enviada para validação");await load()}catch(e){toast.error(e instanceof Error?e.message:"Falha no envio")}finally{setSending(false);if(inputRef.current)inputRef.current.value=""}};
  const review=async(id:string,status:"approved"|"rejected")=>{await fetch(`/api/photos/${id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({status,reason:status==="approved"?"Aprovada na revisão":"Execução fora da regra"})});await load()};
  return <main className="campaign-root">
    <Toaster theme="dark" position="top-right" richColors />
    <header className="campaign-topbar">
      <a href="/" className="campaign-back"><ArrowLeft size={17}/> Dashboard</a>
      <div className="brand-lockup"><div className="brand-mark"><Zap size={21} fill="currentColor"/></div><div><span>Triunfante • Operations</span><h1>Controle de campanhas</h1></div></div>
      <div className="campaign-live"><i/> Setembro 2026</div>
    </header>
    <section className="campaign-hero">
      <div><span className="eyebrow">Campanhas de setembro</span><h2>Fotos, pendências e books</h2><p>Acompanhe cada execução por loja. Só fotos aprovadas entram no book.</p></div>
      <Button className="upload-button" onClick={()=>window.print()}><BookOpen size={17}/> Gerar book</Button>
    </section>
    <section className="campaign-kpis">
      <article><Camera/><span>Recebidas</span><strong>{photos.length}</strong><small>de {required} necessárias</small></article>
      <article className="ok"><CheckCircle2/><span>Aprovadas</span><strong>{approved}</strong><small>prontas para o book</small></article>
      <article className="wait"><Clock3/><span>Em análise</span><strong>{pending}</strong><small>fila de validação</small></article>
      <article className="bad"><XCircle/><span>Reprovadas</span><strong>{rejected}</strong><small>precisam ser refeitas</small></article>
    </section>
    <section className="campaign-grid">
      <div className="campaign-panel">
        <div className="campaign-heading"><div><span className="eyebrow">Loja selecionada</span><h3>{form.store||"Informe a loja"}</h3></div><strong>{approved}/{required}</strong></div>
        <Progress value={required?approved/required*100:0}/>
        <div className="goal-list">{rows.map(row=><article key={row.campaign}><div><strong>{row.campaign}</strong><small>{row.pending?`${row.pending} em análise`:row.missing?`Faltam ${row.missing}`:"Meta concluída"}</small></div><span className={row.missing?"goal-count pending":"goal-count done"}>{row.done} / {row.target}</span></article>)}</div>
      </div>
      <div className="campaign-panel upload-panel">
        <div className="campaign-heading"><div><span className="eyebrow">Entrada manual</span><h3>Adicionar foto</h3></div><Upload size={20}/></div>
        <label>Loja<input value={form.store} onChange={e=>setForm({...form,store:e.target.value})}/></label>
        <label>Promotor<input placeholder="Nome do promotor" value={form.promoter} onChange={e=>setForm({...form,promoter:e.target.value})}/></label>
        <label>Campanha<select value={form.campaign} onChange={e=>setForm({...form,campaign:e.target.value})}>{goals.map(g=><option key={g[0]}>{g[0]}</option>)}</select></label>
        <input ref={inputRef} hidden type="file" accept="image/*" onChange={e=>e.target.files?.[0]&&void submit(e.target.files[0])}/>
        <Button disabled={sending} onClick={()=>inputRef.current?.click()}><Camera size={17}/>{sending?"Enviando":"Escolher foto"}</Button>
        <p className="integration-state"><i/> Webhook do WhatsApp preparado. Falta conectar a conta da Meta.</p>
      </div>
    </section>
    <section className="campaign-panel review-panel">
      <div className="campaign-heading"><div><span className="eyebrow">Validação</span><h3>Últimas fotos</h3></div><small>{loading?"Carregando":`${photos.length} registros`}</small></div>
      {photos.length===0?<div className="campaign-empty"><Camera size={30}/><strong>Nenhuma foto recebida</strong><span>Use o envio manual para testar o fluxo.</span></div>:<div className="review-list">{photos.slice(0,12).map(photo=><article key={photo.id}><div><strong>{photo.campaign}</strong><span>{photo.store} • {photo.promoter}</span><small>{photo.filename} • {photo.reason}</small></div><div className="review-actions"><span className={`review-status ${photo.status}`}>{photo.status}</span>{photo.status!=="approved"&&<button onClick={()=>void review(photo.id,"approved")}><CheckCircle2 size={15}/> Aprovar</button>}{photo.status!=="rejected"&&<button onClick={()=>void review(photo.id,"rejected")}><XCircle size={15}/> Reprovar</button>}</div></article>)}</div>}
    </section>
  </main>
}
