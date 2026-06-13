import { toast } from "sonner";
import {
  fetchProductManageScope,
  type ProductManageScope,
} from "@/api/rdUnifiedService";
import type { Product } from "@/components/product/types";
import { IS_TAURI } from "@/platform";

export const OWNER_GUARD_MISSING_LOCAL = "owner_guard_missing_local";
export const OWNER_GUARD_MISSING_PRODUCT = "owner_guard_missing_product";
export const OWNER_GUARD_MISMATCH = "owner_guard_mismatch";

export type { ProductManageScope };

function isMissingLocalUserinfoError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("userinfo.encryption") ||
    msg.includes("userinfo") ||
    msg.includes("未找到") ||
    msg.includes("not found")
  );
}

function normalizeScope(raw: string | undefined): ProductManageScope {
  if (raw === "mine" || raw === "team" || raw === "department") return raw;
  return "none";
}

/**
 * 解析当前登录用户对该产品的管理范围。
 * 浏览器预览模式视为「我的」。
 */
export async function resolveProductManageScope(
  synapseApiBase: string,
  product: Product,
): Promise<ProductManageScope> {
  if (!IS_TAURI) return "mine";
  const stored = (product.ownerInfo ?? "").trim();
  if (!stored) {
    throw new Error(OWNER_GUARD_MISSING_PRODUCT);
  }
  try {
    const data = await fetchProductManageScope(synapseApiBase, stored);
    if (data.can_manage === true && data.scope) {
      return normalizeScope(data.scope);
    }
    if (data.can_manage === false) {
      return "none";
    }
    if (data.match === true) return "mine";
    return normalizeScope(data.scope);
  } catch (err) {
    if (isMissingLocalUserinfoError(err)) {
      throw new Error(OWNER_GUARD_MISSING_LOCAL);
    }
    throw err;
  }
}

/**
 * 校验当前用户是否可管理该产品（直接负责人、本团队或本部门继承）。
 */
export async function assertCanManageProduct(
  synapseApiBase: string,
  product: Product,
): Promise<ProductManageScope> {
  const scope = await resolveProductManageScope(synapseApiBase, product);
  if (scope === "none") {
    throw new Error(OWNER_GUARD_MISMATCH);
  }
  return scope;
}

/** @deprecated 使用 assertCanManageProduct；保留别名以兼容旧调用 */
export async function assertOwnerInfoMatchesProduct(
  synapseApiBase: string,
  product: Product,
): Promise<void> {
  await assertCanManageProduct(synapseApiBase, product);
}

/**
 * 浏览器预览模式下视为负责人；Tauri 下解析管理范围是否为「我的」。
 */
export async function isCurrentUserProductOwner(
  synapseApiBase: string,
  product: Product,
): Promise<boolean> {
  if (!IS_TAURI) return true;
  try {
    const scope = await resolveProductManageScope(synapseApiBase, product);
    return scope === "mine";
  } catch {
    return false;
  }
}

/** 是否具备产品管理权限（含团队/部门继承） */
export async function canManageProduct(
  synapseApiBase: string,
  product: Product,
): Promise<boolean> {
  if (!IS_TAURI) return true;
  try {
    const scope = await resolveProductManageScope(synapseApiBase, product);
    return scope !== "none";
  } catch {
    return false;
  }
}

type TKey = (key: string) => string;

export function toastOwnerInfoGuardError(t: TKey, err: unknown): void {
  const msg = err instanceof Error ? err.message : "";
  if (msg === OWNER_GUARD_MISSING_LOCAL) {
    toast.error(t("workbench.products.ownerInfoGuardMissingLocal"));
  } else if (msg === OWNER_GUARD_MISSING_PRODUCT) {
    toast.error(t("workbench.products.ownerInfoGuardMissingProduct"));
  } else if (msg === OWNER_GUARD_MISMATCH) {
    toast.error(t("workbench.products.ownerInfoGuardMismatch"));
  } else {
    toast.error(msg || t("workbench.products.ownerInfoGuardMismatch"));
  }
}
