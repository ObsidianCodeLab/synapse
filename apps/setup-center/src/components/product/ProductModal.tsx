import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { GitBranch, ChevronRight, Loader2, Plus, Trash2 } from 'lucide-react';
import {
  Product,
  Repository,
  DEFAULT_ICONS,
  displayIdPipeName,
  defaultProdBranchForAppModuleSelection,
  getRepoEffectiveSpaceVersion,
  isValidProductTag,
  isValidRepoBranchComposite,
  findRepositoryMissingTokenIndex,
  patchRepositoryRepoBranchFromModuleDetail,
  repositoriesToValidateTokenItems,
  sanitizeProductTagInput,
} from "./types";
import { RepoStandaloneContextFields } from "./RepoStandaloneContextFields";
import { isRepoContextReady, useRepoContextCascade, zcmRowsToOptions } from "./repoContextCascade";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { SearchableVirtualSelect, type SearchableOption } from "./SearchableVirtualSelect";
import { RepoBranchDerivedDisplay } from "./RepoBranchDerivedDisplay";
import {
  fetchRepoDetailByProdBranch,
  fetchIwhalecloudUserinfoSummary,
  fetchZcmProductList,
  repoDetailFetchCacheKey,
  validateRepoTokens,
  type RdRepoDetailRow,
  type RdZcmProductItem,
} from "@/api/rdUnifiedService";
import "./product-workbench.css";

/** 项目空间选项值：projectId|projectName，与展示一致 */
export function formatProjectSpaceOption(projectId: string | number, projectName: string): string {
  return `${String(projectId).trim()}|${String(projectName).trim()}`;
}

export function parseProjectIdFromSpaceValue(v: string): number | null {
  return parseCompositeLeadingId(v);
}

/** id|code 或 id|name 解析前段为数字 id（产品版本、模块、产品分支等 composite 值） */
export function parseCompositeLeadingId(v: string): number | null {
  const i = v.indexOf("|");
  if (i <= 0) return null;
  const n = Number(v.slice(0, i).trim());
  return Number.isFinite(n) ? n : null;
}

/** 单行：左侧功能名，右侧描述；存盘格式 name:desc|name:desc（仅竖线分隔多项） */
export type ProductFeatureRow = { title: string; description: string };

const emptyFeatureRow = (): ProductFeatureRow => ({ title: "", description: "" });

/** 功能名、描述中禁止的存盘分隔符 */
const stripFeatureForbiddenChars = (v: string) => v.replace(/\|/g, "");

/** Windows 文件名非法字符（控制字符 + \< > : " / \\ | ? *） */
const WINDOWS_FILENAME_INVALID_RE = /[<>:"/\\|?*\x00-\x1f]/;
const WINDOWS_FILENAME_INVALID_GLOBAL_RE = /[<>:"/\\|?*\x00-\x1f]/g;

/** 供产品名称作为路径片段时使用：移除非法字符 */
export function sanitizeProductNameForWindows(value: string): string {
  return value.replace(WINDOWS_FILENAME_INVALID_GLOBAL_RE, "");
}

export function productNameViolatesWindowsFileRules(value: string): boolean {
  return WINDOWS_FILENAME_INVALID_RE.test(value);
}

export function parseFeaturesFromStored(raw: string): ProductFeatureRow[] {
  const s = (raw ?? "").trim();
  if (!s) return [emptyFeatureRow()];
  const parts = s
    .split("|")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0) return [emptyFeatureRow()];
  return parts.map((part) => {
    const i = part.indexOf(":");
    if (i === -1) return { title: part, description: "" };
    return { title: part.slice(0, i).trim(), description: part.slice(i + 1).trim() };
  });
}

export function serializeFeatureRows(rows: ProductFeatureRow[]): string {
  return rows
    .map(({ title, description }) => {
      const a = title.trim();
      const b = description.trim();
      if (!a && !b) return "";
      return `${a}:${b}`;
    })
    .filter((x) => x.length > 0)
    .join("|");
}

function getFeatureRowsValidationError(
  rows: ProductFeatureRow[],
):
  | "workbench.products.modal.featuresRequired"
  | "workbench.products.modal.featuresRowPartial"
  | null {
  let hasComplete = false;
  for (const { title, description } of rows) {
    const a = title.trim();
    const b = description.trim();
    if (!a && !b) continue;
    if (!a || !b) return "workbench.products.modal.featuresRowPartial";
    hasComplete = true;
  }
  if (!hasComplete) return "workbench.products.modal.featuresRequired";
  return null;
}

export type ProductModalFinishValues = Partial<Product> & {
  /** 项目空间：projectId|projectName（与 space 一致，供研发统一服务） */
  spaceLabel?: string;
  /** 图标选项文案（供研发统一服务 prod_icon） */
  iconLabel?: string;
};

interface ProductModalProps {
  open: boolean;
  onCancel: () => void;
  onFinish: (values: ProductModalFinishValues) => void | Promise<void>;
  initialValues?: Product;
  /** 项目空间下拉选项（label/value 均为 projectId|projectName） */
  projectSpaces?: { label: string; value: string }[] | null;
  synapseApiBase?: string;
}

export function ProductModal({
  open,
  onCancel,
  onFinish,
  initialValues,
  projectSpaces: externalSpaces,
  synapseApiBase = "http://127.0.0.1:18900",
}: ProductModalProps) {
  const { t } = useTranslation();
  const [isEdit, setIsEdit] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);

  const [formState, setFormState] = useState<{
    name: string;
    icon: string;
    projectSpace: string;
    productVersion: string;
    productTag: string;
    description: string;
    featureRows: ProductFeatureRow[];
    repositories: Repository[];
  }>({
    name: "",
    icon: DEFAULT_ICONS[0].value,
    projectSpace: "",
    productVersion: "",
    productTag: "",
    description: "",
    featureRows: [emptyFeatureRow()],
    repositories: [],
  });

  const [projectSpaces, setProjectSpaces] = useState<{ label: string; value: string }[]>([]);
  const [zcmAllRows, setZcmAllRows] = useState<RdZcmProductItem[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [repoDetailByProdBranchVid, setRepoDetailByProdBranchVid] = useState<
    Record<string, RdRepoDetailRow[]>
  >({});
  const [repoDetailLoadingVid, setRepoDetailLoadingVid] = useState<Record<string, boolean>>({});
  const repoDetailFetchStartedRef = useRef<Set<string>>(new Set());
  const [expandedRepos, setExpandedRepos] = useState<string[]>([]);
  /** 研发云 userinfo.access_token，新建仓库时预填 repo.token（用户可改） */
  const [defaultRepoAccessToken, setDefaultRepoAccessToken] = useState("");

  const { getCascadeForRepo } = useRepoContextCascade(
    synapseApiBase,
    open && !isEdit,
    formState.repositories,
    formState.projectSpace,
    formState.productVersion,
  );

  const isProductInfoFilled = !!(
    formState.name &&
    formState.projectSpace &&
    formState.productVersion
  );

  /** 父组件异步传入项目列表时只更新选项，避免重复重置表单、清空已加载的产品版本 */
  useEffect(() => {
    if (!open) return;
    setProjectSpaces(Array.isArray(externalSpaces) ? externalSpaces : []);
  }, [open, externalSpaces]);

  /** 仅在打开弹窗或切换 新建/编辑 时初始化表单（勿依赖 externalSpaces，否则会与版本列表请求竞态） */
  useEffect(() => {
    if (!open) return;

    if (initialValues) {
      setFormState({
        name: initialValues.name || "",
        icon: initialValues.icon || DEFAULT_ICONS[0].value,
        projectSpace: initialValues.space ?? "",
        productVersion: initialValues.version ?? "",
        productTag: initialValues.module ?? "",
        description: initialValues.description || "",
        featureRows: parseFeaturesFromStored(initialValues.features ?? ""),
        repositories: initialValues.repositories || [],
      });
      setIsEdit(true);
    } else {
      setFormState({
        name: "",
        icon: DEFAULT_ICONS[0].value,
        projectSpace: "",
        productVersion: "",
        productTag: "",
        description: "",
        featureRows: [emptyFeatureRow()],
        repositories: [],
      });
      setIsEdit(false);
      setDefaultRepoAccessToken("");
    }
  }, [open, initialValues]);

  useEffect(() => {
    if (!open || initialValues) return;
    let cancelled = false;
    void (async () => {
      try {
        const summary = await fetchIwhalecloudUserinfoSummary(synapseApiBase);
        if (!cancelled) {
          setDefaultRepoAccessToken((summary.access_token || "").trim());
        }
      } catch {
        if (!cancelled) setDefaultRepoAccessToken("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, initialValues, synapseApiBase]);

  /** 选择项目空间后再拉取产品版本全量列表，避免与弹窗初始化竞态导致列表被清空 */
  useEffect(() => {
    if (!open || isEdit) return;
    const pid = parseProjectIdFromSpaceValue(formState.projectSpace);
    if (pid == null) {
      setZcmAllRows([]);
      setVersionsLoading(false);
      return;
    }
    let cancelled = false;
    setVersionsLoading(true);
    fetchZcmProductList(synapseApiBase)
      .then((rows) => {
        if (cancelled) return;
        setZcmAllRows(rows);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error(e);
        setZcmAllRows([]);
        toast.error(t("workbench.products.modal.versionLoadFailed"));
      })
      .finally(() => {
        if (!cancelled) setVersionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, isEdit, formState.projectSpace, synapseApiBase, t]);

  const productVersionOptions = useMemo(() => zcmRowsToOptions(zcmAllRows), [zcmAllRows]);

  useEffect(() => {
    if (!open) {
      setRepoDetailByProdBranchVid({});
      setRepoDetailLoadingVid({});
      repoDetailFetchStartedRef.current = new Set();
    }
  }, [open]);

  /** 按各仓库所选产品分支版本 ID 拉取仓库分支明细（repositoryId|destBranchName）与 repoUrl */
  useEffect(() => {
    if (!open || isEdit) return;

    for (const repo of formState.repositories) {
      const { space } = getRepoEffectiveSpaceVersion(
        repo,
        formState.projectSpace,
        formState.productVersion,
      );
      const projectId = parseProjectIdFromSpaceValue(space);
      if (projectId == null) continue;

      const key = repoDetailFetchCacheKey(repo.prodBranch ?? "", repo.repoModule ?? "");
      if (key == null || repoDetailFetchStartedRef.current.has(key)) continue;
      const sep = key.indexOf("|");
      const vid = Number(key.slice(0, sep));
      const moduleId = Number(key.slice(sep + 1));
      if (!Number.isFinite(vid) || !Number.isFinite(moduleId)) continue;
      repoDetailFetchStartedRef.current.add(key);
      setRepoDetailLoadingVid((m) => ({ ...m, [key]: true }));
      fetchRepoDetailByProdBranch(synapseApiBase, vid, projectId, moduleId)
        .then((list) => {
          setRepoDetailByProdBranchVid((prev) => ({ ...prev, [key]: list }));
        })
        .catch((e) => {
          console.error(e);
          repoDetailFetchStartedRef.current.delete(key);
          setRepoDetailByProdBranchVid((prev) => ({ ...prev, [key]: [] }));
          toast.error(t("workbench.products.modal.repoBranchDetailLoadFailed"));
        })
        .finally(() => {
          setRepoDetailLoadingVid((m) => ({ ...m, [key]: false }));
        });
    }
  }, [open, isEdit, formState.repositories, formState.projectSpace, formState.productVersion, synapseApiBase, t]);

  /** 仓库明细返回后按 moduleName 自动填充仓库分支与 URL */
  useEffect(() => {
    if (!open || isEdit) return;
    setFormState((prev) => {
      let changed = false;
      const newRepos = prev.repositories.map((repo) => {
        const key = repoDetailFetchCacheKey(repo.prodBranch ?? "", repo.repoModule ?? "");
        if (key == null) return repo;
        if (repoDetailLoadingVid[key]) return repo;
        const list = repoDetailByProdBranchVid[key];
        if (!list?.length) return repo;
        const next = patchRepositoryRepoBranchFromModuleDetail(repo, list);
        if (next !== repo) changed = true;
        return next;
      });
      return changed ? { ...prev, repositories: newRepos } : prev;
    });
  }, [open, isEdit, repoDetailByProdBranchVid, repoDetailLoadingVid, formState.repositories]);

  const handleProjectSpaceChange = (v: string) => {
    setFormState((prev) => ({
      ...prev,
      projectSpace: v,
      productVersion: "",
      productTag: "",
      repositories: [],
    }));
  };

  const handleProductVersionChange = (v: string) => {
    setFormState((prev) => ({
      ...prev,
      productVersion: v,
      repositories: [],
    }));
  };

  const handleRepoModuleChange = (index: number, v: string) => {
    const repo = formState.repositories[index];
    const cascade = getCascadeForRepo(repo);
    const defaultPb = defaultProdBranchForAppModuleSelection(v, cascade.moduleRows);
    setFormState((prev) => {
      const newRepos = prev.repositories.map((r, i) =>
        i === index ? { ...r, repoModule: v, prodBranch: defaultPb, branch: "", url: "" } : r,
      );
      return { ...prev, repositories: newRepos };
    });
  };

  const handleRepoNonAssociatedChange = (index: number, checked: boolean) => {
    setFormState((prev) => ({
      ...prev,
      repositories: prev.repositories.map((r, i) =>
        i !== index
          ? r
          : {
              ...r,
              nonAssociatedProductRepo: checked,
              repoProjectSpace: checked ? "" : undefined,
              repoProductVersion: checked ? "" : undefined,
              repoModule: "",
              prodBranch: "",
              branch: "",
              url: "",
            },
      ),
    }));
  };

  const handleRepoProjectSpaceChange = (index: number, v: string) => {
    setFormState((prev) => ({
      ...prev,
      repositories: prev.repositories.map((r, i) =>
        i !== index
          ? r
          : {
              ...r,
              repoProjectSpace: v,
              repoProductVersion: "",
              repoModule: "",
              prodBranch: "",
              branch: "",
              url: "",
            },
      ),
    }));
  };

  const handleRepoProductVersionChange = (index: number, v: string) => {
    setFormState((prev) => ({
      ...prev,
      repositories: prev.repositories.map((r, i) =>
        i !== index
          ? r
          : {
              ...r,
              repoProductVersion: v,
              repoModule: "",
              prodBranch: "",
              branch: "",
              url: "",
            },
      ),
    }));
  };

  const handleProdBranchChange = (index: number, v: string) => {
    setFormState((prev) => {
      const newRepos = prev.repositories.map((r, i) =>
        i === index ? { ...r, prodBranch: v, branch: "", url: "" } : r,
      );
      return { ...prev, repositories: newRepos };
    });
  };

  const patchRepositoryFields = (index: number, patch: Partial<Repository>) => {
    setFormState((prev) => {
      const newRepos = prev.repositories.map((r) => ({ ...r }));
      if (patch.isMain === true) {
        for (let i = 0; i < newRepos.length; i++) {
          newRepos[i] = { ...newRepos[i], isMain: i === index };
        }
      } else {
        newRepos[index] = { ...newRepos[index], ...patch };
      }
      return { ...prev, repositories: newRepos };
    });
  };

  const updateRepo = (index: number, field: keyof Repository, value: any) => {
    const newRepos = [...formState.repositories];
    if (field === "isMain" && value === true) {
      newRepos.forEach((r) => (r.isMain = false));
    }
    newRepos[index] = { ...newRepos[index], [field]: value };
    setFormState((prev) => ({ ...prev, repositories: newRepos }));
  };

  const removeRepo = (index: number) => {
    const newRepos = formState.repositories.filter((_, i) => i !== index);
    setFormState((prev) => ({ ...prev, repositories: newRepos }));
  };

  const addRepo = () => {
    const newRepos = [
      ...formState.repositories,
      {
        branch: "",
        prodBranch: "",
        repoModule: "",
        isMain: formState.repositories.length === 0,
        url: "",
        purpose: "",
        token: defaultRepoAccessToken || "",
        codePath: "",
        wireAnalysisState: "new" as const,
      },
    ];
    setFormState((prev) => ({ ...prev, repositories: newRepos }));
    setExpandedRepos((prev) => [...prev, String(newRepos.length - 1)]);
  };

  const toggleRepoExpand = (idx: string) => {
    setExpandedRepos((prev) => (prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]));
  };

  const handleSubmit = async () => {
    if (!formState.name) {
      toast.error(t("workbench.products.modal.nameRequired") || "请输入产品名称");
      return;
    }
    if (!isEdit && productNameViolatesWindowsFileRules(formState.name)) {
      toast.error(t("workbench.products.modal.nameWindowsInvalid"));
      return;
    }
    if (!isEdit && (!formState.projectSpace || !formState.productVersion)) {
      toast.error(t("workbench.products.modal.spaceVersionRequired"));
      return;
    }
    if (!isEdit) {
      const tag = formState.productTag.trim();
      if (!isValidProductTag(tag)) {
        toast.error(t("workbench.products.modal.productTagInvalid"));
        return;
      }
    }

    const featureErrKey = getFeatureRowsValidationError(formState.featureRows);
    if (featureErrKey) {
      toast.error(t(featureErrKey));
      return;
    }

    if (!isEdit) {
      const mainRepos = formState.repositories.filter((r) => r.isMain);
      if (formState.repositories.length > 0) {
        if (mainRepos.length === 0) {
          toast.error(t("workbench.products.modal.mainRepoErrorNone") || "必须且只能有一个主分支仓库");
          return;
        }
        if (mainRepos.length > 1) {
          toast.error(t("workbench.products.modal.mainRepoErrorMany") || "只能有一个主分支仓库");
          return;
        }
        const badStandalone = formState.repositories.some((r) => {
          if (!r.nonAssociatedProductRepo) return false;
          const space = r.repoProjectSpace?.trim() ?? "";
          const version = r.repoProductVersion?.trim() ?? "";
          return !isRepoContextReady(space, version);
        });
        if (badStandalone) {
          toast.error(t("workbench.products.modal.repoStandaloneSpaceVersionRequired"));
          return;
        }
        const badRepoModule = formState.repositories.some((r) => {
          const rm = r.repoModule?.trim() ?? "";
          return !rm || parseCompositeLeadingId(rm) == null;
        });
        if (badRepoModule) {
          toast.error(t("workbench.products.modal.repoModuleRequired"));
          return;
        }
        const badPb = formState.repositories.some((r) => {
          const pb = r.prodBranch?.trim() ?? "";
          return !pb || parseCompositeLeadingId(pb) == null;
        });
        if (badPb) {
          toast.error(t("workbench.products.modal.prodBranchRequired"));
          return;
        }
        const badRepoBranch = formState.repositories.some((r) => !isValidRepoBranchComposite(r.branch));
        if (badRepoBranch) {
          toast.error(t("workbench.products.modal.repoBranchCompositeRequired"));
          return;
        }
        const missingTokenIdx = findRepositoryMissingTokenIndex(formState.repositories);
        if (missingTokenIdx >= 0) {
          toast.error(t("workbench.products.modal.repoTokenRequired"));
          return;
        }
        setSubmitBusy(true);
        try {
          const results = await validateRepoTokens(
            synapseApiBase,
            repositoriesToValidateTokenItems(formState.repositories),
          );
          const failIdx = results.findIndex((r) => !r.valid);
          if (failIdx >= 0) {
            toast.error(
              t("workbench.products.modal.repoTokenInvalid", {
                n: failIdx + 1,
                detail: results[failIdx]?.error || "",
              }),
            );
            return;
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          toast.error(t("workbench.products.modal.repoTokenValidateFailed", { message: msg }));
          return;
        } finally {
          setSubmitBusy(false);
        }
      }
    }

    const featuresStr = serializeFeatureRows(formState.featureRows);
    const spaceLabel = formState.projectSpace || "";
    const iconLabel = DEFAULT_ICONS.find((i) => i.value === formState.icon)?.label || "";

    const reposOut = formState.repositories;

    await Promise.resolve(
      onFinish({
        name: formState.name,
        icon: formState.icon,
        version: formState.productVersion,
        /** 产品标签 → 研发统一服务 `module` */
        module: formState.productTag.trim(),
        description: formState.description,
        features: featuresStr,
        repositories: reposOut,
        space: spaceLabel,
        spaceLabel,
        iconLabel,
      }),
    );
  };

  const projectSpaceDisabled = !isEdit && projectSpaces.length === 0;
  const versionSelectDisabled =
    isEdit ||
    !formState.projectSpace ||
    parseProjectIdFromSpaceValue(formState.projectSpace) == null;

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) onCancel(); }}>
      <DialogContent className="sm:max-w-[800px] p-0 flex flex-col max-h-[85vh] border-border/80 shadow-lg bg-background/95 backdrop-blur">
        <DialogHeader className="px-6 py-4 border-b border-border/60 bg-muted/10">
          <DialogTitle className="text-lg">
            {isEdit ? t("workbench.products.modal.editTitle") : t("workbench.products.modal.createTitle")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 custom-scrollbar space-y-6">
          {/* Row 1: Name, Icon */}
          <div className="grid grid-cols-12 gap-5">
            <div className="col-span-8 space-y-2">
              <Label>{t("workbench.products.modal.name")} <span className="text-destructive">*</span></Label>
              <Input
                placeholder={t("workbench.products.modal.namePlaceholder")}
                maxLength={64}
                disabled={isEdit}
                value={formState.name}
                onChange={(e) =>
                  setFormState((prev) => ({
                    ...prev,
                    name: sanitizeProductNameForWindows(e.target.value),
                  }))
                }
              />
              {!isEdit && (
                <p className="text-xs text-muted-foreground">{t("workbench.products.modal.nameWindowsHint")}</p>
              )}
            </div>
            <div className="col-span-4 space-y-2">
              <Label>{t("workbench.products.modal.icon")} <span className="text-destructive">*</span></Label>
              <Select value={formState.icon} onValueChange={(v) => setFormState((prev) => ({ ...prev, icon: v }))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("workbench.products.modal.iconPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {DEFAULT_ICONS.map((icon) => (
                    <SelectItem key={icon.label} value={icon.value}>
                      <div className="flex items-center gap-2">
                        <img src={icon.value} alt={icon.label} className="w-5 h-5 rounded object-contain bg-primary/10" />
                        <span>{icon.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 2: Space + Version + Product tag */}
          <div className="grid grid-cols-12 gap-5">
            <div className="col-span-12 space-y-2 sm:col-span-4">
              <Label>
                {t("workbench.products.modal.projectSpace")}{" "}
                {!isEdit && <span className="text-destructive">*</span>}
              </Label>
              {isEdit ? (
                <Input
                  readOnly
                  tabIndex={-1}
                  value={formState.projectSpace}
                  className="bg-muted/50 text-foreground cursor-default"
                />
              ) : (
                <SearchableVirtualSelect
                  value={formState.projectSpace}
                  onValueChange={handleProjectSpaceChange}
                  options={projectSpaces}
                  placeholder={t("workbench.products.modal.projectSpacePlaceholder")}
                  searchPlaceholder={t("workbench.products.modal.searchFilterPlaceholder")}
                  emptyText={t("workbench.products.modal.projectSpaceEmpty")}
                  disabled={projectSpaceDisabled}
                />
              )}
            </div>
            <div className="col-span-12 space-y-2 sm:col-span-4">
              <Label>
                {t("workbench.products.modal.productVersion")}{" "}
                {!isEdit && <span className="text-destructive">*</span>}
              </Label>
              {isEdit ? (
                <Input
                  readOnly
                  tabIndex={-1}
                  value={formState.productVersion}
                  className="bg-muted/50 text-foreground cursor-default"
                />
              ) : (
                <SearchableVirtualSelect
                  value={formState.productVersion}
                  onValueChange={handleProductVersionChange}
                  options={productVersionOptions}
                  placeholder={t("workbench.products.modal.productVersionPlaceholder")}
                  searchPlaceholder={t("workbench.products.modal.searchFilterPlaceholder")}
                  emptyText={
                    versionSelectDisabled
                      ? t("workbench.products.modal.selectProjectFirst")
                      : versionsLoading
                        ? ""
                        : t("workbench.products.modal.versionListEmpty")
                  }
                  disabled={versionSelectDisabled}
                  isLoading={versionsLoading}
                />
              )}
            </div>
            <div className="col-span-12 space-y-2 sm:col-span-4">
              <Label>
                {t("workbench.products.modal.productTag")}{" "}
                {!isEdit && <span className="text-destructive">*</span>}
              </Label>
              {isEdit ? (
                <Input
                  readOnly
                  tabIndex={-1}
                  value={formState.productTag}
                  className="bg-muted/50 text-foreground cursor-default"
                />
              ) : (
                <>
                  <Input
                    value={formState.productTag}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        productTag: sanitizeProductTagInput(e.target.value),
                      }))
                    }
                    placeholder={t("workbench.products.modal.productTagPlaceholder")}
                    maxLength={32}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <p className="text-xs text-muted-foreground m-0">{t("workbench.products.modal.productTagHint")}</p>
                </>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("workbench.products.modal.description")} <span className="text-destructive">*</span></Label>
            <Textarea
              rows={2}
              placeholder={t("workbench.products.modal.descriptionPlaceholder")}
              value={formState.description}
              onChange={(e) => setFormState((prev) => ({ ...prev, description: e.target.value }))}
              className="resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-baseline justify-between gap-2">
              <span>
                {t("workbench.products.modal.features")} <span className="text-destructive">*</span>
              </span>
              <span className="text-[11px] font-normal text-muted-foreground text-right leading-snug max-w-[min(100%,22rem)]">
                {t("workbench.products.modal.featuresExtra")}
              </span>
            </Label>
            <ProductFeatureRowsEditor
              rows={formState.featureRows}
              onChange={(featureRows) => setFormState((prev) => ({ ...prev, featureRows }))}
              labels={{
                nameCol: t("workbench.products.modal.featureNameShort"),
                descCol: t("workbench.products.modal.featureDescShort"),
                namePh: t("workbench.products.modal.featureNamePlaceholder"),
                descPh: t("workbench.products.modal.featureDescPlaceholder"),
                addRow: t("workbench.products.modal.addFeatureRow"),
                removeRowAria: t("workbench.products.modal.removeFeatureRowAria"),
              }}
            />
          </div>

          <div className="pt-4">
            <div className="flex items-center gap-2 mb-3">
              <GitBranch size={15} className="text-primary" />
              <span className="text-sm font-semibold">{t("workbench.products.modal.repoSection")}</span>
            </div>
            <div className="h-px bg-border/60 w-full mb-4" />

            {isEdit ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">{t("workbench.products.modal.repoReadOnlyHint")}</p>
                {formState.repositories.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border/80 bg-muted/10 px-4 py-6 text-center text-sm text-muted-foreground">
                    {t("workbench.products.modal.repoReadOnlyEmpty")}
                  </div>
                ) : (
                  formState.repositories.map((repo, index) => (
                    <div
                      key={index}
                      className="rounded-lg border border-border/80 bg-muted/10 px-4 py-3 text-sm space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground">
                          {t("workbench.products.modal.repoConfigN", { n: index + 1 })}
                        </span>
                        {repo.isMain && (
                          <Badge variant="secondary" className="font-normal py-0 h-5 px-1.5 bg-blue-500/10 text-blue-700 dark:text-blue-400">
                            {t("workbench.products.modal.mainRepo")}
                          </Badge>
                        )}
                      </div>
                      <div className="grid gap-1.5 text-xs text-muted-foreground">
                        <div>
                          <span className="text-foreground/80">{t("workbench.products.modal.appModule")}: </span>
                          {repo.repoModule?.trim() ? displayIdPipeName(repo.repoModule) : "—"}
                        </div>
                        <div>
                          <span className="text-foreground/80">{t("workbench.products.modal.prodBranch")}: </span>
                          {repo.prodBranch?.trim() || "—"}
                        </div>
                        <div>
                          <span className="text-foreground/80">{t("workbench.products.modal.branch")}: </span>
                          {repo.branch || "—"}
                        </div>
                        <div className="break-all">
                          <span className="text-foreground/80">{t("workbench.products.modal.url")}: </span>
                          {repo.url || "—"}
                        </div>
                        <div>
                          <span className="text-foreground/80">{t("workbench.products.modal.purpose")}: </span>
                          {repo.purpose || "—"}
                        </div>
                        <div className="break-all">
                          <span className="text-foreground/80">{t("workbench.products.modal.codePath")}: </span>
                          {repo.codePath?.trim() || "—"}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : !isProductInfoFilled ? (
              <div className="flex items-center justify-center p-8 rounded-lg border border-dashed border-border/80 bg-muted/20 text-sm text-muted-foreground">
                {t("workbench.products.modal.fillProductFirst")}
              </div>
            ) : (
              <div className="space-y-3">
                {formState.repositories.map((repo, index) => {
                  const idxStr = String(index);
                  const isExpanded = expandedRepos.includes(idxStr);
                  const cascade = getCascadeForRepo(repo);
                  const { space: effectiveSpace, version: effectiveVersion } = getRepoEffectiveSpaceVersion(
                    repo,
                    formState.projectSpace,
                    formState.productVersion,
                  );
                  const repoModuleSelectDisabled =
                    !isRepoContextReady(effectiveSpace, effectiveVersion);
                  const pbVidKey =
                    repoDetailFetchCacheKey(repo.prodBranch ?? "", repo.repoModule ?? "") ?? "";
                  const repoBranchLoading =
                    !isEdit &&
                    pbVidKey !== "" &&
                    !!(repo.repoModule?.trim()) &&
                    !!repoDetailLoadingVid[pbVidKey];
                  const standaloneSpace = repo.repoProjectSpace ?? "";
                  const standaloneVersion = repo.repoProductVersion ?? "";

                  return (
                    <div key={index} className="rounded-lg border border-border/80 bg-muted/10 overflow-hidden transition-all">
                      <div
                        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30"
                        onClick={() => toggleRepoExpand(idxStr)}
                      >
                        <div className="flex items-center gap-2">
                          <ChevronRight size={14} className={`text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                          <span className="text-sm font-medium text-foreground">
                            {t("workbench.products.modal.repoConfigN", { n: index + 1 })}
                          </span>
                          {repo.isMain && (
                            <Badge variant="secondary" className="ml-2 font-normal py-0 h-5 px-1.5 bg-blue-500/10 text-blue-700 dark:text-blue-400">
                              {t("workbench.products.modal.mainRepo")}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate max-w-[280px]">
                          {repo.prodBranch?.trim()
                            ? `${repo.prodBranch.trim()} · ${repo.branch || "—"}`
                            : repo.branch || "—"}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="p-4 pt-1 border-t border-border/50 grid grid-cols-12 gap-4 bg-background/50">
                          <RepoStandaloneContextFields
                            switchId={`repo-non-associated-${index}`}
                            nonAssociated={!!repo.nonAssociatedProductRepo}
                            onNonAssociatedChange={(checked) => handleRepoNonAssociatedChange(index, checked)}
                            projectSpace={standaloneSpace}
                            onProjectSpaceChange={(v) => handleRepoProjectSpaceChange(index, v)}
                            productVersion={standaloneVersion}
                            onProductVersionChange={(v) => handleRepoProductVersionChange(index, v)}
                            projectSpaces={projectSpaces}
                            versionOptions={cascade.versionOptions}
                            versionsLoading={cascade.versionsLoading}
                          />
                          <div className="col-span-12 space-y-2">
                            <Label className="text-xs">{t("workbench.products.modal.appModule")} *</Label>
                            <SearchableVirtualSelect
                              value={repo.repoModule ?? ""}
                              onValueChange={(v) => handleRepoModuleChange(index, v)}
                              options={cascade.moduleOptions}
                              placeholder={t("workbench.products.modal.appModulePlaceholder")}
                              searchPlaceholder={t("workbench.products.modal.searchFilterPlaceholder")}
                              emptyText={
                                repoModuleSelectDisabled
                                  ? repo.nonAssociatedProductRepo
                                    ? t("workbench.products.modal.repoStandaloneSelectSpaceVersionFirst")
                                    : t("workbench.products.modal.selectVersionFirst")
                                  : cascade.modulesLoading
                                    ? ""
                                    : t("workbench.products.modal.moduleListEmpty")
                              }
                              disabled={repoModuleSelectDisabled}
                              isLoading={cascade.modulesLoading}
                            />
                          </div>
                          <RepoBranchDerivedDisplay
                            prodBranch={repo.prodBranch}
                            branch={repo.branch}
                            repoModule={repo.repoModule}
                            loading={repoBranchLoading}
                            prodBranchOptions={cascade.prodBranchOptions}
                            prodBranchLoading={cascade.prodBranchLoading}
                            prodBranchDisabled={repoModuleSelectDisabled}
                            onProdBranchChange={(v) => handleProdBranchChange(index, v)}
                          />
                          <div className="col-span-12 space-y-2">
                            <Label className="text-xs">{t("workbench.products.modal.url")} *</Label>
                            <Input
                              readOnly
                              tabIndex={-1}
                              className="h-8 text-xs bg-muted/50 cursor-default"
                              value={repo.url}
                              placeholder={t("workbench.products.modal.urlReadonlyPlaceholder")}
                            />
                            <p className="text-[11px] text-muted-foreground m-0">
                              {t("workbench.products.modal.urlReadonlyHint")}
                            </p>
                          </div>
                          <div className="col-span-12 space-y-2">
                            <Label className="text-xs">{t("workbench.products.modal.codePath")}</Label>
                            <Input
                              className="h-8 text-xs"
                              value={repo.codePath ?? ""}
                              onChange={(e) => updateRepo(index, "codePath", e.target.value)}
                              placeholder={t("workbench.products.modal.codePathPlaceholder")}
                            />
                            <p className="text-[11px] text-muted-foreground m-0">
                              {t("workbench.products.modal.codePathHint")}
                            </p>
                          </div>
                          <div className="col-span-6 space-y-2">
                            <Label className="text-xs">{t("workbench.products.modal.purpose")} *</Label>
                            <Input className="h-8 text-xs" value={repo.purpose} onChange={(e) => updateRepo(index, "purpose", e.target.value)} placeholder={t("workbench.products.modal.purposePlaceholder")} />
                          </div>
                          <div className="col-span-6 space-y-2">
                            <Label className="text-xs">
                              {t("workbench.products.modal.token")} <span className="text-destructive">*</span>
                            </Label>
                            <Input className="h-8 text-xs" type="password" value={repo.token || ""} onChange={(e) => updateRepo(index, "token", e.target.value)} placeholder={t("workbench.products.modal.tokenPlaceholder")} disabled={submitBusy} />
                          </div>
                          <div className="col-span-12 flex items-center justify-between pt-2">
                            <div className="flex items-center gap-2">
                              <Switch checked={repo.isMain} onCheckedChange={(c) => updateRepo(index, "isMain", c)} id={`repo-main-${index}`} />
                              <Label htmlFor={`repo-main-${index}`} className="text-xs cursor-pointer">{t("workbench.products.modal.mainRepo")}</Label>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => removeRepo(index)} className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10">
                              <Trash2 size={13} className="mr-1.5" />
                              {t("workbench.products.modal.removeRepo")}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                <Button
                  variant="outline"
                  className="w-full h-10 border-dashed bg-transparent hover:bg-muted/30"
                  onClick={addRepo}
                >
                  <GitBranch size={14} className="mr-2" />
                  {t("workbench.products.modal.addRepo")}
                </Button>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border/60 bg-muted/10">
          <Button variant="outline" onClick={onCancel} disabled={submitBusy}>{t("workbench.products.modal.cancel")}</Button>
          <Button onClick={() => void handleSubmit()} disabled={submitBusy}>
            {submitBusy ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
            {submitBusy
              ? t("workbench.products.modal.repoTokenValidating")
              : isEdit
                ? t("workbench.products.modal.update")
                : t("workbench.products.modal.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ProductFeatureRowsEditorLabels {
  nameCol: string;
  descCol: string;
  namePh: string;
  descPh: string;
  addRow: string;
  removeRowAria: string;
}

function ProductFeatureRowsEditor({
  rows,
  onChange,
  labels,
}: {
  rows: ProductFeatureRow[];
  onChange: (rows: ProductFeatureRow[]) => void;
  labels: ProductFeatureRowsEditorLabels;
}) {
  const patchRow = (index: number, patch: Partial<ProductFeatureRow>) => {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const removeRow = (index: number) => {
    const next = rows.filter((_, i) => i !== index);
    onChange(next.length > 0 ? next : [emptyFeatureRow()]);
  };

  const addRow = () => {
    onChange([...rows, emptyFeatureRow()]);
  };

  return (
    <div className="rounded-xl border border-border/80 bg-muted/5 overflow-hidden shadow-sm">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_auto] gap-2 px-3 py-2 border-b border-border/60 bg-muted/20 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span className="pl-1 truncate">
          {labels.nameCol} <span className="text-destructive normal-case">*</span>
        </span>
        <span className="truncate">
          {labels.descCol} <span className="text-destructive normal-case">*</span>
        </span>
        <span className="w-9 shrink-0" aria-hidden />
      </div>
      <div className="divide-y divide-border/50">
        {rows.map((row, index) => (
          <div
            key={index}
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_auto] gap-2 px-3 py-2.5 items-center bg-background/40 hover:bg-muted/15 transition-colors"
          >
            <Input
              value={row.title}
              onChange={(e) => patchRow(index, { title: stripFeatureForbiddenChars(e.target.value) })}
              placeholder={labels.namePh}
              className="h-9 text-sm border-border/70 bg-background/80"
              maxLength={128}
            />
            <Input
              value={row.description}
              onChange={(e) =>
                patchRow(index, { description: stripFeatureForbiddenChars(e.target.value) })
              }
              placeholder={labels.descPh}
              className="h-9 text-sm border-border/70 bg-background/80"
              maxLength={256}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              onClick={() => removeRow(index)}
              aria-label={labels.removeRowAria}
            >
              <Trash2 size={15} />
            </Button>
          </div>
        ))}
      </div>
      <div className="p-2 border-t border-border/50 bg-muted/10">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full h-9 border-dashed border-border/80 bg-transparent hover:bg-muted/40 text-muted-foreground hover:text-foreground"
          onClick={addRow}
        >
          <Plus size={15} className="mr-2 opacity-80" />
          {labels.addRow}
        </Button>
      </div>
    </div>
  );
}
