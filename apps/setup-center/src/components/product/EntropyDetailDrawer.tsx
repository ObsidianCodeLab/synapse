import React from "react";
import { HelpCircle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type EntropyType = "structural" | "semantic" | "behavioral" | "cognitive";

interface EntropyDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  entropyType: EntropyType | null;
}

interface SubMetric {
  label: string;
  value: number;
  /** "float" 保留 4 位小数，"int" 显示整数，"percent" 显示百分率，"count" 显示整数+处 */
  format: "float" | "int" | "percent" | "count";
  helpText: string;
}

const DETAIL_CONFIG: Record<EntropyType, { title: string; metrics: SubMetric[]; conclusion: string; description: string }> = {
  structural: {
    title: "结构熵详细报告",
    description: "以下为结构熵的详细分解指标，帮助定位代码结构层面的具体问题。",
    metrics: [
      {
        label: "整体结构熵", value: 0.175, format: "float",
        helpText: `整体结构熵就是"项目结构健康度总分"。它会综合看三件事：\n1）代码目录是否过于扎堆；\n2）是否经常跨模块直接依赖；\n3）是否出现调用方向反了（分层倒置）。\n分数越低越健康，分数越高说明结构风险越大。`,
      },
      {
        label: "目录结构熵", value: 0.321, format: "float",
        helpText: `目录结构熵就是看"代码是否都堆在少数目录里"。如果Java文件分布比较均匀，风险就低；如果大量文件集中在少数目录，说明目录结构失衡，后续维护和定位问题会更难。\n简单理解：越分散越健康，越扎堆风险越高。`,
      },
      {
        label: "跨领域违规", value: 12, format: "count",
        helpText: `跨领域违规就是"跨模块直接耦合"。简单说：一个业务模块里的核心代码，直接调用了另一个业务模块的代码，就记1处。\n例如：A模块的Service/Entity/Mapper/Repository/DAO直接依赖B模块的类，就属于跨领域违规。`,
      },
      {
        label: "分层倒置", value: 3, format: "count",
        helpText: `分层倒置就是"调用方向反了"。简单说：本来应该是上层调用下层，如果出现下层反过来去调用上层，就记1处。\n例如：数据层（DAO/Mapper）去调用服务层（Service)，或服务层去调用控制层（Controller），都属于分层倒置。`,
      },
    ],
    conclusion:
      "当前代码结构熵处于合理范围内，目录结构熵略高，建议关注跨模块依赖关系。跨领域违规数量较少，分层架构总体清晰，但仍有少量分层倒置现象，建议在后续迭代中逐步修复。",
  },
  semantic: {
    title: "语义熵详细报告",
    description: "以下为语义熵的详细分解指标，帮助定位命名与语义层面的具体问题。",
    metrics: [
      {
        label: "整体语义熵", value: 0.93, format: "float",
        helpText: `在不依赖NLP模型的前提下，用规则+静态词表度量命名不一致（名词同义并用、CRUD 动词混用、Controller/Service动词漂移、Entity与DTO/NO字段对齐）：\n检测规则：基于类名、方法名、字段名综合评估名词混乱、动词不一致、跨层命名漂移、DTO对齐偏差。`,
      },
      {
        label: "名词混乱度", value: 0.87, format: "float",
        helpText: `使用代码内静态同义词组（如user/member/account）。若某组内有至少2个词同时出现在不同类的简单类名中，则记为冲突并生成冲突类型synonym_noun。得分为min（1，冲突组数/同义词组总数）。\n检测规则：按同义词组检查同一概念是否出现多种命名。`,
      },
      {
        label: "动词混乱度", value: 0.91, format: "float",
        helpText: `使用静态CRUD分组（query/create/update/delete）及每组下的动词前缀集合。对全库方法名：若某组内出现至少2种不同动词前缀，则对该组计算归一化香农并累计，最后对组求平均。\n检测规则：统计CRUD语义组中动词前缀是否混用（如get/find/query）。`,
      },
      {
        label: "跨层漂移", value: 0.65, format: "float",
        helpText: `按类名识别controller/service等层，统计各层在CRUD组上使用的动词集合。比较controller与 service的Jaccard 相似度，差异累计为漂移分，并可能产生冲突类型layerdrift。\n检测规则：比较controller与service在CRUD动词上的一致性，差异越大漂移越高。`,
      },
      {
        label: "DTO 对齐率", value: 0.85, format: "percent",
        helpText: `按全限定类名关键字粗分Entity与DTONO/Request/\nResponse，通过简单名称匹配找候选对。用字段集合的交集比例估计对齐情况。若无实体或无DTO，则视为对齐率1.0\n检测规则：对匹配到的Entity与DTONO字段集合进行对齐比较，衡量字段语义一致性。`,
      },
    ],
    conclusion: "语义熵较高，命名规范存在较大改进空间。名词和动词混乱度均偏高，跨层漂移现象明显，DTO 对齐率有待提升，建议统一命名规范并逐步重构。",
  },
  behavioral: {
    title: "行为熵详细报告",
    description: "以下为行为熵的详细分解指标，帮助定位API行为层面的具体问题。",
    metrics: [
      {
        label: "整体行为熵", value: 0.242, format: "float",
        helpText: `基于Controller.java中带HTTP映射的方法，度量API契约、错误处理、参数校验、空值检查习惯、日志框架的不一致程度。会递归收集所有 *Controller.java。\n检测规则：针对ControllerAPI，综合评估返回契约、错误处理、参数校验、边界检查、日志习惯的一致性`,
      },
      {
        label: "API契约一致性", value: 0.82, format: "percent",
        helpText: `对返回类型分布做香农熵，并用log2（不同取值个数）归一化；同一类型的泛型视为同一模式，例如Result、Result<void>、Result<List<Foo>>均按Result统计。\n检测规则：统计API返回类型模式是否统一，混用越多越高。`,
      },
      {
        label: "参数校验覆盖率", value: 0.65, format: "percent",
        helpText: `仅统计POST/PUT/PATCH：无校验方法数除以需校验方法总数（无此类方法时为0）。\n检测规则：仅针对POST/PUT/PATCH，统计是否缺少@Valid/@Validated等校验。`,
      },
      {
        label: "错误处理一致性", value: 0.72, format: "percent",
        helpText: `仅在「显式具备错误处理形态」的API（try_catch或throws）上统计混用程度（归一化香农熵）。none（未见try-catch且未throws）不参与，不把「未显式处理」当作与try_catch、throws并列的类型。\n检测规则：方法级规则扫描；若过滤后不足2条或仅一种形态，该维度为0。`,
      },
      {
        label: "日志框架一致性", value: 0.88, format: "percent",
        helpText: `对类级日志框架分布做归一化香农熵（slf4j/log4j/jul）。\n检测规则：统计项目中日志框架使用是否统一（slf4j/log4j/jul）`,
      },
    ],
    conclusion: "行为熵处于较低水平，API契约一致性较好，参数校验覆盖率和错误处理基本规范，日志框架一致性表现良好，建议持续保持。",
  },
  cognitive: {
    title: "认知熵详细报告",
    description: "以下为认知熵的详细分解指标，帮助定位知识分布层面的具体问题。",
    metrics: [
      {
        label: "整体认知熵", value: 0.276, format: "float",
        helpText: `整体认知可以理解为"团队接手这套代码有多难"的总分。\n它由三部分组成：知识是否过度集中、是否过度依赖少数人、是否有很多孤儿文件；最后再乘一个"样本够不够"的置信度。分数越高，协作和交接风险越大。`,
      },
      {
        label: "知识集中度", value: 0.52, format: "float",
        helpText: `知识集中度就是看"代码是不是主要掌握在少数人手里"。\n如果很多文件都主要由同一个人维护，这个值就会变高，说明知识分布不均，团队风险更大。`,
      },
      {
        label: "BUS FACTOR 风险", value: 0.15, format: "float",
        helpText: `BusFactor风险就是看"关键人一旦不在，项目会不会明显受影响"。\n参与关键代码的人越少，BusFactor越低，风险越高；参与的人越多，风险越低。`,
      },
      {
        label: "孤儿文件风险", value: 0.31, format: "float",
        helpText: `孤儿文件风险就是看"只有一个人动过的文件"占比有多高。\n这类文件越多，越容易形成单点知识，后续维护和交接会更困难。`,
      },
      {
        label: "样本置信度", value: 0.73, format: "float",
        helpText: `样本置信度就是"这次评估结果有多可靠"。\n参与统计的文件越多，置信度越高；样本太少时会自动降权，避免偶然数据把结果放大。`,
      },
    ],
    conclusion: "认知熵表现良好，知识分布较均匀，BUS FACTOR 风险较低。孤儿文件比例和样本置信度在可控范围内，建议持续关注新入文件归属。",
  },
};

function formatValue(value: number, format: "float" | "int" | "percent" | "count"): string {
  if (format === "int") return String(Math.round(value));
  if (format === "percent") return (value * 100).toFixed(1) + "%";
  if (format === "count") return String(Math.round(value)) + "处";
  return value.toFixed(4);
}

export function EntropyDetailDrawer({ open, onClose, entropyType }: EntropyDetailDrawerProps) {
  if (!entropyType) return null;

  const config = DETAIL_CONFIG[entropyType];

  return (
    <Sheet open={open} onOpenChange={(val) => { if (!val) onClose(); }}>
      <SheetContent side="right" className="w-[520px] sm:max-w-[520px] p-0 flex flex-col gap-0 border-l border-border/80 bg-background">
        <SheetHeader className="px-6 py-4 border-b border-border/80 bg-muted/10">
          <SheetTitle className="text-base font-semibold text-foreground">{config.title}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 custom-scrollbar">
          <p className="text-sm text-muted-foreground">{config.description}</p>

          <div className="flex flex-col gap-4">
              {config.metrics.map((m, i) => (
                <div
                  key={m.label}
                  className="relative flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-shadow"
                >
                  {/* 右上角问号 */}
                  {m.helpText && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="absolute top-4 right-4 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <HelpCircle size={16} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="left" align="start" className="z-[1250] max-w-[420px] p-4 text-sm leading-relaxed text-wrap whitespace-pre-line">
                        {m.helpText}
                      </TooltipContent>
                    </Tooltip>
                  )}

                  {/* 指标名称 */}
                  <div className="flex items-center gap-3">
                    <div
                      className="flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold shrink-0"
                      style={{
                        backgroundColor:
                          i === 0 ? "rgba(245,158,11,0.15)" :
                          i === 1 ? "rgba(239,68,68,0.12)" :
                          i === 2 ? "rgba(16,185,129,0.12)" :
                          i === 3 ? "rgba(59,130,246,0.12)" :
                          "rgba(168,85,247,0.12)",
                        color:
                          i === 0 ? "#f59e0b" :
                          i === 1 ? "#ef4444" :
                          i === 2 ? "#10b981" :
                          i === 3 ? "#3b82f6" :
                          "#a855f7",
                      }}
                    >
                      {i + 1}
                    </div>
                    <span className="text-sm font-semibold text-foreground">{m.label}</span>
                  </div>

                  {/* 数值 */}
                  <span className="text-2xl font-bold text-foreground tabular-nums pl-10">
                    {formatValue(m.value, m.format)}
                  </span>
                </div>
              ))}
          </div>

          {/* 分析结论与建议 */}
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <h4 className="text-sm font-semibold text-foreground mb-3">分析结论与建议</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">{config.conclusion}</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
