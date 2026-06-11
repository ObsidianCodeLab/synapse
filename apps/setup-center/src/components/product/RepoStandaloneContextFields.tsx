import React from "react";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SearchableVirtualSelect, type SearchableOption } from "./SearchableVirtualSelect";
import { parseProjectIdFromSpaceValue } from "./ProductModal";

export type RepoStandaloneContextFieldsProps = {
  nonAssociated: boolean;
  onNonAssociatedChange: (checked: boolean) => void;
  projectSpace: string;
  onProjectSpaceChange: (value: string) => void;
  productVersion: string;
  onProductVersionChange: (value: string) => void;
  projectSpaces: SearchableOption[];
  versionOptions: SearchableOption[];
  versionsLoading?: boolean;
  /** 已入库/锁定行：只读展示，不可再改 */
  locked?: boolean;
  disabled?: boolean;
  switchId: string;
};

export function RepoStandaloneContextFields({
  nonAssociated,
  onNonAssociatedChange,
  projectSpace,
  onProjectSpaceChange,
  productVersion,
  onProductVersionChange,
  projectSpaces,
  versionOptions,
  versionsLoading = false,
  locked = false,
  disabled = false,
  switchId,
}: RepoStandaloneContextFieldsProps) {
  const { t } = useTranslation();
  const versionSelectDisabled =
    locked || disabled || !projectSpace || parseProjectIdFromSpaceValue(projectSpace) == null;

  return (
    <div className="col-span-12 space-y-3 rounded-md border border-dashed border-border/70 bg-muted/5 p-3">
      <div className="flex items-center gap-2">
        <Switch
          id={switchId}
          checked={nonAssociated}
          onCheckedChange={onNonAssociatedChange}
          disabled={locked || disabled}
        />
        <Label htmlFor={switchId} className="text-xs cursor-pointer">
          {t("workbench.products.modal.nonAssociatedProductRepo")}
        </Label>
      </div>
      <p className="text-[11px] text-muted-foreground m-0 leading-snug">
        {t("workbench.products.modal.nonAssociatedProductRepoHint")}
      </p>

      {nonAssociated ? (
        <div className="grid grid-cols-12 gap-3 pt-1">
          <div className="col-span-12 sm:col-span-6 space-y-1.5">
            <Label className="text-xs">
              {t("workbench.products.modal.projectSpace")} <span className="text-destructive">*</span>
            </Label>
            {locked ? (
              <Input
                readOnly
                tabIndex={-1}
                className="h-9 text-xs bg-muted/50 cursor-default"
                value={projectSpace || "—"}
              />
            ) : (
              <SearchableVirtualSelect
                value={projectSpace}
                onValueChange={onProjectSpaceChange}
                options={projectSpaces}
                placeholder={t("workbench.products.modal.projectSpacePlaceholder")}
                searchPlaceholder={t("workbench.products.modal.searchFilterPlaceholder")}
                emptyText={t("workbench.products.modal.projectSpaceEmpty")}
                disabled={disabled || projectSpaces.length === 0}
              />
            )}
          </div>
          <div className="col-span-12 sm:col-span-6 space-y-1.5">
            <Label className="text-xs">
              {t("workbench.products.modal.productVersion")} <span className="text-destructive">*</span>
            </Label>
            {locked ? (
              <Input
                readOnly
                tabIndex={-1}
                className="h-9 text-xs bg-muted/50 cursor-default"
                value={productVersion || "—"}
              />
            ) : (
              <SearchableVirtualSelect
                value={productVersion}
                onValueChange={onProductVersionChange}
                options={versionOptions}
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
        </div>
      ) : null}
    </div>
  );
}
