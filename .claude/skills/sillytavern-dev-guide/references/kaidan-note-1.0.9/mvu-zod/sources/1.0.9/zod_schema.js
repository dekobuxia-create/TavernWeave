// 怪谈笔记 · 绮罗世界 MVU schema v1.0.7：15 变量根契约与状态栏数据校验。
// Kaidan Note card v1.0.7 / Zod Schema / 2026-08-06：怪谈笔记根新增「鬼怪」record（鬼怪捏造页面）；载具扩外观/内饰/性能/当前乘员/购入来源；私密档案「性器深度」+「子宫填充度」（1.0.6 起）。
// ------------------------------------------------------------
// 架构:变量根设计.md(7 app/15 根);数值:怪谈笔记-数值草案-v0.1.md;设定字段:设定/ 5 篇「变量对接」。
// 命名纪律:禁神化/网文八股;档位用朴素写实词。
// ============================================================

// [validate-strip-start] 校验脚本以此标记剥离 CDN import,注入本地 zod stub;生产运行时走 CDN。
let registerMvuSchema;
try {
  ({ registerMvuSchema } = await import('https://cdn.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js'));
} catch (error) {
  console.warn('[Kaidan Note] official mvu_zod helper import failed, fallback to testingcf mirror:', error);
  ({ registerMvuSchema } = await import('https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js'));
}
// [validate-strip-end]

// ---- 通用工具 ----
const LooseString = (fallback = '') => z.preprocess(v => (v === undefined || v === null || v === '' ? fallback : String(v)), z.string()).prefault(fallback);
const Num = (min, max, fallback = 0) => z.coerce.number().transform(v => _.clamp(v, min, max)).prefault(fallback);
const PlainNum = (fallback = 0) => z.coerce.number().prefault(fallback);
const Bool = (fallback = false) => z.preprocess(
  v => (v === 'true' ? true : v === 'false' ? false : v),
  z.boolean(),
).prefault(fallback);
const Presence = z.preprocess(
  v => (v === true || v === 'true' ? '在场' : v === false || v === 'false' ? '隐去' : v),
  z.string(),
).prefault('');

// ---- 枚举档位(朴素写实词) ----
const 业力档 = LooseString('自然'); // 天衣无缝 / 自然 / 可疑 / 招摇 / 惊世
const 恶性档 = LooseString('小恶'); // 大恶 / 中恶 / 小恶 / 误伤
const 规则类型 = LooseString('定向'); // 定向 / 常驻
const 规则状态 = LooseString('生效中'); // 生效中 / 已兑现 / 已失效 / 已撤销
const 倾向档 = LooseString('中立'); // 强正向 / 正向 / 中立 / 负向 / 强负向
const 失控档 = LooseString('无'); // 无 / 轻度 / 中度 / 重度
const 追查阶段档 = LooseString('平静'); // 平静 / 立案 / 建模 / 布控 / 收网 / 抓捕
const 参与范围档 = LooseString('无'); // 无 / 地方 / 国家 / 跨国
const 社会认知档 = LooseString('无痕'); // 无痕 / 窃议 / 发酵 / 半公开(棘轮,基本只进不退)
const 新闻层级 = LooseString('都市媒体'); // 官方通稿 / 都市媒体 / 怪谈帖 / 热搜 / 短视频
const 好感档说明 = '0~19陌生 20~39熟稔 40~59亲近 60~79深交 80~100伴侣';

// ---- 子 schema ----
const 衣着Schema = z.object({
  上装: z.string().prefault(''),
  下装: z.string().prefault(''),
  内衣: z.string().prefault(''),
  内裤: z.string().prefault(''),
  袜子: z.string().prefault(''),
  鞋子: z.string().prefault(''),
  配饰: z.string().prefault('无'),
}).prefault({});

const 身体状态Schema = z.object({
  整体状况: z.string().prefault(''),
  体温: z.string().prefault(''),
  心率: z.string().prefault(''),
  皮肤状态: z.string().prefault(''),
  特殊标记: z.string().prefault(''),
  朱唇: z.string().prefault(''),
  乳房: z.string().prefault(''),
  美臀: z.string().prefault(''),
  小穴: z.string().prefault(''),
  菊穴: z.string().prefault(''),
  玉足: z.string().prefault(''),
}).prefault({});

const 角色状态Schema = z.object({
  姿态与交互: z.string().prefault(''),
  当前状态: z.string().prefault(''),
  体力值: Num(0, 100, 100),
  饱腹值: Num(0, 100, 100),
  水分值: Num(0, 100, 100),
  洁净值: Num(0, 100, 100),
}).passthrough().prefault({});

const 细节档案Schema = z.object({
  经历: z.any().optional(),
  弱点: z.any().optional(),
  偏好: z.any().optional(),
  技能: z.any().optional(),
  习惯: z.any().optional(),
  携带物: z.any().optional(),
  居所: z.any().optional(),
  风险: z.any().optional(),
}).prefault({});

const 私密档案Schema = z.object({
  是否为处女: z.any().optional(),
  初夜对象: z.any().optional(),
  是否怀孕: z.any().optional(),
  怀孕几率: z.any().optional(),
  内射次数: z.any().optional(),
  总内射量: z.any().optional(),
  总吸收量: z.any().optional(),
  泼洒量: z.any().optional(),
  配偶: z.any().optional(),
  生理期: z.any().optional(),
  体毛: z.any().optional(),
  性耐力: z.any().optional(),
  性器深度: z.any().optional(), // 女性专属(男性私密档案绝对禁写,故不设"长度"字段)
  子宫填充度: z.any().optional(), // 女性专属 0~100,驱动角色详情子宫填充状态行
  上次内射时间: z.any().optional(),
  名器: z.any().optional(),
  名器活跃度: z.any().optional(),
  纹身: z.any().optional(),
  处女状态: z.any().optional(),
  怀孕状态: z.any().optional(),
}).prefault({});

const Schema = z.object({

  // ============ 环境(负一屏 widget · 含地理四级) ============
  环境: z.object({
    日期: z.string().prefault(''),
    时间: z.string().prefault(''),
    经过天数: Num(0, Number.MAX_SAFE_INTEGER, 0),
    所在位置: z.object({
      国家: z.string().prefault(''),   // 开局地理设定页写入
      省份: z.string().prefault(''),   // 开局地理设定页写入
      城市: z.string().prefault(''),   // 开局地理设定页写入
      行政区: z.string().prefault(''),
      街区: z.string().prefault(''),
      具体地点: z.string().prefault(''), // 开局地理设定页写入,随正文更新
      建筑: z.string().prefault(''),
      楼层: z.string().prefault(''),
    }).prefault({}),
    城市环境: z.object({
      位置类型: z.string().prefault(''),
      环境描述: z.string().prefault(''),
      天气: z.string().prefault(''),
      大气温度: z.string().prefault(''),
      体感温度: z.string().prefault(''),
      风力: z.string().prefault(''),
      降水: z.string().prefault(''),
      光照条件: z.string().prefault(''),
      噪音水平: z.string().prefault(''),
      人流密度: z.string().prefault(''),
      交通状况: z.string().prefault(''),
      治安状况: z.string().prefault(''),
    }).prefault({}),
    近期节日: z.string().prefault(''),
    日程: z.record(
      z.string().describe('日程名'),
      z.object({
        内容: z.string().prefault(''),
        时间: z.string().prefault(''),
        倒计时: z.string().prefault(''),
        进度: z.string().prefault(''),
      }).prefault({})
    ).prefault({}),
  }).prefault({}),

  // ============ user(自身 app · persona 兼容,不预设背景) ============
  user: z.object({
    性别年龄: z.object({
      主角性别: z.string().prefault(''),
      主角年龄: z.coerce.string().prefault(''),
    }).prefault({}),
    身份背景: z.object({
      身份: z.string().prefault(''),
      背景: z.string().prefault(''),
    }).prefault({}),
    外貌身材: z.object({
      外貌: z.string().prefault(''),
      身材: z.string().prefault(''),
      外貌特点: z.string().prefault(''),
    }).prefault({}),
    当前穿着: 衣着Schema,
    状态: z.string().prefault(''),
    体力: Num(0, 100, 100),
    饱腹值: Num(0, 100, 100),
    水分值: Num(0, 100, 100),
    洁净值: Num(0, 100, 100),
    现金: Num(0, Number.MAX_SAFE_INTEGER, 0),
    存款: Num(0, Number.MAX_SAFE_INTEGER, 0),
  }).prefault({}),

  // ============ 怪谈笔记(Kaidan Note app · 核心根) ============
  怪谈笔记: z.object({
    法则: z.record(
      z.string().describe('规则id,如 R001'),
      z.object({
        名称: z.string().prefault(''),          // 玩家起名或按对象自动
        类型: 规则类型,                          // 定向 / 常驻
        对象: z.string().prefault(''),
        触发条件: z.string().prefault(''),
        怪谈内容: z.string().prefault(''),
        范围: z.string().prefault(''),
        时限: z.string().prefault(''),
        自由描述: z.string().prefault(''),
        业力档: 业力档,
        状态: 规则状态,
        创建时间: z.string().prefault(''),
        到期时间: z.string().prefault(''),
        兑现人数: Num(0, Number.MAX_SAFE_INTEGER, 0), // 常驻法则渐次结算累计
        破译进度: Num(0, 100, 0),               // 调查组对本规则的反推程度,满=被破译
      }).passthrough().prefault({})
    ).prefault({}),
    // 鬼怪捏造:与写规则同级的创造能力(不耗修正),鬼怪/鬼域实体档案
    鬼怪: z.record(
      z.string().describe('鬼怪编号,如 G001'),
      z.object({
        名称: z.string().prefault(''),
        类型: z.string().prefault('鬼怪'),   // 鬼怪 / 鬼域
        形态: z.string().prefault(''),
        栖息地: z.string().prefault(''),     // 鬼怪栖息地 / 鬼域位置范围
        危害等级: z.string().prefault(''),   // 无害 / 扰民 / 危险 / 致命
        状态: z.string().prefault('活跃'),   // 活跃 / 蛰伏 / 被破除 / 消散
        传闻: z.string().prefault(''),       // 民间流传的版本
        自由描述: z.string().prefault(''),
        创建时间: z.string().prefault(''),
        备注: z.string().prefault(''),
      }).passthrough().prefault({})
    ).prefault({}),
  }).prefault({}),

  // ============ 权限(等级 · 双货币 · 槽位 · 硬件) ============
  权限: z.object({
    等级: Num(1, 12, 1),
    范围上限: z.string().prefault('100米'),
    杀戮值: Num(0, Number.MAX_SAFE_INTEGER, 0),
    修正总合: Num(0, Number.MAX_SAFE_INTEGER, 0),
    当期修正: Num(0, Number.MAX_SAFE_INTEGER, 0),
    法则槽位: z.object({
      上限: Num(0, 99, 0),
      已用: Num(0, 99, 0),
    }).prefault({}),
    已购硬件: z.record(
      z.string().describe('升级项名'),
      z.string().describe('当前档位')
    ).prefault({}),
    解锁能力: z.array(z.string()).prefault([]),
  }).prefault({}),

  // ============ 影响倾向(总枢纽 · 世界演化页浮标) ============
  影响倾向: z.object({
    数值: Num(-100, 100, 0),
    当前档: 倾向档,
    失控状态: 失控档,
  }).prefault({}),

  // ============ 暴露调查组(通缉 tab) ============
  暴露调查组: z.object({
    暴露度: Num(0, 100, 0),
    追查阶段: 追查阶段档,
    参与范围: 参与范围档,
    整体建模程度: Num(0, 100, 0),
    核心对手: z.object({
      姓名: z.string().prefault(''),
      任数: Num(0, 99, 0),
      状态: z.string().prefault(''),   // 未上任 / 在任 / 已死亡 / 已退场
      风格备注: z.string().prefault(''),
    }).prefault({}),
    玩家潜伏: z.object({
      状态: z.string().prefault('无'), // 无 / 外围 / 内部
      怀疑度: Num(0, 100, 0),
    }).prefault({}),
  }).prefault({}),

  // ============ 世界演化(3 轴 + 认知棘轮 + 恶势力 + 时代事件) ============
  世界演化: z.object({
    体系信任: Num(-100, 100, 0),
    道德风气: Num(-100, 100, 0),
    秩序稳定: Num(-100, 100, 0),
    社会认知度: 社会认知档,
    恶势力: z.record(
      z.string().describe('势力名'),
      z.object({
        性质: z.string().prefault(''),
        规模: z.string().prefault(''),
        状态: z.string().prefault(''), // 活跃 / 衰退 / 覆灭 / 扩张
        备注: z.string().prefault(''),
      }).prefault({})
    ).prefault({}),
    时代事件: z.record(
      z.string().describe('事件名'),
      z.object({
        内容: z.string().prefault(''),
        影响: z.string().prefault(''),
        时间: z.string().prefault(''),
      }).prefault({})
    ).prefault({}),
  }).prefault({}),

  // ============ 舆论新闻(高频流) ============
  舆论新闻: z.object({
    民意值: Num(-100, 100, 0), // 负=通缉恐慌,正=庇护叫好
    新闻流: z.record(
      z.string().describe('新闻id,如 N001'),
      z.object({
        标题: z.string().prefault(''),
        层级: 新闻层级,
        倾向: LooseString('中'), // 正 / 负 / 中
        热度: Num(0, 100, 0),
        内容: z.string().prefault(''),
        时间: z.string().prefault(''),
        状态: z.string().prefault('发酵中'), // 发酵中 / 已平息 / 被压制
      }).prefault({})
    ).prefault({}),
    民间怪谈名: z.record(
      z.string().describe('民间起的怪谈名(AI 涌现,不预设)'),
      z.object({
        指代: z.string().prefault(''),  // 对应哪条规则/现象
        流行度: Num(0, 100, 0),
      }).prefault({})
    ).prefault({}),
  }).prefault({}),

  // ============ 处刑档案(死亡饼图数据源) ============
  处刑档案: z.object({
    总处刑数: Num(0, Number.MAX_SAFE_INTEGER, 0),
    死亡计数: z.record(
      z.string().describe('受害群体类别,如 捞女/家暴者/偷拍者;稳定归类词,同类复用'),
      Num(0, Number.MAX_SAFE_INTEGER, 0)
    ).prefault({}),
    鬼怪处刑: z.record(
      z.string().describe('鬼怪编号,如 G001'),
      Num(0, Number.MAX_SAFE_INTEGER, 0)
    ).prefault({}),
    处刑记录: z.record(
      z.string().describe('记录id,如 K001'),
      z.object({
        目标: z.string().prefault(''),
        规则id: z.string().prefault(''),
        时间: z.string().prefault(''),
        死法摘要: z.string().prefault(''),
        业力档: 业力档,
        恶性档: 恶性档,
        获得杀戮: PlainNum(0),
        获得修正: PlainNum(0),
      }).prefault({})
    ).prefault({}),
  }).prefault({}),

  // ============ 世界调制(附属 app · 后宫空间) ============
  世界调制: z.object({
    后宫空间: z.object({
      已开通: Bool(false),
      场景描述: z.string().prefault(''),
      成员: z.record(
        z.string().describe('成员名'),
        z.object({
          来源: z.string().prefault(''),
          状态: z.string().prefault(''),
          备注: z.string().prefault(''),
        }).prefault({})
      ).prefault({}),
    }).prefault({}),
    调制记录: z.record(
      z.string().describe('记录id,如 M001'),
      z.object({
        类型: z.string().prefault(''), // 目标搜索/造美好/操控新闻/扶植摧毁/改命/抹记忆
        内容: z.string().prefault(''),
        花费: PlainNum(0),
        时间: z.string().prefault(''),
        影响: z.string().prefault(''),
      }).prefault({})
    ).prefault({}),
  }).prefault({}),

  // ============ 角色档案(NPC + 授予者羁绊) ============
  角色档案: z.record(
    z.string().describe('角色真实姓名'),
    z.object({
      角色类型: LooseString('当前互动'),
      羁绊标签: Bool(false),
      年龄: z.string().prefault(''),
      身份: z.string().prefault(''),
      与user的关系: z.string().prefault(''),
      自我认知: z.string().prefault(''),
      心声: z.string().prefault(''),
      好感度: z.coerce.number().transform(v => _.clamp(v, 0, 100)).prefault(0).describe(好感档说明),
      外貌描写: z.string().prefault(''),
      三围: z.string().prefault(''),
      衣着: 衣着Schema,
      身体状态: 身体状态Schema,
      位置: z.string().prefault(''),
      状态: 角色状态Schema,
      颜值评分: Num(0, 100, 0),
      变量冻结: Bool(false),
      冻结原因: z.string().prefault(''),
      冻结时间: z.string().prefault(''),
      最后互动摘要: z.string().prefault(''),
      最后已知位置: z.string().prefault(''),
      细节档案: 细节档案Schema,
      私密档案: 私密档案Schema,
      备注: z.string().prefault(''),
      授予者: z.object({
        是否授予者: Bool(false),
        在场: Presence,                    // 兼容 true/false 与旧字符串，统一为在场/隐去文本
        失控警示: Bool(false),               // 绮昼救赎线触发用
      }).optional(),
    }).passthrough().prefault({}).transform(c => ({
      ...c,
      羁绊标签: c.羁绊标签 === true,
      角色类型: c.羁绊标签 === true ? '羁绊角色' : '当前互动',
    }))
  ).prefault({}),

  // ============ 资产库 ============
  资产库: z.object({
    物品: z.record(
      z.string().describe('物品ID'),
      z.object({
        名称: z.string().prefault(''),
        类型: z.string().prefault('物品'),
        数量: PlainNum(1),
        品质: z.string().prefault(''),
        状态: z.string().prefault(''),
        归属: z.string().prefault(''),
        当前位置: z.string().prefault(''),
        标签: z.array(z.string()).prefault([]),
        描述: z.string().prefault(''),
      }).passthrough().prefault({})
    ).prefault({}),
    容器: z.object({
      随身: z.array(z.string()).prefault([]),
      仓储: z.record(z.string(), z.array(z.string()).prefault([])).prefault({}),
      放置: z.record(z.string(), z.array(z.string()).prefault([])).prefault({}),
    }).passthrough().prefault({}),
  }).passthrough().prefault({}),

  // ============ 居所 ============
  居所: z.record(
    z.string().describe('建筑名'),
    z.object({
      居所类型: z.string().prefault('公寓'),
      所在位置: z.string().prefault(''),
      居住状态: z.string().prefault(''),
      安全等级: z.string().prefault(''),
      房间: z.record(
        z.string().describe('房间名'),
        z.object({
          用途: z.string().prefault(''),
          状态: z.string().prefault(''),
        }).passthrough().prefault({})
      ).prefault({}),
      备注: z.string().prefault(''),
    }).passthrough().prefault({})
  ).prefault({}),

  // ============ 载具 ============
  载具: z.record(
    z.string().describe('载具名'),
    z.object({
      载具类型: z.string().prefault('汽车'),
      品牌型号: z.string().prefault(''),
      车牌: z.string().prefault(''),
      所在位置: z.string().prefault(''),
      移动状态: z.string().prefault('停放'),
      能源: z.string().prefault(''),
      耐久: z.string().prefault(''),
      外观: z.object({
        颜色: z.string().prefault(''),
        涂装特征: z.string().prefault(''),
      }).passthrough().prefault({}),
      内饰: z.object({
        风格: z.string().prefault(''),
        配置: z.string().prefault(''),
      }).passthrough().prefault({}),
      性能: z.object({
        极速: z.string().prefault(''),
        续航: z.string().prefault(''),
        载物: z.string().prefault(''),
      }).passthrough().prefault({}),
      当前乘员: z.string().prefault(''),
      购入来源: z.string().prefault(''),
      备注: z.string().prefault(''),
    }).passthrough().prefault({})
  ).prefault({}),

  // ============ 雷达系统 ============
  雷达系统: z.record(
    z.string().describe('信号编号'),
    z.object({
      目标类型: LooseString('角色'), // 角色 / 物品物体 / 载具 / 居所
      名称: z.string().prefault(''),
      信号强度: LooseString('中'),
      方位: z.string().prefault(''),
      描述: z.string().prefault(''),
      归属: z.string().prefault('未知'),
      备注: z.string().prefault(''),
    }).prefault({})
  ).prefault({}),

});

$(() => {
  registerMvuSchema(Schema);
  // 暴露 Schema 给状态栏/控制中枢做确定性 parse 回正。
  try { window.__kaidanMvuSchema = Schema; } catch (_) {}
  try { if (window.parent && window.parent !== window) window.parent.__kaidanMvuSchema = Schema; } catch (_) {}
});
