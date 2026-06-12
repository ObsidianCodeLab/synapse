import React, { useEffect, useMemo, useState } from 'react';
import { Button } from 'antd';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { getProdInfo, type ProdInfoWireItem } from '@/api/rdUnifiedService';
import { submitMeetingRoomProd, type MeetingRoomDetail } from '@/api/meetingRoomService';
import { SearchableVirtualSelect } from '@/components/product/SearchableVirtualSelect';
import { displayIdPipeName } from '@/components/product/types';
import { IS_TAURI } from '@/platform';

type Props = {
  synapseApiBase: string;
  roomId: string;
  onSubmitted?: (detail: MeetingRoomDetail) => void;
};

export const MeetingProdSelectionPanel: React.FC<Props> = ({
  synapseApiBase,
  roomId,
  onSubmitted,
}) => {
  const { t } = useTranslation();
  const [prodCatalog, setProdCatalog] = useState<ProdInfoWireItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedProd, setSelectedProd] = useState('');

  useEffect(() => {
    if (!IS_TAURI) return;
    let cancelled = false;
    setLoading(true);
    void getProdInfo(synapseApiBase)
      .then((resp) => {
        if (cancelled) return;
        const raw = Array.isArray(resp.data) ? resp.data : [];
        setProdCatalog(raw.filter((row): row is ProdInfoWireItem => row != null));
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        toast.error(t('rdManageOrder.prodCatalogLoadFailed', { message: msg }));
        setProdCatalog([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [synapseApiBase, t]);

  const options = useMemo(
    () =>
      prodCatalog
        .map((row) => {
          const prod = (row.prod || '').trim();
          if (!prod) return null;
          const version = displayIdPipeName(row.version ?? '') || (row.version ?? '');
          const space = (row.space || '').trim();
          const label = [prod, version, space].filter(Boolean).join(' · ');
          return { value: prod, label };
        })
        .filter((x): x is { value: string; label: string } => x != null),
    [prodCatalog],
  );

  const handleSubmit = async () => {
    const prod = selectedProd.trim();
    if (!prod) {
      toast.error(t('rdManageOrder.selectProductRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const detail = await submitMeetingRoomProd(synapseApiBase, roomId, prod);
      toast.success(t('rdManageOrder.openMeetingSuccess'));
      onSubmitted?.(detail);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(t('rdManageOrder.openMeetingFailed', { message: msg }));
    } finally {
      setSubmitting(false);
    }
  };

  if (!IS_TAURI) {
    return (
      <p className="text-sm text-muted-foreground">{t('rdManageOrder.productOpenTauriOnly')}</p>
    );
  }

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-4 p-6">
      <div>
        <h3 className="text-base font-medium text-foreground">
          {t('rdManageOrder.selectProductForMeeting')}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('rdManageOrder.selectProductForMeetingHint')}
        </p>
      </div>
      <SearchableVirtualSelect
        value={selectedProd}
        onValueChange={setSelectedProd}
        options={options}
        placeholder={t('rdManageOrder.selectProductPlaceholder')}
        searchPlaceholder={t('workbench.products.modal.searchFilterPlaceholder')}
        emptyText={
          loading ? t('rdManageOrder.prodCatalogLoading') : t('rdManageOrder.prodCatalogEmpty')
        }
        disabled={loading || options.length === 0}
        isLoading={loading}
      />
      <Button type="primary" loading={submitting} onClick={() => void handleSubmit()}>
        {t('rdManageOrder.oneClickOpenMeeting')}
      </Button>
    </div>
  );
};
