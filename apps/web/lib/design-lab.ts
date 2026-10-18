import type { CSSProperties } from 'react';

export const designFamilies = [
  { id: 'utility', name: '清晰工具', description: '先找到软件，再选对设备' },
  { id: 'editorial', name: '纸上刊物', description: '把每次更新编排成好读的内容' },
  { id: 'swiss', name: '瑞士网格', description: '精准对齐，鲜明的信息层级' },
  { id: 'cinema', name: '影院夜色', description: '从影视软件的使用场景出发' },
  { id: 'organic', name: '温暖生活', description: '自然的色彩，轻松的阅读节奏' },
  { id: 'graphic', name: '图形实验', description: '用大胆的图形建立记忆点' },
  { id: 'workspace', name: '系统工作台', description: '像整理文件一样整理更新' },
  { id: 'heritage', name: '中文人文', description: '中文排版与现代界面的相遇' },
  { id: 'digital', name: '轻盈未来', description: '通透的层次与轻巧的科技感' },
  { id: 'community', name: '群友社区', description: '保留群聊的亲切，找回信息秩序' },
] as const;
export type DesignFamily = typeof designFamilies[number]['id'];
export interface LabDesign {
  id: string; name: string; family: DesignFamily; layout: string; concept: string;
  headline: string; fit: string; tradeoff: string; recommended?: boolean;
  colors: [string, string, string, string, string, string];
  onAccent: string; radius: number; heading: 'sans' | 'serif' | 'mono' | 'round';
}
type Input = Omit<LabDesign, 'id' | 'onAccent' | 'radius' | 'heading'> & Partial<Pick<LabDesign, 'onAccent' | 'radius' | 'heading'>>;
const d = (number: number, input: Input): LabDesign => ({ id: String(number).padStart(2, '0'), onAccent: '#ffffff', radius: 12, heading: 'sans', ...input });
// Palette order: background, surface, text, muted, accent, divider.
export const labDesigns: LabDesign[] = [
  d(1, { name:'一目了然', family:'utility', layout:'command', concept:'搜索就是首页主角，更新紧随其后。', headline:'你要的软件，在这里。', fit:'查找频繁、软件较多的群', tradeoff:'品牌表达比较克制', colors:['#f6f8fa','#ffffff','#192735','#5c6b79','#176b5c','#dce5e4'], radius:10 }),
  d(2, { name:'设备优先', family:'utility', layout:'finder', concept:'把安卓、苹果、电视、电脑做成首要入口。', headline:'选对设备，找到新版本。', fit:'首次访问与跨设备获取', tradeoff:'设备入口占用少量首屏空间', recommended:true, colors:['#f5f7fb','#ffffff','#142b48','#5a6b81','#235bc9','#dce4ef'], radius:14 }),
  d(3, { name:'掌上应用架', family:'utility', layout:'dock', concept:'软件图标组成快捷架，下面直接阅读更新。', headline:'常用的软件，都有新消息。', fit:'固定使用几款软件的群友', tradeoff:'软件数量变多后需要管理快捷架', colors:['#f7f7fa','#ffffff','#28263a','#696579','#6553b7','#e2e0eb'], radius:20, heading:'round' }),
  d(4, { name:'极简清单', family:'utility', layout:'compact', concept:'收紧刊头，把空间留给日期、设备与版本。', headline:'更新，不用翻群。', fit:'希望快速扫读的用户', tradeoff:'视觉表现安静', colors:['#ffffff','#f7f9fa','#253039','#5d6d73','#126778','#dce5e8'], radius:4 }),
  d(5, { name:'双栏导航', family:'utility', layout:'split', concept:'设备导航与更新正文分栏，手机变为横向选择。', headline:'你的设备，专属更新。', fit:'软件与设备种类持续增加', tradeoff:'桌面效果比手机更丰富', colors:['#edf2f8','#ffffff','#24334b','#5b6a80','#385eb0','#d6dfec'], radius:8 }),

  d(6, { name:'更新日报', family:'editorial', layout:'journal', concept:'大刊头、日期栏与主次新闻组成每日更新报。', headline:'今天，软件有新消息。', fit:'持续发布内容的站点', tradeoff:'需要保持摘要质量', colors:['#f9f8f4','#ffffff','#2d3034','#66686c','#365f98','#d9dddF'], radius:2, heading:'serif' }),
  d(7, { name:'周末影讯', family:'editorial', layout:'gazette', concept:'重点更新像封面文章，其他版本排列在侧栏。', headline:'好用的版本，值得留下。', fit:'有精选内容与使用建议', tradeoff:'重点更新会更突出', colors:['#f1f4ef','#fbfcf9','#263b32','#5d6d62','#38694f','#cbd8ce'], radius:0, heading:'serif' }),
  d(8, { name:'轻刊', family:'editorial', layout:'folio', concept:'窄刊头、充足留白与细致日期，轻快又有质感。', headline:'更新有序，使用安心。', fit:'中文移动阅读与长期运营', tradeoff:'不追求强烈的视觉刺激', recommended:true, colors:['#fafaf8','#ffffff','#25322e','#646f69','#396c57','#dfe5df'], radius:6, heading:'serif' }),
  d(9, { name:'更新文摘', family:'editorial', layout:'digest', concept:'摘要优先的文章目录，用侧边日期索引定位。', headline:'几行字，看懂这次更新。', fit:'更新说明较长的内容', tradeoff:'同屏软件图标更小', colors:['#faf8f8','#ffffff','#352b35','#72636f','#8e416d','#e6dce3'], radius:0, heading:'serif' }),
  d(10, { name:'页边笔记', family:'editorial', layout:'margin', concept:'公告与安装提醒像页边注释，正文保持完整。', headline:'每次更新，都说明白。', fit:'安装提醒和使用教程较多', tradeoff:'桌面需要适当阅读宽度', colors:['#f6f7f1','#fffefb','#33362b','#6b6e5e','#647333','#dfe2d2'], radius:3, heading:'serif' }),

  d(11, { name:'蓝色网格', family:'swiss', layout:'swiss', concept:'强蓝色刊头配严格的四列网格，信息直给。', headline:'软件更新。一站看全。', fit:'偏爱鲜明秩序感', tradeoff:'边界感较强', colors:['#f5f6f8','#ffffff','#172b4e','#566985','#184dca','#cad5e8'], radius:0 }),
  d(12, { name:'精准索引', family:'swiss', layout:'index', concept:'软件、设备、版本排成对齐的检索表。', headline:'找到软件，选好版本。', fit:'版本较多、下载目的明确', tradeoff:'说明文本需要控制长度', colors:['#f7f8fa','#ffffff','#22313f','#606e79','#3e5f80','#d5dde4'], radius:0 }),
  d(13, { name:'模块秩序', family:'swiss', layout:'modular', concept:'尺寸有节奏的模块，区分重点更新与普通更新。', headline:'更新，各就各位。', fit:'重点内容和日常更新并存', tradeoff:'强调部分内容的权重', colors:['#faf8f2','#ffffff','#2e312b','#6c6c5e','#84640e','#dfddce'], onAccent:'#ffffff', radius:0 }),
  d(14, { name:'不对称留白', family:'swiss', layout:'asymmetric', concept:'左侧大标题与右侧更新流错位对齐。', headline:'新的版本，刚好找到。', fit:'重视设计感的精品站点', tradeoff:'移动端会回归单栏', colors:['#f5f6fa','#ffffff','#292d4b','#666b84','#514eb3','#dbddee'], radius:0 }),
  d(15, { name:'红线坐标', family:'swiss', layout:'axis', concept:'一根红色时间轴串联版本，清楚标记新旧。', headline:'每一个版本，都有记录。', fit:'多版本与变更历史', tradeoff:'时间线比紧凑表格更长', colors:['#faf8f7','#ffffff','#342d2b','#756760','#ad4039','#e7d9d5'], radius:0 }),

  d(16, { name:'午夜放映', family:'cinema', layout:'marquee', concept:'电影字幕式刊头与低亮列表，适合夜间阅读。', headline:'今晚，换个好用的版本。', fit:'影视群、偏好深色的用户', tradeoff:'长篇教程仍需明晰层级', colors:['#151b2a','#1e2638','#edf1fa','#b0bbce','#95baff','#35415b'], onAccent:'#18243b', radius:10 }),
  d(17, { name:'宽银幕', family:'cinema', layout:'widescreen', concept:'横幅精选更新像宽银幕，列表横向编排。', headline:'大屏体验，也要常新。', fit:'电视版与电脑版本较多', tradeoff:'重点横幅只展示一条', colors:['#171a20','#22262e','#f0f2f7','#b5bdca','#f3c477','#3e4148'], onAccent:'#302510', radius:4 }),
  d(18, { name:'放映清单', family:'cinema', layout:'screening', concept:'借鉴影院排片表，以设备和版本快速查阅。', headline:'新版本，已为你排好。', fit:'喜欢紧凑信息与深色界面', tradeoff:'氛围更偏影视场景', colors:['#152323','#203232','#e9f4ef','#abc8bf','#8cdbb6','#3a5350'], onAccent:'#15362c', radius:0 }),
  d(19, { name:'深海片库', family:'cinema', layout:'midnight', concept:'侧向目录、深蓝层次与大图标形成安静片库。', headline:'把好用的软件，收进来。', fit:'软件目录与更新同样重要', tradeoff:'桌面侧栏需要更多空间', colors:['#101d30','#192b43','#edf3fc','#a9bbd4','#81b9df','#314a69'], onAccent:'#142d42', radius:18 }),
  d(20, { name:'霓虹场记', family:'cinema', layout:'neon', concept:'紫色光线只标记重点，版本信息仍保持清晰。', headline:'新版本，上场。', fit:'年轻影视社群', tradeoff:'视觉个性强于中性风格', colors:['#211c2c','#2d263b','#f6edfc','#c3b1d1','#c5a2f4','#50415e'], onAccent:'#2c1745', radius:12 }),

  d(21, { name:'森绿书签', family:'organic', layout:'grove', concept:'绿色书签标记日期，柔和纸白承载更新内容。', headline:'好用的软件，慢慢整理好。', fit:'亲和、可信的群分享入口', tradeoff:'视觉气质偏安静', recommended:true, colors:['#f2f6f1','#ffffff','#253d30','#5d7363','#35664a','#d5e1d4'], radius:16, heading:'serif' }),
  d(22, { name:'亚麻便笺', family:'organic', layout:'linen', concept:'浅米色便笺和圆点日期，像一页生活备忘。', headline:'软件小事，这里记着。', fit:'轻松友好的小型社区', tradeoff:'不适合非常密集的资料', colors:['#f7f5ed','#fffef8','#3c3c2e','#6e6e5b','#6f7040','#e1dfcd'], radius:10, heading:'serif' }),
  d(23, { name:'陶土工坊', family:'organic', layout:'clay', concept:'砖红色设备条和硬朗纸片，温暖但不甜腻。', headline:'每次更新，认真打理。', fit:'有个人运营气质的站点', tradeoff:'需要保持配色克制', colors:['#f6f1ef','#fffdfb','#49342e','#79675f','#9b4b35','#e6d6ce'], radius:7 }),
  d(24, { name:'花间轻读', family:'organic', layout:'petal', concept:'淡紫分区和细长列表，保留轻柔的社区气质。', headline:'新的消息，轻轻送达。', fit:'偏爱柔和细腻的用户', tradeoff:'强视觉对比相对少', colors:['#f7f3f8','#ffffff','#47364e','#7d6884','#865792','#e5d9e8'], radius:22, heading:'round' }),
  d(25, { name:'海边信箱', family:'organic', layout:'coast', concept:'蓝灰背景配信件式公告，更新像收到的来信。', headline:'软件来信，请查收。', fit:'重视公告触达的群', tradeoff:'信件隐喻需要少量说明', colors:['#edf5f6','#ffffff','#2a4851','#607881','#317887','#cfe1e5'], radius:14 }),

  d(26, { name:'更新海报', family:'graphic', layout:'poster', concept:'醒目大字与版本标贴，像贴在墙上的更新海报。', headline:'有更新。来看看。', fit:'强品牌识别与年轻社群', tradeoff:'大标题需要限制字数', colors:['#f4ef42','#fffef4','#25251c','#5f5f42','#27281d','#cfce83'], onAccent:'#ffffff', radius:0 }),
  d(27, { name:'包豪斯软件架', family:'graphic', layout:'bauhaus', concept:'几何设备标记与双色分区，建立图形秩序。', headline:'好软件，组合出好体验。', fit:'喜欢设计与几何语言', tradeoff:'视觉元素较鲜明', colors:['#f5f2e9','#fffdf7','#26324a','#667080','#2852a5','#d7d8d7'], radius:0 }),
  d(28, { name:'色块索引', family:'graphic', layout:'blocks', concept:'按设备划分大色块，每个区块直达对应版本。', headline:'按你的设备，找。', fit:'设备分类是主要访问路径', tradeoff:'横向分区依赖宽屏', colors:['#f3f0fa','#ffffff','#332c4b','#716584','#704caa','#ddd3ee'], radius:0 }),
  d(29, { name:'贴纸更新', family:'graphic', layout:'punch', concept:'粗边框、版本贴纸与短句，强调可点击性。', headline:'新版本，安排上了。', fit:'活跃、有趣的分享群', tradeoff:'视觉存在感较高', colors:['#eef4ff','#ffffff','#253653','#5f7090','#2c5cc4','#263b60'], radius:10 }),
  d(30, { name:'软件蓝图', family:'graphic', layout:'blueprint', concept:'细网格像软件蓝图，用标注解释平台与状态。', headline:'把更新，讲清楚。', fit:'工具型与技术兴趣社群', tradeoff:'较理性的视觉语言', colors:['#eaf1f8','#f7fbff','#224366','#5c7792','#245c91','#bcd1e5'], radius:0, heading:'mono' }),

  d(31, { name:'文件归档', family:'workspace', layout:'files', concept:'软件像文件夹，版本是其中可回看的文件。', headline:'更新归档，随时找到。', fit:'多软件与多版本维护', tradeoff:'桌面文件隐喻略强', colors:['#f3f4f7','#ffffff','#313747','#6d7483','#536b9d','#dce0e8'], radius:9 }),
  d(32, { name:'更新收件箱', family:'workspace', layout:'inbox', concept:'公告置顶，更新像收件箱一样逐条排列。', headline:'你的软件，有新消息。', fit:'每天快速查看更新', tradeoff:'内容卡片更偏工具', colors:['#f5f6f8','#ffffff','#2d3647','#687489','#3e638f','#dce2eb'], radius:6 }),
  d(33, { name:'设备看板', family:'workspace', layout:'kanban', concept:'以设备为列，分别显示最新可用版本。', headline:'每种设备，各有更新。', fit:'跨平台软件较多', tradeoff:'手机回归按设备筛选', colors:['#eef3f2','#ffffff','#2b4440','#647a76','#33796b','#d2e1dd'], radius:10 }),
  d(34, { name:'版本时间轴', family:'workspace', layout:'timeline', concept:'日期连成时间线，旧版本不再被新消息盖住。', headline:'沿着时间，找到版本。', fit:'关心升级路径和回退的用户', tradeoff:'页面会随更新增长', colors:['#f5f2f8','#ffffff','#3a304a','#796b89','#7c5ba5','#e1d7eb'], radius:8 }),
  d(35, { name:'软件资源管理器', family:'workspace', layout:'explorer', concept:'平台目录树与版本列表组成双区域资源管理器。', headline:'设备、软件、版本，分明。', fit:'电脑用户与资料较多的群', tradeoff:'手机端精简为单栏', colors:['#eff3f7','#ffffff','#2b3e50','#65798b','#336d98','#d2dfe9'], radius:4, heading:'mono' }),

  d(36, { name:'水墨留白', family:'heritage', layout:'ink', concept:'宋体刊头与墨色时间线，保持中文阅读的呼吸感。', headline:'新知常在，版本常新。', fit:'喜欢安静中文排版', tradeoff:'需要克制装饰', colors:['#f6f6f2','#fffffc','#303a36','#6d7770','#416254','#d8ded7'], radius:0, heading:'serif' }),
  d(37, { name:'朱砂公告', family:'heritage', layout:'vermilion', concept:'朱红公告栏与横排题签，让重要消息先被看见。', headline:'新版本，告知诸位。', fit:'公告较多、重视中文气质', tradeoff:'红色仅用于少量重点', colors:['#fcf8f3','#fffefb','#48362d','#7b6b60','#a74032','#e9d9cc'], radius:2, heading:'serif' }),
  d(38, { name:'竹青书架', family:'heritage', layout:'bamboo', concept:'竖向软件书签与横排更新说明，像整理好的书架。', headline:'常用之物，常看常新。', fit:'软件目录是稳定入口', tradeoff:'书签只用于短标题', colors:['#f1f5ed','#fffef8','#35452d','#6e7b63','#59713d','#d7e1cb'], radius:0, heading:'serif' }),
  d(39, { name:'线装新页', family:'heritage', layout:'book', concept:'双页式正文与页码日期，软件说明像打开的一本书。', headline:'翻开这一页，找到新版本。', fit:'教程内容与更新并重', tradeoff:'桌面双页手机单页', colors:['#f7f3e9','#fffdf6','#4b4130','#7d7461','#8c6e35','#e4d9c2'], radius:1, heading:'serif' }),
  d(40, { name:'青印小站', family:'heritage', layout:'seal', concept:'青色印记标注设备，清爽横排适合日常访问。', headline:'软件常新，消息不散。', fit:'传统气质与现代效率兼顾', tradeoff:'品牌表达需要保持简洁', colors:['#eef5f4','#fcfffd','#2c4845','#65807b','#37786f','#d1e3de'], radius:5, heading:'serif' }),

  d(41, { name:'玻璃书架', family:'digital', layout:'glass', concept:'通透分层的内容面板，软件图标像陈列在玻璃架。', headline:'清透一点，更新清楚一点。', fit:'喜欢轻盈科技感', tradeoff:'透明效果不能影响对比度', colors:['#eff3fb','#ffffff','#30405c','#697791','#4f6db8','#d8e2f5'], radius:20 }),
  d(42, { name:'极光清单', family:'digital', layout:'aurora', concept:'柔和极光只出现在刊头，正文用清晰的纯色面板。', headline:'发现新版本的好体验。', fit:'年轻、轻科技视觉', tradeoff:'渐变区域需要限制尺寸', colors:['#f0f6f8','#ffffff','#2c4754','#64808d','#347c88','#d2e4e9'], radius:18 }),
  d(43, { name:'轨道更新', family:'digital', layout:'orbit', concept:'设备环绕软件入口，下面是按时间排列的版本。', headline:'让设备，接上新版本。', fit:'多个设备切换频繁', tradeoff:'轨道仅作设备导航', colors:['#f5f3fa','#ffffff','#45365f','#7b6b90','#7656af','#e2d9ef'], radius:24, heading:'round' }),
  d(44, { name:'信息网格', family:'digital', layout:'mesh', concept:'细点阵背景配整齐的信息网格，轻巧而精确。', headline:'软件新动态，清楚连接。', fit:'目录和版本同样重要', tradeoff:'纹理保持低对比', colors:['#f0f5fa','#ffffff','#2f455d','#677e95','#34749d','#d1e0ed'], radius:12 }),
  d(45, { name:'棱镜目录', family:'digital', layout:'prism', concept:'斜切设备标签配平直列表，重点鲜明而正文安静。', headline:'从你的设备，看见更新。', fit:'希望保留鲜明品牌记忆', tradeoff:'斜切只用于导航', colors:['#f2f2fa','#ffffff','#3b3c65','#73759a','#6165b4','#dedff0'], radius:8 }),

  d(46, { name:'群友布告栏', family:'community', layout:'bulletin', concept:'顶部一张重要布告，下面是整理好的更新消息。', headline:'群里的重要消息，都在这。', fit:'从群聊进入的普通手机用户', tradeoff:'视觉更偏亲切日常', colors:['#f4f7f2','#ffffff','#354630','#6a7a63','#54713f','#dbe4d4'], radius:13 }),
  d(47, { name:'消息不刷走', family:'community', layout:'chat', concept:'用熟悉的消息气泡承载更新，设备与版本清晰列出。', headline:'这一次，消息不会刷走。', fit:'希望降低群友学习成本', tradeoff:'消息形式会拉长列表', colors:['#eff5f2','#ffffff','#2d453b','#647d71','#2f7958','#d1e3d9'], radius:16, heading:'round' }),
  d(48, { name:'更新动态圈', family:'community', layout:'feed', concept:'以软件为头像的动态流，每次更新像一条明确通知。', headline:'关注的软件，最近怎么样？', fit:'每天回访查看的群友', tradeoff:'内容流需要明确日期', colors:['#f6f5fa','#ffffff','#3e3653','#7a708d','#7b5caa','#e2ddec'], radius:10 }),
  d(49, { name:'便利贴小墙', family:'community', layout:'pinboard', concept:'不同尺寸便笺区分公告、版本和安装提醒。', headline:'重要的，都贴在这里。', fit:'喜欢轻松和手作气质', tradeoff:'桌面拼贴手机按序排列', colors:['#f7f4e8','#fffdf5','#48452f','#7b785c','#897023','#e5dfc5'], radius:3 }),
  d(50, { name:'邻里服务站', family:'community', layout:'neighborhood', concept:'像一个小小服务窗口，软件、公告与指南各有入口。', headline:'软件的事，来小站看看。', fit:'非技术用户与长期群入口', tradeoff:'强调亲和而非科技感', colors:['#f1f5f8','#ffffff','#334959','#6a7e8c','#3e7797','#d7e3eb'], radius:18, heading:'round' }),
];
export function getLabDesign(id: string) { return labDesigns.find(design => design.id === id); }
export function labTokens(design: LabDesign): CSSProperties {
  const [bg, surface, ink, muted, accent, line] = design.colors;
  return { '--lab-bg':bg, '--lab-surface':surface, '--lab-ink':ink, '--lab-muted':muted, '--lab-accent':accent, '--lab-line':line, '--lab-on-accent':design.onAccent, '--lab-radius':`${design.radius}px`, '--lab-heading': design.heading === 'serif' ? '"Songti SC", "STSong", "SimSun", serif' : design.heading === 'mono' ? '"Cascadia Code", Consolas, "Microsoft YaHei", sans-serif' : design.heading === 'round' ? '"Yuanti SC", "Microsoft YaHei", sans-serif' : '"PingFang SC", "Microsoft YaHei", sans-serif' } as CSSProperties;
}
export function labHref(id: string, suffix = '') { return `/designs/${id}${suffix}`; }
