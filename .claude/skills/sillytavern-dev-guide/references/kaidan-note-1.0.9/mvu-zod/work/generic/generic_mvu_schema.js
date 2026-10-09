// 通用都市套件 · 变量契约 v0.1.0-work
// 9 根：环境、user、世界演化、舆论新闻、角色档案、资产库、居所、载具、雷达系统。
// ============================================================

// [validate-strip-start] 校验脚本以此标记剥离 CDN import,注入本地 stub;生产运行时走 CDN。
let registerMvuSchema;
try {
  ({ registerMvuSchema } = await import('https://cdn.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js'));
} catch (error) {
  console.warn('[小手机] official mvu_zod helper import failed, fallback to testingcf mirror:', error);
  ({ registerMvuSchema } = await import('https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js'));
}
// [validate-strip-end]

const LooseString = (fallback = '') => z.preprocess(v => (v === undefined || v === null || v === '' ? fallback : String(v)), z.string()).prefault(fallback);
const Num = (min, max, fallback = 0) => z.coerce.number().transform(v => _.clamp(v, min, max)).prefault(fallback);
const PlainNum = (fallback = 0) => z.coerce.number().prefault(fallback);
const Bool = (fallback = false) => z.preprocess(
  v => (v === 'true' ? true : v === 'false' ? false : v),
  z.boolean(),
).prefault(fallback);

const 社会认知档 = LooseString('日常'); // 日常 / 私下议论 / 公开讨论 / 广为人知
const 新闻层级 = LooseString('都市媒体'); // 官方通稿 / 都市媒体 / 传闻帖 / 热搜 / 短视频 / 其他
const 好感档说明 = '0~19陌生 20~39熟稔 40~59亲近 60~79深交 80~100伴侣';

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
  性器深度: z.any().optional(),
  子宫填充度: z.any().optional(),
  上次内射时间: z.any().optional(),
  名器: z.any().optional(),
  名器活跃度: z.any().optional(),
  纹身: z.any().optional(),
  处女状态: z.any().optional(),
  怀孕状态: z.any().optional(),
}).prefault({});

const Schema = z.object({

  环境: z.object({
    日期: z.string().prefault(''),
    时间: z.string().prefault(''),
    经过天数: Num(0, Number.MAX_SAFE_INTEGER, 0),
    所在位置: z.object({
      国家: z.string().prefault(''),
      省份: z.string().prefault(''),
      城市: z.string().prefault(''),
      行政区: z.string().prefault(''),
      街区: z.string().prefault(''),
      具体地点: z.string().prefault(''),
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
        状态: z.string().prefault(''),
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

  舆论新闻: z.object({
    民意值: Num(-100, 100, 0),
    新闻流: z.record(
      z.string().describe('新闻id,如 N001'),
      z.object({
        标题: z.string().prefault(''),
        层级: 新闻层级,
        倾向: LooseString('中'),
        热度: Num(0, 100, 0),
        内容: z.string().prefault(''),
        时间: z.string().prefault(''),
        状态: z.string().prefault('发酵中'),
      }).prefault({})
    ).prefault({}),
    民间传闻名: z.record(
      z.string().describe('民间称呼'),
      z.object({
        指代: z.string().prefault(''),
        流行度: Num(0, 100, 0),
      }).prefault({})
    ).prefault({}),
  }).prefault({}),

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
    }).passthrough().prefault({}).transform(c => ({
      ...c,
      羁绊标签: c.羁绊标签 === true,
      角色类型: c.羁绊标签 === true ? '羁绊角色' : '当前互动',
    }))
  ).prefault({}),

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

  雷达系统: z.record(
    z.string().describe('信号编号'),
    z.object({
      目标类型: LooseString('角色'),
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
  try { window.__phMvuSchema = Schema; } catch (_) {}
  try { if (window.parent && window.parent !== window) window.parent.__phMvuSchema = Schema; } catch (_) {}
});
