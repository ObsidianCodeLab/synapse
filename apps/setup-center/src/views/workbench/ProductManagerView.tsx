import { ProductManager } from "../../components/product/ProductManager";

/**
 * 工作台 → 产品管理：壳层仅占位布局，业务在 {@link ProductManager}。
 */
export function ProductManagerView({ synapseApiBase }: { synapseApiBase?: string }) {
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <ProductManager synapseApiBase={synapseApiBase} />
    </div>
  );
}
