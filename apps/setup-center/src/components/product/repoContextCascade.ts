import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  fetchModuleNameList,
  fetchProductBranchList,
  fetchZcmProductList,
  type RdModuleNameItem,
  type RdZcmProductItem,
} from "@/api/rdUnifiedService";
import type { SearchableOption } from "./SearchableVirtualSelect";
import { parseCompositeLeadingId, parseProjectIdFromSpaceValue } from "./ProductModal";
import { getRepoEffectiveSpaceVersion, prodBranchRowsToOptions, type Repository } from "./types";

function zcmRowToOption(row: RdZcmProductItem): SearchableOption {
  const id = row.productVersionId ?? "";
  const code = (row.productVersionCode ?? "").trim() || String(id);
  const value = `${id}|${code}`;
  return { label: value, value };
}

export function zcmRowsToOptions(rows: RdZcmProductItem[]): SearchableOption[] {
  return rows.map(zcmRowToOption);
}

export function moduleRowToOption(row: RdModuleNameItem): SearchableOption {
  const id = row.productModuleId ?? "";
  const name = (row.moduleChName ?? "").trim() || String(id);
  const value = `${id}|${name}`;
  return { label: value, value };
}

export function moduleKeyFromSpaceVersion(space: string, version: string): string {
  return `${space}\0${version}`;
}

export type RepoCascadeSnapshot = {
  versionOptions: SearchableOption[];
  moduleOptions: SearchableOption[];
  moduleRows: RdModuleNameItem[];
  prodBranchOptions: SearchableOption[];
  versionsLoading: boolean;
  modulesLoading: boolean;
  prodBranchLoading: boolean;
};

const EMPTY_CASCADE: RepoCascadeSnapshot = {
  versionOptions: [],
  moduleOptions: [],
  moduleRows: [],
  prodBranchOptions: [],
  versionsLoading: false,
  modulesLoading: false,
  prodBranchLoading: false,
};

type VersionCacheEntry = { options: SearchableOption[]; loading: boolean };
type ModuleCacheEntry = { options: SearchableOption[]; rows: RdModuleNameItem[]; loading: boolean };
type ProdBranchCacheEntry = { options: SearchableOption[]; loading: boolean };

/** 按仓库实际使用的 space/version 批量拉取 ZCM 版本、模块与产品分支（前端缓存，不入库） */
export function useRepoContextCascade(
  synapseApiBase: string,
  enabled: boolean,
  repositories: Repository[],
  productSpace: string,
  productVersion: string,
): {
  getCascade: (space: string, version: string) => RepoCascadeSnapshot;
  getCascadeForRepo: (repo: Repository) => RepoCascadeSnapshot;
} {
  const { t } = useTranslation();
  const [versionsBySpace, setVersionsBySpace] = useState<Record<string, VersionCacheEntry>>({});
  const [modulesByKey, setModulesByKey] = useState<Record<string, ModuleCacheEntry>>({});
  const [prodBranchByVersion, setProdBranchByVersion] = useState<Record<string, ProdBranchCacheEntry>>({});
  const versionFetchStarted = useRef<Set<string>>(new Set());
  const moduleFetchStarted = useRef<Set<string>>(new Set());
  const prodBranchFetchStarted = useRef<Set<string>>(new Set());

  const spacesNeeded = useMemo(() => {
    if (!enabled) return [] as string[];
    const set = new Set<string>();
    for (const repo of repositories) {
      const { space } = getRepoEffectiveSpaceVersion(repo, productSpace, productVersion);
      if (space && parseProjectIdFromSpaceValue(space) != null) set.add(space);
    }
    if (productSpace && parseProjectIdFromSpaceValue(productSpace) != null) {
      set.add(productSpace);
    }
    return [...set];
  }, [enabled, repositories, productSpace, productVersion]);

  const moduleKeysNeeded = useMemo(() => {
    if (!enabled) return [] as string[];
    const set = new Set<string>();
    for (const repo of repositories) {
      const { space, version } = getRepoEffectiveSpaceVersion(repo, productSpace, productVersion);
      if (parseProjectIdFromSpaceValue(space) == null || parseCompositeLeadingId(version) == null) continue;
      set.add(moduleKeyFromSpaceVersion(space, version));
    }
    const pid = parseProjectIdFromSpaceValue(productSpace);
    const vid = parseCompositeLeadingId(productVersion);
    if (pid != null && vid != null) {
      set.add(moduleKeyFromSpaceVersion(productSpace, productVersion));
    }
    return [...set];
  }, [enabled, repositories, productSpace, productVersion]);

  const versionsNeeded = useMemo(() => {
    if (!enabled) return [] as string[];
    const set = new Set<string>();
    for (const repo of repositories) {
      const { version } = getRepoEffectiveSpaceVersion(repo, productSpace, productVersion);
      if (parseCompositeLeadingId(version) != null) set.add(version);
    }
    if (parseCompositeLeadingId(productVersion) != null) set.add(productVersion);
    return [...set];
  }, [enabled, repositories, productSpace, productVersion]);

  useEffect(() => {
    if (!enabled) return;
    for (const space of spacesNeeded) {
      if (versionFetchStarted.current.has(space)) continue;
      versionFetchStarted.current.add(space);
      setVersionsBySpace((prev) => ({ ...prev, [space]: { options: [], loading: true } }));
      fetchZcmProductList(synapseApiBase)
        .then((rows) => {
          setVersionsBySpace((prev) => ({
            ...prev,
            [space]: { options: zcmRowsToOptions(rows), loading: false },
          }));
        })
        .catch((e) => {
          console.error(e);
          versionFetchStarted.current.delete(space);
          setVersionsBySpace((prev) => ({ ...prev, [space]: { options: [], loading: false } }));
          toast.error(t("workbench.products.modal.versionLoadFailed"));
        });
    }
  }, [enabled, spacesNeeded, synapseApiBase, t]);

  useEffect(() => {
    if (!enabled) return;
    for (const key of moduleKeysNeeded) {
      if (moduleFetchStarted.current.has(key)) continue;
      const sep = key.indexOf("\0");
      const space = key.slice(0, sep);
      const version = key.slice(sep + 1);
      const pid = parseProjectIdFromSpaceValue(space);
      const vid = parseCompositeLeadingId(version);
      if (pid == null || vid == null) continue;
      moduleFetchStarted.current.add(key);
      setModulesByKey((prev) => ({ ...prev, [key]: { options: [], rows: [], loading: true } }));
      fetchModuleNameList(synapseApiBase, pid, vid)
        .then((rows) => {
          setModulesByKey((prev) => ({
            ...prev,
            [key]: { options: rows.map(moduleRowToOption), rows, loading: false },
          }));
        })
        .catch((e) => {
          console.error(e);
          moduleFetchStarted.current.delete(key);
          setModulesByKey((prev) => ({ ...prev, [key]: { options: [], rows: [], loading: false } }));
          toast.error(t("workbench.products.modal.moduleLoadFailed"));
        });
    }
  }, [enabled, moduleKeysNeeded, synapseApiBase, t]);

  useEffect(() => {
    if (!enabled) return;
    for (const version of versionsNeeded) {
      if (prodBranchFetchStarted.current.has(version)) continue;
      const vid = parseCompositeLeadingId(version);
      if (vid == null) continue;
      prodBranchFetchStarted.current.add(version);
      setProdBranchByVersion((prev) => ({ ...prev, [version]: { options: [], loading: true } }));
      fetchProductBranchList(synapseApiBase, vid)
        .then((rows) => {
          setProdBranchByVersion((prev) => ({
            ...prev,
            [version]: { options: prodBranchRowsToOptions(rows), loading: false },
          }));
        })
        .catch((e) => {
          console.error(e);
          prodBranchFetchStarted.current.delete(version);
          setProdBranchByVersion((prev) => ({ ...prev, [version]: { options: [], loading: false } }));
          toast.error(t("workbench.products.modal.prodBranchLoadFailed"));
        });
    }
  }, [enabled, synapseApiBase, t, versionsNeeded]);

  useEffect(() => {
    if (!enabled) {
      versionFetchStarted.current = new Set();
      moduleFetchStarted.current = new Set();
      prodBranchFetchStarted.current = new Set();
    }
  }, [enabled]);

  const getCascade = (space: string, version: string): RepoCascadeSnapshot => {
    const versionEntry = versionsBySpace[space];
    const moduleEntry = modulesByKey[moduleKeyFromSpaceVersion(space, version)];
    const prodBranchEntry = prodBranchByVersion[version];
    return {
      versionOptions: versionEntry?.options ?? [],
      moduleOptions: moduleEntry?.options ?? [],
      moduleRows: moduleEntry?.rows ?? [],
      prodBranchOptions: prodBranchEntry?.options ?? [],
      versionsLoading: versionEntry?.loading ?? false,
      modulesLoading: moduleEntry?.loading ?? false,
      prodBranchLoading: prodBranchEntry?.loading ?? false,
    };
  };

  const getCascadeForRepo = (repo: Repository): RepoCascadeSnapshot => {
    const { space, version } = getRepoEffectiveSpaceVersion(repo, productSpace, productVersion);
    return getCascade(space, version);
  };

  return { getCascade, getCascadeForRepo };
}

export function isRepoContextReady(space: string, version: string): boolean {
  return parseProjectIdFromSpaceValue(space) != null && parseCompositeLeadingId(version) != null;
}

export { EMPTY_CASCADE };
