import React from 'react';
import { OrderManagement } from '../../components/rd-manage/OrderManagement';
import { ViewId } from '../../types';
import '../../components/rd-manage/rd-orders.css';

export function OrderManagementView({ 
  synapseApiBase, 
  onViewChange 
}: { 
  synapseApiBase?: string;
  onViewChange?: (view: ViewId) => void;
}) {
  return (
    <div className="rdOrdersRoot">
      <OrderManagement synapseApiBase={synapseApiBase} onViewChange={onViewChange} />
    </div>
  );
}
