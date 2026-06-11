import { toast } from "sonner";
import { checkOwnerInfoMatchesProduct } from "@/api/rdUnifiedService";
import type { Product } from "@/components/product/types";
import { IS_TAURI } from "@/platform";

export const OWNER_GUARD_MISSING_LOCAL = "owner_guard_missing_local";
export const OWNER_GUARD_MISSING_PRODUCT = "owner_guard_missing_product";
export const OWNER_GUARD_MISMATCH = "owner_guard_mismatch";

function isMissingLocalUserinfoError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("userinfo.encryption") ||
    msg.includes("userinfo") ||
    msg.includes("未找到") ||
    msg.includes("not found")
  );
}

/**
 * 校验本机 userinfo 与产品在研发统一服务中记录的 owner_info 是否为同一负责人：
 * 解密两侧 JSON，比对 ``name`` 与 ``employee_id``（工号）。
 */
export async function assertOwnerInfoMatchesProduct(
  synapseApiBase: string,
  product: Product,
): Promise<void> {
  const stored = (product.ownerInfo ?? "").trim();
  if (!stored) {
    throw new Error(OWNER_GUARD_MISSING_PRODUCT);
  }
  try {
    const match = await checkOwnerInfoMatchesProduct(synapseApiBase, stored);
    if (!match) {
      throw new Error(OWNER_GUARD_MISMATCH);
    }
  } catch (err) {
    if (err instanceof Error && err.message === OWNER_GUARD_MISMATCH) {
      throw err;
    }
    if (isMissingLocalUserinfoError(err)) {
      throw new Error(OWNER_GUARD_MISSING_LOCAL);
    }
    throw err;
  }
}

/**
 * 浏览器预览模式下视为负责人；Tauri 下与 assertOwnerInfoMatchesProduct 一致但不抛错。
 */
export async function isCurrentUserProductOwner(
  synapseApiBase: string,
  product: Product,
): Promise<boolean> {
  if (!IS_TAURI) return true;
  try {
    await assertOwnerInfoMatchesProduct(synapseApiBase, product);
    return true;
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
