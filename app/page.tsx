"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BookOpenText, BrainCircuit, Check, ChevronRight, Clock3, Feather, GitBranch,
  LayoutDashboard, ListTree, Network, Plus, RotateCcw, Save, ScrollText, Sparkles,
  Users, WandSparkles,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger,
} from "@/components/ui/sidebar";

type Section = "dashboard" | "synopsis" | "characters" | "outline" | "relations" | "timeline" | "chapters";
type Character = { id: number; name: string; role: string; age: string; build: string; personality: string[]; speech: string; accent: string; goal: string; secret: string };

const navigation: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "创作总览", icon: LayoutDashboard },
  { id: "synopsis", label: "故事梗概", icon: ScrollText },
  { id: "characters", label: "人物角色", icon: Users },
  { id: "outline", label: "大纲与章节", icon: ListTree },
  { id: "relations", label: "人物关系图谱", icon: Network },
  { id: "timeline", label: "故事时间线", icon: Clock3 },
  { id: "chapters", label: "章节创作", icon: BookOpenText },
];

const initialCharacters: Character[] = [
  { id: 1, name: "林栀", role: "主角", age: "青年（25–35）", build: "清瘦", personality: ["敏锐", "克制", "执拗"], speech: "短句、直接、很少解释", accent: "普通话 · 无明显口音", goal: "查明父亲十二年前失踪的真相", secret: "她保留着父亲最后一封未寄出的信" },
  { id: 2, name: "周屿", role: "关键角色", age: "青年（25–35）", build: "高挑", personality: ["沉稳", "疏离", "守诺"], speech: "语速偏慢，习惯用反问", accent: "普通话 · 轻微江南口音", goal: "阻止旧案再次伤害林栀", secret: "十二年前曾在码头见过林父" },
  { id: 3, name: "陈渡", role: "对立角色", age: "中年（36–50）", build: "健壮", personality: ["圆滑", "控制欲", "谨慎"], speech: "礼貌正式，回避肯定回答", accent: "普通话 · 轻微北方口音", goal: "维持白榆港的表面秩序", secret: "掌握旧邮局地下档案室的钥匙" },
];

const initialSynopsis = {
  logline: "一名修复师收到失踪父亲在十二年前写给她的信，被迫回到雾港追查一桩被所有人默契遗忘的旧案。",
  summary: "林栀离开白榆港十二年后，在父亲失踪纪念日收到一封没有邮戳的信。信中提到一座已经封闭的旧邮局和一份被篡改的潮汐记录。她回到故乡，与儿时好友周屿重逢，却发现每个知情者都在用不同的谎言保护同一个秘密。随着旧信一封封出现，林栀逐渐意识到，父亲并非受害者，而是当年事件的发起人之一。",
  theme: "记忆是否会因善意的隐瞒而失去真实性",
  conflict: "林栀必须在揭开真相与保护仍活着的人之间作出选择",
  ending: "林栀公开被掩盖的事故，但隐去父亲最后一次选择的私人原因",
  locked: "父亲已经死亡；周屿不是幕后主使；超自然现象最终必须有现实解释",
};

const initialChapter = "雾从凌晨开始漫上旧港。林栀站在邮局褪色的雨篷下，看见那封信安静地躺在门缝里——信封上只有她的名字，墨迹却像是十二年前留下的。\n\n她没有立刻拆开。纸张边缘被潮气浸软，封口处却干燥得反常。身后传来自行车链条空转的声音，她回头时，只看见一盏路灯在雾里熄灭。";

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={wide ? "space-y-2 md:col-span-2" : "space-y-2"}><span className="text-xs font-medium text-muted-foreground">{label}</span>{children}</label>;
}

function SectionHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">{eyebrow}</p><h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p></div>{action}</div>;
}

export default function Home() {
  const [section, setSection] = useState<Section>("dashboard");
  const [points, setPoints] = useState(8420);
  const [synopsis, setSynopsis] = useState(initialSynopsis);
  const [characters, setCharacters] = useState(initialCharacters);
  const [selectedCharacter, setSelectedCharacter] = useState(1);
  const [chapter, setChapter] = useState(initialChapter);
  const [autoRelation, setAutoRelation] = useState(true);
  const [autoTimeline, setAutoTimeline] = useState(true);
  const [savedAt, setSavedAt] = useState("今天 14:32");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem("shengpian-demo");
    if (raw) {
      try {
        const data = JSON.parse(raw);
        if (data.points) setPoints(data.points);
        if (data.synopsis) setSynopsis(data.synopsis);
        if (data.characters) setCharacters(data.characters);
        if (data.chapter) setChapter(data.chapter);
      } catch { /* 保留样例数据 */ }
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) localStorage.setItem("shengpian-demo", JSON.stringify({ points, synopsis, characters, chapter }));
  }, [mounted, points, synopsis, characters, chapter]);

  const character = characters.find((item) => item.id === selectedCharacter) ?? characters[0];
  const charge = (cost: number, name: string, run: () => void) => {
    if (points < cost) return toast.error("点数不足，请先购买点数");
    setPoints((value) => value - cost);
    run();
    toast.success(`${name}已完成`, { description: `本次消耗 ${cost} 点，结果已作为草稿保存。` });
  };
  const save = () => { setSavedAt("刚刚"); toast.success("已保存到当前浏览器"); };

  return (
    <SidebarProvider>
      <Toaster position="top-center" richColors />
      <Sidebar collapsible="icon" className="border-r-0">
        <SidebarHeader className="p-4"><button onClick={() => setSection("dashboard")} className="flex w-full items-center gap-3 overflow-hidden rounded-xl bg-primary px-3 py-3 text-left text-primary-foreground"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/15"><Feather className="size-4" /></span><span className="min-w-0 group-data-[collapsible=icon]:hidden"><span className="block truncate text-sm font-semibold">声篇工坊</span><span className="block truncate text-[11px] text-white/65">云端小说创作</span></span></button></SidebarHeader>
        <SidebarContent><SidebarGroup><SidebarGroupLabel>创作工作台</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>{navigation.map((item) => <SidebarMenuItem key={item.id}><SidebarMenuButton isActive={section === item.id} tooltip={item.label} onClick={() => setSection(item.id)}><item.icon /><span>{item.label}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent></SidebarGroup></SidebarContent>
        <SidebarFooter className="p-4"><div className="rounded-xl border bg-background p-3 group-data-[collapsible=icon]:hidden"><div className="mb-2 flex items-center justify-between text-xs"><span className="text-muted-foreground">项目进度</span><span className="font-medium">18%</span></div><Progress value={18} /></div></SidebarFooter><SidebarRail />
      </Sidebar>
      <SidebarInset className="min-w-0 bg-background">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/90 px-4 backdrop-blur-xl md:px-7"><div className="flex min-w-0 items-center gap-3"><SidebarTrigger /><div className="h-5 w-px bg-border" /><div className="min-w-0"><p className="truncate text-sm font-semibold">雾港来信</p><p className="truncate text-xs text-muted-foreground">长篇悬疑 · 草稿 · {savedAt}保存</p></div></div><div className="flex items-center gap-2"><Badge variant="secondary" className="h-8 gap-1.5 px-3 font-normal"><Sparkles className="size-3.5 text-primary" /><span className="hidden sm:inline">AI 点数</span><strong>{points.toLocaleString()}</strong></Badge><Button size="sm" variant="outline" onClick={save} className="hidden gap-2 sm:flex"><Save className="size-3.5" />保存</Button><Button size="sm" onClick={() => setSection("chapters")}>继续创作</Button></div></header>
        <main className="mx-auto w-full max-w-[1480px] space-y-7 px-4 py-7 md:px-8 md:py-9">
          {section === "dashboard" && <Dashboard go={setSection} savedAt={savedAt} />}
          {section === "synopsis" && <Synopsis synopsis={synopsis} setSynopsis={setSynopsis} onAi={() => charge(120, "AI 梗概深化", () => setSynopsis((s) => ({ ...s, conflict: "林栀越接近真相，越必须亲手拆毁父亲用牺牲换来的平静；而周屿必须在守住承诺与保护她之间选择背叛谁。" })))} />}
          {section === "characters" && <Characters characters={characters} character={character} select={setSelectedCharacter} update={(patch) => setCharacters((all) => all.map((item) => item.id === character.id ? { ...item, ...patch } : item))} add={() => { const id = Date.now(); setCharacters((all) => [...all, { id, name: `新角色 ${all.length + 1}`, role: "次要角色", age: "青年（25–35）", build: "匀称", personality: ["待完善"], speech: "自然", accent: "普通话 · 无明显口音", goal: "待补充", secret: "待补充" }]); setSelectedCharacter(id); }} onAi={() => charge(160, "AI 角色深化", () => setCharacters((all) => all.map((item) => item.id === character.id ? { ...item, personality: Array.from(new Set([...item.personality, "矛盾感"])), secret: item.secret + "；害怕真相会证明自己的沉默也是共谋" } : item)))} />}
          {section === "outline" && <Outline onAi={() => charge(180, "AI 大纲生成", () => undefined)} goChapter={() => setSection("chapters")} />}
          {section === "relations" && <Relations onAi={() => charge(90, "AI 人物关系更新", () => undefined)} />}
          {section === "timeline" && <Timeline onAi={() => charge(70, "AI 故事时间线更新", () => undefined)} />}
          {section === "chapters" && <Chapters chapter={chapter} setChapter={setChapter} autoRelation={autoRelation} setAutoRelation={setAutoRelation} autoTimeline={autoTimeline} setAutoTimeline={setAutoTimeline} onAi={() => { const cost = 220 + (autoRelation ? 90 : 0) + (autoTimeline ? 70 : 0); charge(cost, "章节续写", () => setChapter((text) => text + "\n\n脚步声从邮局深处传来，一慢一快，最后停在锁住的分拣室门后。林栀终于拆开信封。里面没有信，只有半张潮汐表，背面写着一句话：不要相信退潮之后留下的东西。")); }} />}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function Dashboard({ go, savedAt }: { go: (s: Section) => void; savedAt: string }) {
  const stages = [
    ["故事梗概", "世界观、主题与核心冲突已确认", "已完成", ScrollText, "synopsis"], ["人物角色", "3 位主要角色，结构化档案", "已完成", Users, "characters"], ["小说大纲", "四幕结构，共 28 章", "已完成", ListTree, "outline"], ["关系图谱", "5 条人物关系，待同步第 3 章", "可更新", Network, "relations"], ["故事时间线", "6 个关键事件，跨度 12 年", "可更新", Clock3, "timeline"], ["章节创作", "已完成 2 / 28 章", "进行中", Feather, "chapters"],
  ] as const;
  return <>
    <section className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div><Badge variant="outline" className="mb-3 border-primary/20 bg-primary/5 text-primary">长篇创作流程</Badge><h1 className="text-3xl font-semibold tracking-tight md:text-4xl">让故事记住它发生过的一切</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">从梗概、人物、大纲到章节正文，创作记忆持续沉淀；人物关系和故事时间线可随章节同步更新。</p></div><div className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-sm"><div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><BrainCircuit className="size-5" /></div><div><p className="text-xs text-muted-foreground">上次自动保存</p><p className="text-sm font-medium">{savedAt} · 浏览器草稿已同步</p></div></div></section>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{stages.map(([title, detail, status, Icon, id], index) => <button key={title} onClick={() => go(id)} className="group flex min-h-36 items-start gap-4 rounded-2xl border bg-card p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground transition group-hover:bg-primary group-hover:text-primary-foreground"><Icon className="size-5" /></span><span className="min-w-0 flex-1"><span className="mb-2 flex items-center justify-between gap-2"><strong className="text-sm">{index + 1}. {title}</strong><Badge variant={status === "已完成" ? "secondary" : "outline"} className="font-normal">{status}</Badge></span><span className="block text-xs leading-5 text-muted-foreground">{detail}</span><span className="mt-3 flex items-center text-xs font-medium text-primary opacity-0 transition group-hover:opacity-100">打开模块 <ChevronRight className="ml-1 size-3" /></span></span></button>)}</section>
    <section className="grid gap-4 xl:grid-cols-[1.45fr_.55fr]"><div className="rounded-2xl border bg-card p-6 shadow-sm"><div className="mb-6 flex items-start justify-between gap-4"><div><p className="text-xs font-medium uppercase tracking-[.15em] text-primary">正在创作</p><h2 className="mt-1 text-xl font-semibold">第 03 章 · 没有寄件人的信</h2><p className="mt-1 text-sm text-muted-foreground">目标 4,000 字 · 当前 1,286 字</p></div><Button variant="outline" size="sm" onClick={() => go("chapters")}><Sparkles className="mr-2 size-4" />AI 续写</Button></div><div className="rounded-2xl border border-dashed bg-muted/35 p-6"><p className="font-serif text-lg leading-8 text-foreground/80">雾从凌晨开始漫上旧港。林栀站在邮局褪色的雨篷下，看见那封信安静地躺在门缝里——信封上只有她的名字，墨迹却像是十二年前留下的。</p><div className="mt-6 flex flex-wrap gap-2"><Badge variant="outline">视角：林栀</Badge><Badge variant="outline">地点：白榆港旧邮局</Badge><Badge variant="outline">时间：2019-11-03 清晨</Badge></div></div></div><MemoryCard /></section>
  </>;
}

function MemoryCard() { return <div className="rounded-2xl border bg-[#1c1c28] p-6 text-white shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs text-white/55">本章创作记忆</p><h2 className="mt-1 text-lg font-semibold">AI 上下文包</h2></div><GitBranch className="size-5 text-[#aea6ff]" /></div><div className="mt-6 space-y-4">{[["人物状态", "林栀仍未认出周屿；右手旧伤在雨天复发"], ["前情约束", "父亲失踪案尚未公开；信件不能出现邮戳"], ["伏笔提醒", "铜钥匙、潮汐表、被撕掉的第 17 页"]].map(([title, text]) => <div key={title} className="rounded-xl bg-white/[.07] p-4"><p className="text-xs font-medium text-[#c8c2ff]">{title}</p><p className="mt-1.5 text-sm leading-6 text-white/72">{text}</p></div>)}</div><Button className="mt-5 w-full bg-white text-[#1c1c28] hover:bg-white/90">查看完整记忆包</Button></div>; }

function Synopsis({ synopsis, setSynopsis, onAi }: { synopsis: typeof initialSynopsis; setSynopsis: React.Dispatch<React.SetStateAction<typeof initialSynopsis>>; onAi: () => void }) {
  const input = "w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-3 focus:ring-primary/10";
  return <><SectionHeader eyebrow="故事圣经 · 01" title="故事梗概" description="先固定故事的核心承诺，再让 AI 帮你扩展。带锁内容不会进入自动改写范围。" action={<Button onClick={onAi}><WandSparkles className="mr-2 size-4" />AI 深化 · 120 点</Button>} /><div className="grid gap-4 xl:grid-cols-[1fr_340px]"><div className="rounded-2xl border bg-card p-5 md:p-7"><div className="grid gap-5 md:grid-cols-2"><Field label="一句话故事" wide><textarea className={`${input} min-h-20 resize-y`} value={synopsis.logline} onChange={(e) => setSynopsis((s) => ({ ...s, logline: e.target.value }))} /></Field><Field label="完整故事梗概" wide><textarea className={`${input} min-h-40 resize-y`} value={synopsis.summary} onChange={(e) => setSynopsis((s) => ({ ...s, summary: e.target.value }))} /></Field><Field label="主题"><input className={input} value={synopsis.theme} onChange={(e) => setSynopsis((s) => ({ ...s, theme: e.target.value }))} /></Field><Field label="核心冲突"><textarea className={`${input} min-h-24`} value={synopsis.conflict} onChange={(e) => setSynopsis((s) => ({ ...s, conflict: e.target.value }))} /></Field><Field label="结局锚点" wide><textarea className={`${input} min-h-24`} value={synopsis.ending} onChange={(e) => setSynopsis((s) => ({ ...s, ending: e.target.value }))} /></Field></div></div><aside className="rounded-2xl border bg-card p-5"><div className="flex items-center gap-2 text-sm font-semibold"><Check className="size-4 text-emerald-600" />不可修改约束</div><p className="mt-2 text-xs leading-5 text-muted-foreground">AI 生成、续写和一致性检查都会遵守这些约束。</p><textarea className={`${input} mt-4 min-h-40`} value={synopsis.locked} onChange={(e) => setSynopsis((s) => ({ ...s, locked: e.target.value }))} /><div className="mt-5 rounded-xl bg-emerald-50 p-4 text-xs leading-5 text-emerald-800">当前 3 条约束已加入项目级记忆。</div></aside></div></>;
}

function Characters({ characters, character, select, update, add, onAi }: { characters: Character[]; character: Character; select: (id: number) => void; update: (p: Partial<Character>) => void; add: () => void; onAi: () => void }) {
  const selectClass = "w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary";
  const options = ["敏锐", "克制", "执拗", "沉稳", "疏离", "守诺", "圆滑", "谨慎", "幽默", "冲动"];
  return <><SectionHeader eyebrow="故事圣经 · 02" title="人物角色管理" description="用结构化选项建立稳定人物档案；自由文本只补充角色的独特部分。手工编辑不扣点。" action={<div className="flex gap-2"><Button variant="outline" onClick={add}><Plus className="mr-2 size-4" />新建角色</Button><Button onClick={onAi}><Sparkles className="mr-2 size-4" />AI 深化 · 160 点</Button></div>} /><div className="grid gap-4 lg:grid-cols-[260px_1fr]"><aside className="rounded-2xl border bg-card p-3"><p className="px-2 pb-3 pt-1 text-xs font-semibold text-muted-foreground">角色库 · {characters.length}</p><div className="space-y-1">{characters.map((item) => <button key={item.id} onClick={() => select(item.id)} className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition ${item.id === character.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}><span className={`grid size-9 place-items-center rounded-full text-sm font-semibold ${item.id === character.id ? "bg-white/15" : "bg-primary/10 text-primary"}`}>{item.name.slice(0, 1)}</span><span><strong className="block text-sm">{item.name}</strong><small className={item.id === character.id ? "text-white/65" : "text-muted-foreground"}>{item.role}</small></span></button>)}</div></aside><div className="rounded-2xl border bg-card p-5 md:p-7"><div className="mb-6 flex items-center justify-between"><div><input className="border-0 bg-transparent text-2xl font-semibold outline-none" value={character.name} onChange={(e) => update({ name: e.target.value })} /><p className="mt-1 text-xs text-muted-foreground">ID CHAR-{String(character.id).slice(-4)} · 已加入章节上下文</p></div><Badge variant="secondary">正式设定</Badge></div><Tabs defaultValue="profile"><TabsList><TabsTrigger value="profile">形象与性格</TabsTrigger><TabsTrigger value="voice">说话与口音</TabsTrigger><TabsTrigger value="arc">动机与秘密</TabsTrigger></TabsList><TabsContent value="profile" className="mt-5 grid gap-5 md:grid-cols-2"><Field label="角色功能"><select className={selectClass} value={character.role} onChange={(e) => update({ role: e.target.value })}>{["主角", "关键角色", "对立角色", "次要角色"].map((x) => <option key={x}>{x}</option>)}</select></Field><Field label="年龄段"><select className={selectClass} value={character.age} onChange={(e) => update({ age: e.target.value })}>{["少年（13–17）", "青年（18–24）", "青年（25–35）", "中年（36–50）", "年长（51+）"].map((x) => <option key={x}>{x}</option>)}</select></Field><Field label="身形体态"><select className={selectClass} value={character.build} onChange={(e) => update({ build: e.target.value })}>{["清瘦", "匀称", "高挑", "健壮", "魁梧"].map((x) => <option key={x}>{x}</option>)}</select></Field><Field label="核心性格"><div className="flex flex-wrap gap-2">{options.map((x) => <button key={x} onClick={() => update({ personality: character.personality.includes(x) ? character.personality.filter((p) => p !== x) : [...character.personality.filter((p) => p !== "待完善"), x] })} className={`rounded-full border px-3 py-1.5 text-xs ${character.personality.includes(x) ? "border-primary bg-primary text-white" : "bg-background hover:border-primary/50"}`}>{x}</button>)}</div></Field></TabsContent><TabsContent value="voice" className="mt-5 grid gap-5 md:grid-cols-2"><Field label="说话风格"><select className={selectClass} value={character.speech} onChange={(e) => update({ speech: e.target.value })}>{["短句、直接、很少解释", "语速偏慢，习惯用反问", "礼貌正式，回避肯定回答", "自然", "用词华丽、长句为主"].map((x) => <option key={x}>{x}</option>)}</select></Field><Field label="语言与口音"><select className={selectClass} value={character.accent} onChange={(e) => update({ accent: e.target.value })}>{["普通话 · 无明显口音", "普通话 · 轻微江南口音", "普通话 · 轻微北方口音", "粤语 · 广府口音", "四川话 · 成都口音"].map((x) => <option key={x}>{x}</option>)}</select></Field><div className="md:col-span-2 rounded-xl bg-muted p-4 text-xs leading-5 text-muted-foreground">这些信息会随音频生产包发送给本地客户端，用于筛选声音和表演提示；本地 IndexTTS 不消耗点数。</div></TabsContent><TabsContent value="arc" className="mt-5 grid gap-5"><Field label="核心目标"><textarea className={`${selectClass} min-h-24`} value={character.goal} onChange={(e) => update({ goal: e.target.value })} /></Field><Field label="秘密（仅在允许章节后加入上下文）"><textarea className={`${selectClass} min-h-24`} value={character.secret} onChange={(e) => update({ secret: e.target.value })} /></Field></TabsContent></Tabs></div></div></>;
}

function Outline({ onAi, goChapter }: { onAi: () => void; goChapter: () => void }) {
  const chapters = [["01", "归港", "林栀收到无邮戳来信，决定返回白榆港", "已完成"], ["02", "潮汐表", "旧友重逢；发现父亲留下的潮汐记录被改写", "已完成"], ["03", "没有寄件人的信", "进入封闭邮局，发现第一条可验证线索", "创作中"], ["04", "第十七码头", "调查事故名单，陈渡第一次正面阻拦", "待创作"], ["05", "沉默的人", "周屿的证词与档案发生矛盾", "待创作"]];
  return <><SectionHeader eyebrow="全书结构 · 03" title="大纲与章节分解" description="大纲按卷、阶段、章节和场景分层。AI 只生成候选，确认后才进入正式结构。" action={<Button onClick={onAi}><Sparkles className="mr-2 size-4" />生成候选大纲 · 180 点</Button>} /><div className="rounded-2xl border bg-card p-5 md:p-7"><div className="mb-5 flex items-center justify-between"><div><Badge>第一卷</Badge><h2 className="mt-2 text-xl font-semibold">雾中来信</h2><p className="mt-1 text-sm text-muted-foreground">卷目标：迫使林栀重返故乡，并证明父亲失踪案存在人为隐瞒。</p></div><div className="text-right"><p className="text-2xl font-semibold">5 / 9</p><p className="text-xs text-muted-foreground">章节已规划</p></div></div><div className="space-y-2">{chapters.map(([no, title, desc, status]) => <button key={no} onClick={no === "03" ? goChapter : undefined} className="grid w-full grid-cols-[44px_1fr_auto] items-center gap-3 rounded-xl border bg-background p-3 text-left transition hover:border-primary/35 hover:bg-primary/[.02]"><span className="grid size-9 place-items-center rounded-lg bg-muted font-mono text-xs">{no}</span><span><strong className="text-sm">{title}</strong><span className="mt-0.5 block text-xs text-muted-foreground">{desc}</span></span><Badge variant={status === "创作中" ? "default" : "outline"}>{status}</Badge></button>)}</div><Button variant="outline" className="mt-4 w-full border-dashed"><Plus className="mr-2 size-4" />添加章节</Button></div></>;
}

function Relations({ onAi }: { onAi: () => void }) {
  return <><SectionHeader eyebrow="知识图谱 · 04" title="人物关系图谱" description="关系可按章节生效，并区分公开关系、真实关系与双方不同认知。AI 更新会生成待审核候选。" action={<Button onClick={onAi}><Sparkles className="mr-2 size-4" />AI 更新图谱 · 90 点</Button>} /><div className="grid gap-4 xl:grid-cols-[1fr_320px]"><div className="relative min-h-[520px] overflow-hidden rounded-2xl border bg-[radial-gradient(circle_at_center,_#ffffff_0,_#f5f4fb_75%)]"><svg className="absolute inset-0 h-full w-full" aria-hidden><line x1="50%" y1="45%" x2="22%" y2="22%" stroke="#8b80e8" strokeWidth="2"/><line x1="50%" y1="45%" x2="78%" y2="26%" stroke="#e77777" strokeWidth="2" strokeDasharray="6 5"/><line x1="50%" y1="45%" x2="72%" y2="76%" stroke="#9ba0ac" strokeWidth="2"/><line x1="22%" y1="22%" x2="78%" y2="26%" stroke="#d0d2db" strokeWidth="2"/></svg>{[["林栀", "主角", "50%", "45%"], ["周屿", "守护 / 隐瞒", "22%", "22%"], ["陈渡", "敌对 / 控制", "78%", "26%"], ["林川山", "父女 / 失踪", "72%", "76%"]].map(([name, relation, left, top]) => <div key={name} className="absolute w-32 -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-white p-3 text-center shadow-lg" style={{ left, top }}><span className="mx-auto grid size-10 place-items-center rounded-full bg-primary/10 font-semibold text-primary">{name.slice(0, 1)}</span><strong className="mt-2 block text-sm">{name}</strong><small className="text-muted-foreground">{relation}</small></div>)}</div><aside className="rounded-2xl border bg-card p-5"><p className="text-sm font-semibold">待审核更新</p><p className="mt-1 text-xs text-muted-foreground">来自第 03 章草稿 v4</p><div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4"><Badge className="bg-amber-600">候选</Badge><p className="mt-3 text-sm font-medium">林栀 → 周屿</p><p className="mt-1 text-xs leading-5 text-amber-900/70">信任程度 -1：周屿回避了旧邮局钥匙的来源。</p><div className="mt-4 flex gap-2"><Button size="sm" className="flex-1">接受</Button><Button size="sm" variant="outline" className="flex-1">拒绝</Button></div></div><p className="mt-5 text-xs leading-5 text-muted-foreground">最近分析：第 01–02 章正式版本。当前草稿尚未写入正式图谱。</p></aside></div></>;
}

function Timeline({ onAi }: { onAi: () => void }) {
  const events = [["2007-08-17", "港口事故", "第十七码头发生未公开事故，林川山当晚失踪。", "林川山 · 陈渡"], ["2007-08-20", "林栀离港", "林栀被亲属接走，自此没有返回白榆港。", "林栀 · 周屿"], ["2019-11-02", "第一封信", "无邮戳来信出现在林栀工作室门口。", "林栀"], ["2019-11-03 06:20", "返回旧邮局", "林栀进入封闭的白榆港旧邮局。", "林栀 · 周屿"]];
  return <><SectionHeader eyebrow="故事时序 · 05" title="故事时间线" description="把事件、人物状态、地点与来源章节绑定；同一时段的地点冲突会被标记。" action={<Button onClick={onAi}><Sparkles className="mr-2 size-4" />AI 更新时间线 · 70 点</Button>} /><div className="rounded-2xl border bg-card p-5 md:p-7"><div className="relative ml-3 border-l-2 border-primary/20 pl-7">{events.map(([date, title, desc, people], index) => <div key={date} className="relative pb-8 last:pb-0"><span className={`absolute -left-[38px] top-1 size-5 rounded-full border-4 border-card ${index === events.length - 1 ? "bg-primary" : "bg-primary/35"}`} /><div className="grid gap-3 rounded-xl border bg-background p-4 md:grid-cols-[150px_1fr_auto]"><time className="font-mono text-xs font-semibold text-primary">{date}</time><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{desc}</p></div><Badge variant="outline">{people}</Badge></div></div>)}</div></div></>;
}

function Chapters({ chapter, setChapter, autoRelation, setAutoRelation, autoTimeline, setAutoTimeline, onAi }: { chapter: string; setChapter: (v: string) => void; autoRelation: boolean; setAutoRelation: (v: boolean) => void; autoTimeline: boolean; setAutoTimeline: (v: boolean) => void; onAi: () => void }) {
  const total = 220 + (autoRelation ? 90 : 0) + (autoTimeline ? 70 : 0);
  return <><SectionHeader eyebrow="章节生产 · 06" title="第 03 章 · 没有寄件人的信" description="当前上下文只包含截至本章已经成立的事实、人物知识、关系和时间线。" action={<Badge variant="secondary">草稿 v4 · {chapter.length} 字符</Badge>} /><div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]"><div className="overflow-hidden rounded-2xl border bg-card"><div className="flex items-center justify-between border-b px-5 py-3"><div className="flex gap-2"><Button size="sm" variant="ghost">正文</Button><Button size="sm" variant="ghost">场景</Button><Button size="sm" variant="ghost">版本</Button></div><span className="text-xs text-muted-foreground">自动保存已开启</span></div><textarea value={chapter} onChange={(e) => setChapter(e.target.value)} className="min-h-[560px] w-full resize-none bg-card px-6 py-7 font-serif text-lg leading-9 outline-none md:px-12" /></div><aside className="space-y-4"><div className="rounded-2xl border bg-card p-5"><div className="flex items-center gap-2"><BrainCircuit className="size-4 text-primary" /><h2 className="text-sm font-semibold">生成设置</h2></div><div className="mt-5 space-y-4"><label className="flex items-center justify-between gap-3"><span><strong className="block text-sm font-medium">更新人物关系图谱</strong><small className="text-muted-foreground">章节完成后分析 · 90 点</small></span><Switch checked={autoRelation} onCheckedChange={setAutoRelation} /></label><label className="flex items-center justify-between gap-3"><span><strong className="block text-sm font-medium">更新故事时间线</strong><small className="text-muted-foreground">章节完成后分析 · 70 点</small></span><Switch checked={autoTimeline} onCheckedChange={setAutoTimeline} /></label></div><div className="my-5 h-px bg-border" /><div className="flex items-center justify-between text-sm"><span>预计合计</span><strong className="text-primary">{total} 点</strong></div><Button className="mt-4 w-full" onClick={onAi}><Sparkles className="mr-2 size-4" />AI 续写</Button><p className="mt-3 text-center text-[11px] leading-4 text-muted-foreground">结果先进入草稿，不会直接修改正式设定。</p></div><MemoryCard /><Button variant="outline" className="w-full"><RotateCcw className="mr-2 size-4" />查看版本历史</Button></aside></div></>;
}
